-- Atomic save for admin HR workspace profile plus audit trail.
CREATE OR REPLACE FUNCTION public.save_admin_hr_workspace_profile(
  p_profile JSONB
)
RETURNS TABLE (
  setting_id UUID,
  updated_at TIMESTAMPTZ,
  audit_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
  v_existing_profile JSONB;
  v_saved_id UUID;
  v_saved_updated_at TIMESTAMPTZ;
  v_audit_id UUID;
  v_action TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.is_super_admin(v_user_id) THEN
    RAISE EXCEPTION 'Tidak memiliki akses';
  END IF;

  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Payload profil HR tidak valid';
  END IF;

  SELECT ss.id, ss.value::JSONB
  INTO v_existing_id, v_existing_profile
  FROM public.system_settings ss
  WHERE ss.key = 'hr_workspace_profile_v1'
  LIMIT 1;

  INSERT INTO public.system_settings AS ss (
    key,
    value,
    description,
    updated_at,
    updated_by
  ) VALUES (
    'hr_workspace_profile_v1',
    p_profile,
    'Profil positioning workspace HR lintas tenant untuk panel superadmin.',
    now(),
    v_user_id
  )
  ON CONFLICT (key) DO UPDATE
  SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by
  RETURNING ss.id, ss.updated_at
  INTO v_saved_id, v_saved_updated_at;

  v_action := CASE
    WHEN v_existing_id IS NULL THEN 'CREATE_HR_WORKSPACE_PROFILE'
    ELSE 'UPDATE_HR_WORKSPACE_PROFILE'
  END;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    v_user_id,
    v_action,
    'system_settings',
    v_saved_id,
    CASE
      WHEN v_existing_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'key', 'hr_workspace_profile_v1',
        'profile', COALESCE(v_existing_profile, '{}'::JSONB)
      )
    END,
    jsonb_build_object(
      'key', 'hr_workspace_profile_v1',
      'profile', p_profile
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY
  SELECT v_saved_id, v_saved_updated_at, v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_admin_hr_workspace_profile(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_admin_hr_workspace_profile(JSONB) TO authenticated;
