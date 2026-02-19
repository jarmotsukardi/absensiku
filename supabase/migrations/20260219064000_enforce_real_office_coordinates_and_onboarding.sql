-- Enforce real office coordinates and require office data at organization onboarding

CREATE OR REPLACE FUNCTION public.is_real_office_coordinate(p_lat NUMERIC, p_lng NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_lat IS NOT NULL
    AND p_lng IS NOT NULL
    AND p_lat BETWEEN -90 AND 90
    AND p_lng BETWEEN -180 AND 180
    AND NOT (p_lat = 0 AND p_lng = 0);
$$;

CREATE OR REPLACE FUNCTION public.validate_real_office_coordinates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    RAISE EXCEPTION 'Koordinat kantor wajib diisi';
  END IF;

  IF NOT public.is_real_office_coordinate(NEW.latitude, NEW.longitude) THEN
    RAISE EXCEPTION 'Koordinat kantor tidak valid. Gunakan koordinat real (bukan 0,0).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_real_office_coordinates ON public.offices;
CREATE TRIGGER trg_validate_real_office_coordinates
BEFORE INSERT OR UPDATE ON public.offices
FOR EACH ROW
EXECUTE FUNCTION public.validate_real_office_coordinates();

CREATE OR REPLACE FUNCTION public.handle_new_organization_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    new_tenant_id UUID;
    new_employee_id UUID;
    new_office_id UUID;
    org_type organization_type;
    tenant_code TEXT;
    is_employee_signup BOOLEAN;
    office_name TEXT;
    office_address TEXT;
    office_lat_text TEXT;
    office_lng_text TEXT;
    office_lat NUMERIC;
    office_lng NUMERIC;
BEGIN
    -- Check if this is an employee signup through invitation/join flow
    is_employee_signup := (
      NEW.raw_user_meta_data->>'tenant_name' IS NULL
      OR NEW.raw_user_meta_data->>'tenant_name' = ''
    );

    IF is_employee_signup THEN
        RETURN NEW;
    END IF;

    office_name := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'tenant_office_name', '')), '');
    office_address := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'tenant_office_address', '')), '');
    office_lat_text := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'tenant_office_latitude', '')), '');
    office_lng_text := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'tenant_office_longitude', '')), '');

    IF office_name IS NULL THEN
      RAISE EXCEPTION 'Nama kantor wajib diisi saat onboarding organisasi';
    END IF;
    IF office_lat_text IS NULL OR office_lng_text IS NULL THEN
      RAISE EXCEPTION 'Koordinat kantor wajib diisi saat onboarding organisasi';
    END IF;
    IF office_lat_text !~ '^-?[0-9]+(\.[0-9]+)?$' OR office_lng_text !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Format koordinat kantor tidak valid';
    END IF;

    office_lat := office_lat_text::NUMERIC;
    office_lng := office_lng_text::NUMERIC;

    IF NOT public.is_real_office_coordinate(office_lat, office_lng) THEN
      RAISE EXCEPTION 'Koordinat kantor tidak valid. Gunakan koordinat real (bukan 0,0).';
    END IF;

    org_type := COALESCE(
        (NEW.raw_user_meta_data->>'organization_type')::organization_type,
        'perusahaan'::organization_type
    );

    tenant_code := UPPER(SUBSTRING(NEW.raw_user_meta_data->>'tenant_name' FROM 1 FOR 3))
                   || TO_CHAR(NOW(), 'YYMM')
                   || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

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

    INSERT INTO public.offices (
      tenant_id,
      name,
      address,
      latitude,
      longitude,
      radius_meters,
      work_start_time,
      work_end_time,
      late_tolerance_minutes,
      is_active
    ) VALUES (
      new_tenant_id,
      office_name,
      office_address,
      office_lat,
      office_lng,
      100,
      '08:00:00'::TIME,
      '17:00:00'::TIME,
      15,
      true
    ) RETURNING id INTO new_office_id;

    INSERT INTO public.employees (
        tenant_id,
        user_id,
        name,
        email,
        nik,
        office_id,
        is_active
    ) VALUES (
        new_tenant_id,
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'Admin'),
        NEW.email,
        'ADMIN-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 6, '0'),
        new_office_id,
        true
    ) RETURNING id INTO new_employee_id;

    INSERT INTO public.user_roles (
        user_id,
        role,
        tenant_id
    ) VALUES (
        NEW.id,
        'admin_instansi',
        new_tenant_id
    );

    IF org_type = 'pemerintah_daerah' THEN
        PERFORM copy_default_tenant_data(new_tenant_id);
    END IF;

    RETURN NEW;
END;
$function$;
