-- Update function to handle employee signup (not create new tenant)
CREATE OR REPLACE FUNCTION public.handle_new_organization_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_tenant_id UUID;
    new_employee_id UUID;
    org_type organization_type;
    tenant_code TEXT;
    is_employee_signup BOOLEAN;
BEGIN
    -- Check if this is an employee signup (has invite_type = 'employee' or no tenant_name)
    -- If tenant_name is not provided, this is likely an employee signup through invitation
    -- In that case, we should NOT create a new tenant
    is_employee_signup := (NEW.raw_user_meta_data->>'tenant_name' IS NULL OR NEW.raw_user_meta_data->>'tenant_name' = '');
    
    -- If this is an employee signup, skip tenant creation
    IF is_employee_signup THEN
        RETURN NEW;
    END IF;

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

    -- Copy default data from Maluku Tengah for pemerintah_daerah
    IF org_type = 'pemerintah_daerah' THEN
        PERFORM copy_default_tenant_data(new_tenant_id);
    END IF;
    
    RETURN NEW;
END;
$function$;