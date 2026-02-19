-- Snapshot usage cloud untuk monitoring kapasitas paket Supabase/Vercel di halaman admin settings.
-- Catatan:
-- - Data Vercel usage belum tersedia dari DB internal, sehingga tetap diinput manual dari dashboard Vercel.
-- - Fungsi ini hanya boleh diakses super admin.

CREATE OR REPLACE FUNCTION public.get_platform_usage_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, auth, storage
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_database_size_bytes bigint := 0;
  v_storage_size_bytes bigint := 0;
  v_active_users_30d integer := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'only_super_admin_can_access';
  END IF;

  SELECT pg_database_size(current_database()) INTO v_database_size_bytes;

  SELECT COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)
  INTO v_storage_size_bytes
  FROM storage.objects o;

  SELECT COUNT(*)::integer
  INTO v_active_users_30d
  FROM auth.users u
  WHERE u.last_sign_in_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'generated_at', now(),
    'database_size_bytes', COALESCE(v_database_size_bytes, 0),
    'storage_size_bytes', COALESCE(v_storage_size_bytes, 0),
    'active_users_30d', COALESCE(v_active_users_30d, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_usage_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_usage_snapshot() TO authenticated;
