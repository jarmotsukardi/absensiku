-- Create WFH schedules table (jadwal WFH yang ditentukan admin)
CREATE TABLE public.wfh_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  opd_id UUID REFERENCES public.opd(id) ON DELETE CASCADE,
  work_unit_id UUID REFERENCES public.work_units(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  day_of_week INTEGER, -- 0=Sunday, 1=Monday, etc. NULL means applies to all days
  specific_date DATE, -- For specific date WFH
  start_date DATE, -- For date range WFH
  end_date DATE,
  is_recurring BOOLEAN DEFAULT false, -- If true, uses day_of_week
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create WFH requests table (pengajuan WFH dari pegawai)
CREATE TABLE public.wfh_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wfh_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wfh_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for wfh_schedules
CREATE POLICY "Admin can manage wfh_schedules" ON public.wfh_schedules
  FOR ALL USING (
    is_super_admin(auth.uid()) OR 
    ((tenant_id = get_user_tenant_id(auth.uid())) AND has_role(auth.uid(), 'admin_instansi'::app_role))
  );

CREATE POLICY "Users can view wfh_schedules in their tenant" ON public.wfh_schedules
  FOR SELECT USING (
    (tenant_id = get_user_tenant_id(auth.uid())) OR is_super_admin(auth.uid())
  );

-- RLS policies for wfh_requests
CREATE POLICY "Users can create their own wfh_requests" ON public.wfh_requests
  FOR INSERT WITH CHECK (employee_id = get_user_employee_id(auth.uid()));

CREATE POLICY "Users can view their own wfh_requests" ON public.wfh_requests
  FOR SELECT USING (
    (employee_id = get_user_employee_id(auth.uid())) OR 
    is_super_admin(auth.uid()) OR 
    has_role(auth.uid(), 'admin_instansi'::app_role) OR
    has_role(auth.uid(), 'atasan'::app_role)
  );

CREATE POLICY "Users can update their own pending requests" ON public.wfh_requests
  FOR UPDATE USING (
    ((employee_id = get_user_employee_id(auth.uid())) AND (status = 'menunggu')) OR
    is_super_admin(auth.uid()) OR 
    has_role(auth.uid(), 'admin_instansi'::app_role) OR
    has_role(auth.uid(), 'atasan'::app_role)
  );

-- Create triggers for updated_at
CREATE TRIGGER update_wfh_schedules_updated_at
  BEFORE UPDATE ON public.wfh_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wfh_requests_updated_at
  BEFORE UPDATE ON public.wfh_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();