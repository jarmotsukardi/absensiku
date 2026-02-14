-- Function to handle new organization owner registration
CREATE OR REPLACE FUNCTION public.handle_new_organization_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_tenant_id UUID;
    new_employee_id UUID;
    org_type organization_type;
    tenant_code TEXT;
BEGIN
    -- Get organization type from user metadata
    org_type := COALESCE(
        (NEW.raw_user_meta_data->>'organization_type')::organization_type, 
        'perusahaan'::organization_type
    );
    
    -- Generate unique tenant code
    tenant_code := UPPER(SUBSTRING(NEW.raw_user_meta_data->>'tenant_name' FROM 1 FOR 3)) || 
                   TO_CHAR(NOW(), 'YYMM') || 
                   LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
    
    -- Create tenant (organization)
    INSERT INTO public.tenants (
        name,
        code,
        organization_type,
        email,
        is_active
    ) VALUES (
        COALESCE(NEW.raw_user_meta_data->>'tenant_name', 'Organisasi Baru'),
        tenant_code,
        org_type,
        NEW.email,
        true
    ) RETURNING id INTO new_tenant_id;
    
    -- Create trial subscription (max 3 employees, 30 days)
    INSERT INTO public.subscriptions (
        tenant_id,
        status,
        max_employees,
        start_date,
        end_date
    ) VALUES (
        new_tenant_id,
        'trial',
        3,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '30 days'
    );
    
    -- Create employee record for the owner
    INSERT INTO public.employees (
        tenant_id,
        user_id,
        name,
        email,
        nik,
        is_active
    ) VALUES (
        new_tenant_id,
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'Admin'),
        NEW.email,
        'ADMIN-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 6, '0'),
        true
    ) RETURNING id INTO new_employee_id;
    
    -- Assign admin_instansi role to the owner
    INSERT INTO public.user_roles (
        user_id,
        role,
        tenant_id
    ) VALUES (
        NEW.id,
        'admin_instansi',
        new_tenant_id
    );
    
    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_organization_owner();