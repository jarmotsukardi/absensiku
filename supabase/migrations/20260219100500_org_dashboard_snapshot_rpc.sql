-- Snapshot cache for Org Dashboard KPI.
-- Tujuan: menurunkan beban query berat per-load di /org/dashboard dan
-- menunda refresh 1-5 menit saat jam sibuk absensi.

CREATE TABLE IF NOT EXISTS public.org_dashboard_snapshots (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count_mode TEXT NOT NULL DEFAULT 'snapshot',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE public.org_dashboard_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.org_dashboard_snapshots FROM anon;
REVOKE ALL ON TABLE public.org_dashboard_snapshots FROM authenticated;

CREATE OR REPLACE FUNCTION public.refresh_org_dashboard_snapshot(
  p_tenant_id UUID
)
RETURNS TABLE (
  payload JSONB,
  computed_at TIMESTAMPTZ,
  count_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE;
  v_seven_days_ago DATE := ((NOW() AT TIME ZONE 'Asia/Jakarta')::DATE - INTERVAL '6 day')::DATE;
  v_thirty_days_ago TIMESTAMPTZ := NOW() - INTERVAL '30 days';

  v_office_ids UUID[] := ARRAY[]::UUID[];
  v_employee_ids UUID[] := ARRAY[]::UUID[];

  v_total_employees BIGINT := 0;
  v_linked_employees BIGINT := 0;
  v_total_offices BIGINT := 0;
  v_today_present BIGINT := 0;
  v_pending_overtime BIGINT := 0;
  v_pending_leaves BIGINT := 0;
  v_pending_wfh BIGINT := 0;
  v_expired_invitations BIGINT := 0;

  v_avg_approval_hours NUMERIC := 0;
  v_processed_count BIGINT := 0;
  v_approved_count BIGINT := 0;
  v_rejected_count BIGINT := 0;

  v_attendance_trend_counts JSONB := '[]'::jsonb;
  v_payload JSONB := '{}'::jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: tenant_id wajib diisi';
  END IF;

  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[])
  INTO v_office_ids
  FROM public.offices
  WHERE tenant_id = p_tenant_id;

  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[])
  INTO v_employee_ids
  FROM public.employees
  WHERE tenant_id = p_tenant_id;

  SELECT COUNT(*)::BIGINT
  INTO v_total_employees
  FROM public.employees
  WHERE tenant_id = p_tenant_id
    AND is_active IS TRUE;

  SELECT COUNT(*)::BIGINT
  INTO v_linked_employees
  FROM public.employees
  WHERE tenant_id = p_tenant_id
    AND is_active IS TRUE
    AND user_id IS NOT NULL;

  SELECT COUNT(*)::BIGINT
  INTO v_total_offices
  FROM public.offices
  WHERE tenant_id = p_tenant_id
    AND is_active IS TRUE;

  IF COALESCE(ARRAY_LENGTH(v_office_ids, 1), 0) > 0 THEN
    SELECT COUNT(*)::BIGINT
    INTO v_today_present
    FROM public.attendance_records_partitioned
    WHERE office_id = ANY(v_office_ids)
      AND date = v_today;

    SELECT COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'date', TO_CHAR(src.date_key, 'YYYY-MM-DD'),
          'present', src.present_count
        )
        ORDER BY src.date_key
      ),
      '[]'::jsonb
    )
    INTO v_attendance_trend_counts
    FROM (
      SELECT
        date::DATE AS date_key,
        COUNT(*)::INT AS present_count
      FROM public.attendance_records_partitioned
      WHERE office_id = ANY(v_office_ids)
        AND date >= v_seven_days_ago
        AND date <= v_today
      GROUP BY date::DATE
    ) src;
  END IF;

  SELECT COUNT(*)::BIGINT
  INTO v_pending_overtime
  FROM public.overtime_requests
  WHERE tenant_id = p_tenant_id
    AND status = 'pending';

  IF COALESCE(ARRAY_LENGTH(v_employee_ids, 1), 0) > 0 THEN
    SELECT COUNT(*)::BIGINT
    INTO v_pending_leaves
    FROM public.leave_requests
    WHERE employee_id = ANY(v_employee_ids)
      AND status = 'menunggu';

    SELECT COUNT(*)::BIGINT
    INTO v_pending_wfh
    FROM public.wfh_requests
    WHERE employee_id = ANY(v_employee_ids)
      AND status = 'menunggu';
  END IF;

  SELECT COUNT(*)::BIGINT
  INTO v_expired_invitations
  FROM public.employee_invitations
  WHERE tenant_id = p_tenant_id
    AND status = 'pending'
    AND expires_at < NOW();

  WITH approval_rows AS (
    SELECT
      lr.created_at,
      lr.approved_at,
      LOWER(COALESCE(lr.status::TEXT, '')) AS status
    FROM public.leave_requests lr
    WHERE lr.created_at >= v_thirty_days_ago
      AND COALESCE(ARRAY_LENGTH(v_employee_ids, 1), 0) > 0
      AND lr.employee_id = ANY(v_employee_ids)

    UNION ALL

    SELECT
      wr.created_at,
      wr.approved_at,
      LOWER(COALESCE(wr.status::TEXT, '')) AS status
    FROM public.wfh_requests wr
    WHERE wr.created_at >= v_thirty_days_ago
      AND COALESCE(ARRAY_LENGTH(v_employee_ids, 1), 0) > 0
      AND wr.employee_id = ANY(v_employee_ids)

    UNION ALL

    SELECT
      otr.created_at,
      otr.approved_at,
      LOWER(COALESCE(otr.status::TEXT, '')) AS status
    FROM public.overtime_requests otr
    WHERE otr.created_at >= v_thirty_days_ago
      AND otr.tenant_id = p_tenant_id
  ),
  filtered AS (
    SELECT
      status,
      EXTRACT(EPOCH FROM (approved_at - created_at)) / 3600.0 AS approval_hours
    FROM approval_rows
    WHERE status IN ('approved', 'disetujui', 'rejected', 'ditolak')
      AND created_at IS NOT NULL
      AND approved_at IS NOT NULL
      AND approved_at >= created_at
  )
  SELECT
    COALESCE(AVG(approval_hours), 0),
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status IN ('approved', 'disetujui'))::BIGINT,
    COUNT(*) FILTER (WHERE status IN ('rejected', 'ditolak'))::BIGINT
  INTO
    v_avg_approval_hours,
    v_processed_count,
    v_approved_count,
    v_rejected_count
  FROM filtered;

  v_payload := JSONB_BUILD_OBJECT(
    'stats', JSONB_BUILD_OBJECT(
      'totalEmployees', v_total_employees,
      'linkedEmployees', v_linked_employees,
      'totalOffices', v_total_offices,
      'todayPresent', v_today_present,
      'pendingOvertime', v_pending_overtime,
      'pendingLeaves', v_pending_leaves,
      'pendingWfh', v_pending_wfh,
      'expiredInvitations', v_expired_invitations
    ),
    'attendance_trend_counts', COALESCE(v_attendance_trend_counts, '[]'::jsonb),
    'approval_performance', JSONB_BUILD_OBJECT(
      'avgApprovalHours', ROUND(v_avg_approval_hours::NUMERIC, 1),
      'processedCount', v_processed_count,
      'approvedCount', v_approved_count,
      'rejectedCount', v_rejected_count
    )
  );

  INSERT INTO public.org_dashboard_snapshots (
    tenant_id,
    payload,
    computed_at,
    count_mode,
    updated_at
  )
  VALUES (
    p_tenant_id,
    v_payload,
    v_now,
    'snapshot',
    v_now
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    payload = EXCLUDED.payload,
    computed_at = EXCLUDED.computed_at,
    count_mode = EXCLUDED.count_mode,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY
  SELECT v_payload, v_now, 'snapshot'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_dashboard_snapshot(
  p_tenant_id UUID,
  p_force_refresh BOOLEAN DEFAULT FALSE,
  p_max_age_seconds INTEGER DEFAULT 180
)
RETURNS TABLE (
  payload JSONB,
  computed_at TIMESTAMPTZ,
  source TEXT,
  count_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_auth_role TEXT := LOWER(COALESCE((auth.jwt() ->> 'role'), ''));
  v_max_age_seconds INTEGER := GREATEST(COALESCE(p_max_age_seconds, 180), 30);
  v_cached public.org_dashboard_snapshots%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: tenant_id wajib diisi';
  END IF;

  IF v_auth_role = 'service_role' THEN
    v_allowed := TRUE;
  ELSIF v_uid IS NOT NULL THEN
    v_allowed := public.is_super_admin(v_uid)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = v_uid
          AND ur.role = 'admin_instansi'
          AND ur.tenant_id = p_tenant_id
      );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'FORBIDDEN: tidak berhak mengakses snapshot dashboard organisasi';
  END IF;

  SELECT *
  INTO v_cached
  FROM public.org_dashboard_snapshots
  WHERE tenant_id = p_tenant_id;

  IF NOT COALESCE(p_force_refresh, FALSE)
     AND public.is_dashboard_peak_hour(NOW())
     AND v_cached.computed_at IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_cached.payload,
      v_cached.computed_at,
      'peak_cache'::TEXT,
      COALESCE(v_cached.count_mode, 'snapshot');
    RETURN;
  END IF;

  IF NOT COALESCE(p_force_refresh, FALSE)
     AND v_cached.computed_at IS NOT NULL
     AND v_cached.computed_at >= NOW() - MAKE_INTERVAL(secs => v_max_age_seconds) THEN
    RETURN QUERY
    SELECT
      v_cached.payload,
      v_cached.computed_at,
      'cache'::TEXT,
      COALESCE(v_cached.count_mode, 'snapshot');
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fresh.payload,
    fresh.computed_at,
    'fresh'::TEXT,
    fresh.count_mode
  FROM public.refresh_org_dashboard_snapshot(p_tenant_id) fresh;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_recent_org_dashboard_snapshots_if_off_peak()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_processed INTEGER := 0;
  v_failed INTEGER := 0;
BEGIN
  IF public.is_dashboard_peak_hour(NOW()) THEN
    RETURN JSONB_BUILD_OBJECT(
      'status', 'skipped_peak_hour',
      'processed', 0,
      'failed', 0
    );
  END IF;

  FOR v_row IN
    SELECT t.id
    FROM public.tenants t
    WHERE COALESCE(t.is_active, TRUE) IS TRUE
      AND (
        EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.tenant_id = t.id
            AND s.status IN ('active', 'trial')
        )
        OR EXISTS (
          SELECT 1
          FROM public.org_dashboard_snapshots ods
          WHERE ods.tenant_id = t.id
        )
      )
    ORDER BY COALESCE(t.updated_at, t.created_at, NOW()) DESC
    LIMIT 25
  LOOP
    BEGIN
      PERFORM public.refresh_org_dashboard_snapshot(v_row.id);
      v_processed := v_processed + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'status', 'refreshed',
    'processed', v_processed,
    'failed', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_org_dashboard_snapshot(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_org_dashboard_snapshot(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_org_dashboard_snapshot(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_org_dashboard_snapshot(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_recent_org_dashboard_snapshots_if_off_peak() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_recent_org_dashboard_snapshots_if_off_peak() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_recent_org_dashboard_snapshots_if_off_peak() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_recent_org_dashboard_snapshots_if_off_peak() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_org_dashboard_snapshot(UUID, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_dashboard_snapshot(UUID, BOOLEAN, INTEGER) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'org-dashboard-snapshot-5m') THEN
      PERFORM cron.unschedule('org-dashboard-snapshot-5m');
    END IF;

    PERFORM cron.schedule(
      'org-dashboard-snapshot-5m',
      '*/5 * * * *',
      'SELECT public.refresh_recent_org_dashboard_snapshots_if_off_peak();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- pg_cron opsional; jangan blok migration jika ekstensi belum aktif.
    RAISE NOTICE 'org-dashboard-snapshot-5m schedule skipped: %', SQLERRM;
END;
$$;

-- Warm snapshot awal untuk tenant aktif/trial terbaru.
DO $$
BEGIN
  PERFORM public.refresh_org_dashboard_snapshot(t.id)
  FROM (
    SELECT t.id
    FROM public.tenants t
    WHERE COALESCE(t.is_active, TRUE) IS TRUE
    ORDER BY COALESCE(t.updated_at, t.created_at, NOW()) DESC
    LIMIT 10
  ) t;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'org-dashboard initial warm skipped: %', SQLERRM;
END;
$$;
