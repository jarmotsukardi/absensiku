-- Create work_holidays table (libur kerja per jenis instansi)
CREATE TABLE public.work_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  institution_type TEXT NOT NULL DEFAULT 'pemerintahan',
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  dates TEXT NOT NULL, -- comma separated dates like "01,02,03"
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create work_hours table (jam kerja per jenis instansi dan hari)
CREATE TABLE public.work_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  institution_type TEXT NOT NULL DEFAULT 'pemerintahan',
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7), -- 1=Senin, 7=Minggu
  time_in TIME NOT NULL,
  time_out TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, institution_type, day_of_week)
);

-- Create absence_limits table (batas absen dan teguran)
CREATE TABLE public.absence_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_days INTEGER NOT NULL,
  warning_type TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.work_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_holidays
CREATE POLICY "Admin can manage work_holidays"
ON public.work_holidays FOR ALL
USING (is_super_admin(auth.uid()) OR (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role)));

CREATE POLICY "Users can view work_holidays in their tenant"
ON public.work_holidays FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- RLS Policies for work_hours
CREATE POLICY "Admin can manage work_hours"
ON public.work_hours FOR ALL
USING (is_super_admin(auth.uid()) OR (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role)));

CREATE POLICY "Users can view work_hours in their tenant"
ON public.work_hours FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- RLS Policies for absence_limits
CREATE POLICY "Admin can manage absence_limits"
ON public.absence_limits FOR ALL
USING (is_super_admin(auth.uid()) OR (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role)));

CREATE POLICY "Users can view absence_limits in their tenant"
ON public.absence_limits FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_work_holidays_updated_at
BEFORE UPDATE ON public.work_holidays
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_work_hours_updated_at
BEFORE UPDATE ON public.work_hours
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_absence_limits_updated_at
BEFORE UPDATE ON public.absence_limits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();