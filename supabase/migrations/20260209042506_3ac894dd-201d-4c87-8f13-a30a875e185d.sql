
-- Table untuk tracking stability streak per tenant
CREATE TABLE public.stability_streaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  streak_count INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  streak_started_at DATE,
  reached_target BOOLEAN DEFAULT false,
  reached_target_at TIMESTAMP WITH TIME ZONE,
  grace_period_end DATE,
  status TEXT NOT NULL DEFAULT 'tracking' CHECK (status IN ('tracking', 'ready_for_invoicing', 'invoiced', 'grace_period')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.stability_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage streaks" ON public.stability_streaks FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Admin can view own tenant streak" ON public.stability_streaks FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "System can upsert streaks" ON public.stability_streaks FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update streaks" ON public.stability_streaks FOR UPDATE USING (true);

-- Table untuk feedback & bug reports
CREATE TABLE public.feedback_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  reporter_name TEXT,
  reporter_role TEXT NOT NULL DEFAULT 'pegawai' CHECK (reporter_role IN ('admin_organisasi', 'pegawai')),
  feedback_type TEXT NOT NULL DEFAULT 'saran' CHECK (feedback_type IN ('bug', 'saran')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  message TEXT NOT NULL,
  screenshot_url TEXT,
  os_info TEXT,
  browser_info TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  resolution_notes TEXT,
  survey_day INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage feedback" ON public.feedback_reports FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Users can create feedback" ON public.feedback_reports FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view own feedback" ON public.feedback_reports FOR SELECT USING (user_id = auth.uid() OR is_super_admin(auth.uid()) OR (has_role(auth.uid(), 'admin_instansi'::app_role) AND tenant_id = get_user_tenant_id(auth.uid())));

-- Function to update streak based on attendance activity
CREATE OR REPLACE FUNCTION public.update_tenant_streak(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE;
  v_is_holiday BOOLEAN := false;
  v_day_of_week INTEGER;
  v_streak RECORD;
  v_check_date DATE;
BEGIN
  -- Get or create streak record
  INSERT INTO stability_streaks (tenant_id, streak_count, last_activity_date, streak_started_at)
  VALUES (p_tenant_id, 0, NULL, NULL)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT * INTO v_streak FROM stability_streaks WHERE tenant_id = p_tenant_id FOR UPDATE;
  
  -- If already reached target, skip
  IF v_streak.reached_target THEN
    RETURN;
  END IF;

  -- If already counted today, skip
  IF v_streak.last_activity_date = v_today THEN
    RETURN;
  END IF;

  -- Find the last workday before today (skip weekends and national holidays)
  v_check_date := v_today - INTERVAL '1 day';
  LOOP
    v_day_of_week := EXTRACT(DOW FROM v_check_date);
    -- Skip Saturday (6) and Sunday (0)
    IF v_day_of_week IN (0, 6) THEN
      v_check_date := v_check_date - INTERVAL '1 day';
      CONTINUE;
    END IF;
    -- Skip national holidays
    IF EXISTS (SELECT 1 FROM national_holidays WHERE date = v_check_date AND is_active = true) THEN
      v_check_date := v_check_date - INTERVAL '1 day';
      CONTINUE;
    END IF;
    EXIT;
  END LOOP;
  v_yesterday := v_check_date;

  -- Check if streak continues (last activity was yesterday workday) or resets
  IF v_streak.last_activity_date IS NULL OR v_streak.last_activity_date < v_yesterday THEN
    -- Reset streak
    UPDATE stability_streaks SET
      streak_count = 1,
      last_activity_date = v_today,
      streak_started_at = v_today,
      updated_at = now()
    WHERE tenant_id = p_tenant_id;
  ELSE
    -- Continue streak
    UPDATE stability_streaks SET
      streak_count = streak_count + 1,
      last_activity_date = v_today,
      reached_target = CASE WHEN streak_count + 1 >= 30 THEN true ELSE false END,
      reached_target_at = CASE WHEN streak_count + 1 >= 30 THEN now() ELSE NULL END,
      status = CASE WHEN streak_count + 1 >= 30 THEN 'ready_for_invoicing' ELSE 'tracking' END,
      grace_period_end = CASE WHEN streak_count + 1 >= 30 THEN (CURRENT_DATE + INTERVAL '7 days') ELSE NULL END,
      updated_at = now()
    WHERE tenant_id = p_tenant_id;
  END IF;
END;
$$;

-- Trigger: auto-update streak when attendance is recorded
CREATE OR REPLACE FUNCTION public.trigger_update_streak_on_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM employees WHERE id = NEW.employee_id;
  IF v_tenant_id IS NOT NULL THEN
    PERFORM update_tenant_streak(v_tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_streak_on_checkin
AFTER INSERT ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_streak_on_attendance();

-- Index for performance
CREATE INDEX idx_stability_streaks_tenant ON public.stability_streaks(tenant_id);
CREATE INDEX idx_stability_streaks_status ON public.stability_streaks(status);
CREATE INDEX idx_feedback_reports_tenant ON public.feedback_reports(tenant_id);
CREATE INDEX idx_feedback_reports_status ON public.feedback_reports(status);
CREATE INDEX idx_feedback_reports_type ON public.feedback_reports(feedback_type);
CREATE INDEX idx_feedback_reports_role ON public.feedback_reports(reporter_role);
