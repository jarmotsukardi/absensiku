
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUM TYPES
-- =============================================

-- Role types
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin_instansi', 'atasan', 'pegawai');

-- Attendance status
CREATE TYPE public.attendance_status AS ENUM ('hadir', 'terlambat', 'pulang_cepat', 'tidak_hadir', 'izin', 'cuti', 'sakit', 'tugas_luar');

-- Leave request types
CREATE TYPE public.leave_type AS ENUM ('izin', 'cuti_tahunan', 'cuti_penting', 'cuti_lainnya', 'sakit', 'tugas_luar');

-- Request status
CREATE TYPE public.request_status AS ENUM ('menunggu', 'disetujui', 'ditolak');

-- Subscription status
CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'expired', 'cancelled');

-- =============================================
-- CORE TABLES
-- =============================================

-- Tenants (Instansi) table
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscriptions table
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status subscription_status DEFAULT 'trial',
    max_employees INTEGER DEFAULT 2,
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- OPD (Units/Departments) table
CREATE TABLE public.opd (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    parent_id UUID REFERENCES public.opd(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, code)
);

-- Offices (Kantor) table
CREATE TABLE public.offices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    opd_id UUID REFERENCES public.opd(id),
    name TEXT NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    radius_meters INTEGER DEFAULT 100,
    work_start_time TIME DEFAULT '08:00:00',
    work_end_time TIME DEFAULT '17:00:00',
    late_tolerance_minutes INTEGER DEFAULT 15,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Employees (Pegawai) table
CREATE TABLE public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    opd_id UUID REFERENCES public.opd(id),
    office_id UUID REFERENCES public.offices(id),
    supervisor_id UUID REFERENCES public.employees(id),
    nik TEXT NOT NULL,
    nip TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    position TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, nik)
);

-- User Roles table (for RBAC)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, tenant_id, role)
);

-- =============================================
-- ATTENDANCE & LEAVE TABLES
-- =============================================

-- Attendance Records table
CREATE TABLE public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES public.offices(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_time TIMESTAMPTZ,
    check_in_latitude DECIMAL(10, 8),
    check_in_longitude DECIMAL(11, 8),
    check_in_distance_meters DECIMAL(10, 2),
    check_out_time TIMESTAMPTZ,
    check_out_latitude DECIMAL(10, 8),
    check_out_longitude DECIMAL(11, 8),
    check_out_distance_meters DECIMAL(10, 2),
    status attendance_status DEFAULT 'tidak_hadir',
    notes TEXT,
    is_corrected BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, date)
);

-- Leave Requests table
CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    leave_type leave_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_half_day BOOLEAN DEFAULT false,
    reason TEXT NOT NULL,
    attachment_url TEXT,
    status request_status DEFAULT 'menunggu',
    approved_by UUID REFERENCES public.employees(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Attendance Corrections table
CREATE TABLE public.attendance_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id),
    correction_type TEXT NOT NULL,
    original_value TEXT,
    new_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    status request_status DEFAULT 'menunggu',
    approved_by UUID REFERENCES public.employees(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Holidays table
CREATE TABLE public.holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    name TEXT NOT NULL,
    is_national BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- AUDIT TRAIL TABLE (IMMUTABLE)
-- =============================================

CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id),
    user_id UUID REFERENCES auth.users(id),
    employee_id UUID REFERENCES public.employees(id),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ENABLE RLS ON ALL TABLES
-- =============================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- Function to get user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.employees WHERE user_id = _user_id LIMIT 1
$$;

