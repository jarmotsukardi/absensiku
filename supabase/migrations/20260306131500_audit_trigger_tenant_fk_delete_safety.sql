BEGIN;

CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tenant UUID;
  emp_id UUID;
BEGIN
  -- Resolve tenant_id based on source table.
  IF TG_TABLE_NAME = 'tenants' THEN
    tenant := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME IN ('opd', 'offices', 'employees', 'holidays') THEN
    tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  ELSIF TG_TABLE_NAME IN ('attendance_records', 'leave_requests', 'attendance_corrections') THEN
    SELECT e.tenant_id
    INTO tenant
    FROM public.employees e
    WHERE e.id = COALESCE(NEW.employee_id, OLD.employee_id);
  END IF;

  -- Safety: when tenant row is already gone (cascade delete), keep audit row valid by nulling tenant_id.
  IF tenant IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant) THEN
    tenant := NULL;
  END IF;

  -- actor employee_id (nullable for service_role / system contexts)
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
$$;

COMMIT;

