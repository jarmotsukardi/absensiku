INSERT INTO public.system_settings (key, value, description, updated_at)
VALUES (
  'attendance_security',
  jsonb_build_object('native_app_code', 'AKN1'),
  'Pengaturan keamanan absensi GPS',
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = CASE
    WHEN NULLIF(BTRIM(COALESCE(public.system_settings.value->>'native_app_code', '')), '') IS NOT NULL
      THEN public.system_settings.value
    ELSE COALESCE(public.system_settings.value, '{}'::jsonb) || jsonb_build_object('native_app_code', 'AKN1')
  END,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.validate_attendance_security_context(
  p_employee_id UUID,
  p_client_context JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB := '{}'::JSONB;
  v_employee RECORD;
  v_mode TEXT := COALESCE(NULLIF(BTRIM(COALESCE(p_client_context->>'client_mode', '')), ''), 'unknown');
  v_device_id TEXT := NULLIF(BTRIM(COALESCE(p_client_context->>'device_id', '')), '');
  v_app_code TEXT := NULLIF(BTRIM(COALESCE(p_client_context->>'app_code', '')), '');
  v_android_version NUMERIC := NULL;
  v_min_android_version NUMERIC := NULL;
  v_native_app_code TEXT := NULL;
  v_block_all_browsers BOOLEAN := false;
  v_block_desktop_browser BOOLEAN := false;
  v_allow_iphone_safari BOOLEAN := true;
  v_enable_device_binding BOOLEAN := true;
BEGIN
  SELECT value::JSONB
  INTO v_settings
  FROM public.system_settings
  WHERE key = 'attendance_security'
  LIMIT 1;

  v_block_all_browsers := COALESCE((v_settings->>'block_all_browsers')::BOOLEAN, false);
  v_block_desktop_browser := COALESCE((v_settings->>'block_desktop_browser')::BOOLEAN, false);
  v_allow_iphone_safari := COALESCE((v_settings->>'allow_iphone_safari')::BOOLEAN, true);
  v_enable_device_binding := COALESCE((v_settings->>'enable_device_binding')::BOOLEAN, true);
  v_min_android_version := NULLIF(BTRIM(COALESCE(v_settings->>'min_android_version', '')), '')::NUMERIC;
  v_native_app_code := NULLIF(BTRIM(COALESCE(v_settings->>'native_app_code', '')), '');

  IF NULLIF(BTRIM(COALESCE(p_client_context->>'android_version', '')), '') IS NOT NULL THEN
    BEGIN
      v_android_version := (p_client_context->>'android_version')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_android_version := NULL;
    END;
  END IF;

  SELECT id, android_id
  INTO v_employee
  FROM public.employees
  WHERE id = p_employee_id
  FOR UPDATE;

  IF v_employee.id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'EMPLOYEE_NOT_FOUND',
      'message', 'Data pegawai tidak ditemukan'
    );
  END IF;

  IF v_block_all_browsers THEN
    IF v_mode <> 'android_webview' AND NOT (v_allow_iphone_safari AND v_mode = 'iphone_safari') THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'SECURITY_BROWSER_BLOCKED',
        'message', 'Absensi hanya diizinkan melalui aplikasi internal/WebView'
      );
    END IF;
  END IF;

  IF v_block_desktop_browser AND v_mode = 'desktop_browser' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'SECURITY_DESKTOP_BLOCKED',
      'message', 'Absensi tidak diizinkan melalui browser desktop'
    );
  END IF;

  IF v_mode = 'android_webview' AND v_native_app_code IS NOT NULL AND v_app_code IS DISTINCT FROM v_native_app_code THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'NATIVE_APP_CODE_INVALID',
      'message', 'Aplikasi tidak terverifikasi untuk proses absensi'
    );
  END IF;

  IF v_mode = 'android_webview' AND v_min_android_version IS NOT NULL AND v_android_version IS NOT NULL THEN
    IF v_android_version < v_min_android_version THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'ANDROID_VERSION_NOT_SUPPORTED',
        'message', 'Versi Android belum memenuhi minimum keamanan'
      );
    END IF;
  END IF;

  IF v_enable_device_binding THEN
    IF v_device_id IS NULL THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'DEVICE_ID_REQUIRED',
        'message', 'Perangkat belum teridentifikasi untuk proses absensi'
      );
    END IF;

    IF v_employee.android_id IS NULL OR BTRIM(v_employee.android_id) = '' THEN
      UPDATE public.employees
      SET
        android_id = v_device_id,
        updated_at = now()
      WHERE id = p_employee_id;
    ELSIF v_employee.android_id <> v_device_id THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'DEVICE_BINDING_MISMATCH',
        'message', 'Perangkat berbeda dari yang terdaftar'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true
  );
END;
$$;