-- Function to get user's employee_id
CREATE OR REPLACE FUNCTION public.get_user_employee_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE user_id = _user_id LIMIT 1
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Tenants policies
CREATE POLICY "Super admins can view all tenants" ON public.tenants
    FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own tenant" ON public.tenants
    FOR SELECT USING (id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Super admins can manage tenants" ON public.tenants
    FOR ALL USING (public.is_super_admin(auth.uid()));

-- Subscriptions policies
CREATE POLICY "Super admins can manage subscriptions" ON public.subscriptions
    FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Admin can view tenant subscription" ON public.subscriptions
    FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- OPD policies
CREATE POLICY "Users can view OPD in their tenant" ON public.opd
    FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admin can manage OPD" ON public.opd
    FOR ALL USING (
        public.is_super_admin(auth.uid()) OR
        (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
    );

-- Offices policies
CREATE POLICY "Users can view offices in their tenant" ON public.offices
    FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admin can manage offices" ON public.offices
    FOR ALL USING (
        public.is_super_admin(auth.uid()) OR
        (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
    );

-- Employees policies
CREATE POLICY "Users can view employees in their tenant" ON public.employees
    FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admin can manage employees" ON public.employees
    FOR ALL USING (
        public.is_super_admin(auth.uid()) OR
        (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
    );

CREATE POLICY "Users can update their own profile" ON public.employees
    FOR UPDATE USING (user_id = auth.uid());

-- User roles policies
CREATE POLICY "Super admin can manage all roles" ON public.user_roles
    FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own roles" ON public.user_roles
    FOR SELECT USING (user_id = auth.uid());

-- Attendance records policies
CREATE POLICY "Users can view attendance in their tenant" ON public.attendance_records
    FOR SELECT USING (
        employee_id = public.get_user_employee_id(auth.uid()) OR
        public.is_super_admin(auth.uid()) OR
        public.has_role(auth.uid(), 'admin_instansi') OR
        public.has_role(auth.uid(), 'atasan')
    );

CREATE POLICY "Users can insert their own attendance" ON public.attendance_records
    FOR INSERT WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Admin can manage attendance" ON public.attendance_records
    FOR ALL USING (
        public.is_super_admin(auth.uid()) OR
        public.has_role(auth.uid(), 'admin_instansi')
    );

-- Leave requests policies
CREATE POLICY "Users can view their own leave requests" ON public.leave_requests
    FOR SELECT USING (
        employee_id = public.get_user_employee_id(auth.uid()) OR
        public.is_super_admin(auth.uid()) OR
        public.has_role(auth.uid(), 'admin_instansi') OR
        public.has_role(auth.uid(), 'atasan')
    );

CREATE POLICY "Users can create their own leave requests" ON public.leave_requests
    FOR INSERT WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Users can update their own pending requests" ON public.leave_requests
    FOR UPDATE USING (
        (employee_id = public.get_user_employee_id(auth.uid()) AND status = 'menunggu') OR
        public.is_super_admin(auth.uid()) OR
        public.has_role(auth.uid(), 'admin_instansi') OR
        public.has_role(auth.uid(), 'atasan')
    );

-- Attendance corrections policies
CREATE POLICY "Users can view corrections" ON public.attendance_corrections
    FOR SELECT USING (
        employee_id = public.get_user_employee_id(auth.uid()) OR
        public.is_super_admin(auth.uid()) OR
        public.has_role(auth.uid(), 'admin_instansi')
    );

CREATE POLICY "Users can create corrections" ON public.attendance_corrections
    FOR INSERT WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Admin can manage corrections" ON public.attendance_corrections
    FOR ALL USING (
        public.is_super_admin(auth.uid()) OR
        public.has_role(auth.uid(), 'admin_instansi')
    );

-- Holidays policies
CREATE POLICY "Users can view holidays" ON public.holidays
    FOR SELECT USING (
        tenant_id IS NULL OR
        tenant_id = public.get_user_tenant_id(auth.uid()) OR
        public.is_super_admin(auth.uid())
    );

CREATE POLICY "Admin can manage holidays" ON public.holidays
    FOR ALL USING (
        public.is_super_admin(auth.uid()) OR
        (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
    );

-- Audit logs policies (read-only for admins)
CREATE POLICY "Admin can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        public.is_super_admin(auth.uid()) OR
        (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi'))
    );

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_opd_updated_at BEFORE UPDATE ON public.opd
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_offices_updated_at BEFORE UPDATE ON public.offices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance_records
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUDIT LOG TRIGGER FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    tenant UUID;
    emp_id UUID;
BEGIN
    -- Get tenant_id based on the table
    IF TG_TABLE_NAME = 'tenants' THEN
        tenant := COALESCE(NEW.id, OLD.id);
    ELSIF TG_TABLE_NAME IN ('opd', 'offices', 'employees', 'holidays') THEN
        tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    ELSIF TG_TABLE_NAME IN ('attendance_records', 'leave_requests', 'attendance_corrections') THEN
        SELECT e.tenant_id INTO tenant FROM public.employees e WHERE e.id = COALESCE(NEW.employee_id, OLD.employee_id);
    END IF;

    -- Get employee_id
    SELECT id INTO emp_id FROM public.employees WHERE user_id = auth.uid();

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (tenant_id, user_id, employee_id, action, table_name, record_id, new_values)
        VALUES (tenant, auth.uid(), emp_id, 'INSERT', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_logs (tenant_id, user_id, employee_id, action, table_name, record_id, old_values, new_values)
        VALUES (tenant, auth.uid(), emp_id, 'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_logs (tenant_id, user_id, employee_id, action, table_name, record_id, old_values)
        VALUES (tenant, auth.uid(), emp_id, 'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create audit triggers for important tables
CREATE TRIGGER audit_attendance_records AFTER INSERT OR UPDATE OR DELETE ON public.attendance_records
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_leave_requests AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_attendance_corrections AFTER INSERT OR UPDATE OR DELETE ON public.attendance_corrections
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_employees_tenant ON public.employees(tenant_id);
CREATE INDEX idx_employees_user ON public.employees(user_id);
CREATE INDEX idx_employees_opd ON public.employees(opd_id);
CREATE INDEX idx_employees_office ON public.employees(office_id);
CREATE INDEX idx_attendance_employee_date ON public.attendance_records(employee_id, date);
CREATE INDEX idx_attendance_date ON public.attendance_records(date);
CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);
