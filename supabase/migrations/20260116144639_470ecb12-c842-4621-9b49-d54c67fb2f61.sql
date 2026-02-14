-- ============================================
-- FITUR AUTO-SHIFT BERBASIS SATUAN KERJA
-- ============================================

-- 1. Tabel Master Shift untuk konfigurasi shift
CREATE TABLE public.work_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_unit_id UUID REFERENCES public.work_units(id) ON DELETE CASCADE,
  shift_name TEXT NOT NULL,
  shift_order INTEGER NOT NULL DEFAULT 1,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  tolerance_minutes INTEGER DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, work_unit_id, shift_name)
);

-- 2. Tambah kolom enable_auto_shift pada work_units
ALTER TABLE public.work_units ADD COLUMN IF NOT EXISTS enable_auto_shift BOOLEAN DEFAULT false;
ALTER TABLE public.work_units ADD COLUMN IF NOT EXISTS auto_shift_tolerance_minutes INTEGER DEFAULT 30;

-- 3. Tambah kolom shift_id pada attendance_records untuk tracking shift yang dipilih
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.work_shifts(id);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS original_shift_id UUID REFERENCES public.work_shifts(id);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS shift_changed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS shift_change_reason TEXT;

-- 4. Tabel log perubahan shift untuk audit
CREATE TABLE public.shift_change_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  original_shift_id UUID REFERENCES public.work_shifts(id),
  new_shift_id UUID REFERENCES public.work_shifts(id),
  change_type TEXT NOT NULL, -- 'auto', 'manual_selection', 'admin_correction'
  change_reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES public.employees(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 5. Enable RLS
ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_change_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies untuk work_shifts
CREATE POLICY "Admin can manage work_shifts"
  ON public.work_shifts
  FOR ALL
  USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid())) AND has_role(auth.uid(), 'admin_instansi'::app_role)));

CREATE POLICY "Users can view work_shifts in their tenant"
  ON public.work_shifts
  FOR SELECT
  USING ((tenant_id = get_user_tenant_id(auth.uid())) OR is_super_admin(auth.uid()));

-- 7. RLS Policies untuk shift_change_logs
CREATE POLICY "Admin can view shift_change_logs"
  ON public.shift_change_logs
  FOR SELECT
  USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid())) AND has_role(auth.uid(), 'admin_instansi'::app_role)));

CREATE POLICY "System can insert shift_change_logs"
  ON public.shift_change_logs
  FOR INSERT
  WITH CHECK ((employee_id = get_user_employee_id(auth.uid())) OR is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role));

-- 8. Index untuk performa query
CREATE INDEX idx_work_shifts_tenant_work_unit ON public.work_shifts(tenant_id, work_unit_id);
CREATE INDEX idx_work_shifts_active ON public.work_shifts(is_active) WHERE is_active = true;
CREATE INDEX idx_shift_change_logs_employee ON public.shift_change_logs(employee_id);
CREATE INDEX idx_shift_change_logs_attendance ON public.shift_change_logs(attendance_id);
CREATE INDEX idx_attendance_records_shift ON public.attendance_records(shift_id);

-- 9. Trigger untuk update timestamp
CREATE TRIGGER update_work_shifts_updated_at
  BEFORE UPDATE ON public.work_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();