-- Buat fungsi untuk menyalin data default dari tenant template (Maluku Tengah)
CREATE OR REPLACE FUNCTION public.copy_default_tenant_data(new_tenant_id UUID, template_tenant_id UUID DEFAULT 'ba7603b1-6827-4370-ae86-2e70dc5b09d5')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Copy work_hours
    INSERT INTO work_hours (tenant_id, day_of_week, time_in, time_out, institution_type, is_active)
    SELECT new_tenant_id, day_of_week, time_in, time_out, institution_type, is_active
    FROM work_hours
    WHERE tenant_id = template_tenant_id;

    -- Copy work_holidays for current year and next year
    INSERT INTO work_holidays (tenant_id, year, month, dates, description, institution_type)
    SELECT new_tenant_id, year, month, dates, description, institution_type
    FROM work_holidays
    WHERE tenant_id = template_tenant_id
    AND year >= EXTRACT(YEAR FROM CURRENT_DATE);

    -- Copy absence_limits
    INSERT INTO absence_limits (tenant_id, warning_type, max_days, description, is_active)
    SELECT new_tenant_id, warning_type, max_days, description, is_active
    FROM absence_limits
    WHERE tenant_id = template_tenant_id;
END;
$$;

-- Update trigger handle_new_organization_owner untuk menyalin data default untuk pemerintah_daerah
CREATE OR REPLACE FUNCTION public.handle_new_organization_owner()
RETURNS trigger
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

    -- Copy default data from Maluku Tengah for pemerintah_daerah
    IF org_type = 'pemerintah_daerah' THEN
        PERFORM copy_default_tenant_data(new_tenant_id);
    END IF;
    
    RETURN NEW;
END;
$$;