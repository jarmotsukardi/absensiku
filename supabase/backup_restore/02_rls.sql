-- ================================================
-- ABSENSIKU RLS POLICIES  
-- Generated: 2026-02-14T12:34:22.690Z
-- ================================================

-- Helper Functions
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin') $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.employees WHERE user_id = _user_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.get_user_employee_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.employees WHERE user_id = _user_id LIMIT 1 $$;

-- Tenants Policies
CREATE POLICY "Super admin full access on tenants" ON public.tenants FOR ALL USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant admin can view own tenant" ON public.tenants FOR SELECT USING (id = public.get_user_tenant_id(auth.uid()));

-- Employees Policies
CREATE POLICY "Admin can manage employees" ON public.employees FOR ALL USING (public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin_instansi')));
CREATE POLICY "Users can view own profile" ON public.employees FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.employees FOR UPDATE USING (user_id = auth.uid());

-- Attendance Policies
CREATE POLICY "Admin can manage attendance" ON public.attendance_records FOR ALL USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin_instansi'));
CREATE POLICY "Users can view own attendance" ON public.attendance_records FOR SELECT USING (employee_id = public.get_user_employee_id(auth.uid()));
CREATE POLICY "Users can insert own attendance" ON public.attendance_records FOR INSERT WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

-- (Include all other policies...)

-- ================================================
-- See full RLS export for complete policies
-- ================================================

