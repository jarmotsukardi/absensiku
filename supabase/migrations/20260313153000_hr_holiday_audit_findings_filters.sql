DROP FUNCTION IF EXISTS public.get_hr_holiday_audit_findings(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_hr_holiday_audit_findings(
  p_tenant_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 8,
  p_finding_type text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  finding_id text,
  finding_type text,
  severity text,
  message text,
  finding_date date,
  finding_tenant_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 8), 1), 100);
  v_offset integer := (v_page - 1) * v_page_size;
  v_type_filter text := nullif(trim(coalesce(p_finding_type, '')), '');
  v_severity_filter text := nullif(trim(coalesce(p_severity, '')), '');
  v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'only_super_admin_can_access';
  END IF;

  RETURN QUERY
  WITH scoped_holidays AS (
    SELECT
      h.id,
      h.date,
      h.name,
      h.tenant_id,
      h.is_national,
      t.name AS tenant_name,
      t.code AS tenant_code
    FROM public.holidays h
    LEFT JOIN public.tenants t ON t.id = h.tenant_id
    WHERE
      p_tenant_id IS NULL
      OR h.tenant_id = p_tenant_id
      OR h.tenant_id IS NULL
  ),
  duplicate_groups AS (
    SELECT
      h.date,
      h.tenant_id,
      lower(trim(h.name)) AS normalized_name,
      max(h.name) AS sample_name,
      max(h.tenant_name) AS tenant_name,
      max(h.tenant_code) AS tenant_code,
      count(*)::bigint AS duplicate_count
    FROM scoped_holidays h
    GROUP BY h.date, h.tenant_id, lower(trim(h.name))
    HAVING count(*) > 1
  ),
  findings AS (
    SELECT
      format('global-%s', h.id) AS finding_id,
      'global_mismatch'::text AS finding_type,
      'warning'::text AS severity,
      'Hari libur global tanpa flag nasional yang konsisten.'::text AS message,
      h.date AS finding_date,
      h.tenant_id AS finding_tenant_id,
      lower(
        concat_ws(
          ' ',
          h.name,
          h.date::text,
          'global mismatch',
          'warning',
          coalesce(h.tenant_name, 'global'),
          coalesce(h.tenant_code, '')
        )
      ) AS search_document
    FROM scoped_holidays h
    WHERE h.tenant_id IS NULL AND (h.is_national = false OR h.is_national IS NULL)

    UNION ALL

    SELECT
      format('tenant-national-%s', h.id) AS finding_id,
      'tenant_marked_national'::text AS finding_type,
      'warning'::text AS severity,
      'Hari libur tenant ditandai nasional. Periksa klasifikasi.'::text AS message,
      h.date AS finding_date,
      h.tenant_id AS finding_tenant_id,
      lower(
        concat_ws(
          ' ',
          h.name,
          h.date::text,
          'tenant nasional',
          'tenant marked national',
          'warning',
          coalesce(h.tenant_name, ''),
          coalesce(h.tenant_code, '')
        )
      ) AS search_document
    FROM scoped_holidays h
    WHERE h.tenant_id IS NOT NULL AND h.is_national = true

    UNION ALL

    SELECT
      format(
        'dup-%s-%s-%s',
        dg.date,
        coalesce(dg.tenant_id::text, 'global'),
        md5(dg.normalized_name)
      ) AS finding_id,
      'duplicate_holiday'::text AS finding_type,
      'critical'::text AS severity,
      format('Duplikasi %s entri hari libur dengan tanggal & nama sama.', dg.duplicate_count)::text AS message,
      dg.date AS finding_date,
      dg.tenant_id AS finding_tenant_id,
      lower(
        concat_ws(
          ' ',
          dg.sample_name,
          dg.date::text,
          'duplicate holiday',
          'duplikasi',
          'critical',
          coalesce(dg.tenant_name, 'global'),
          coalesce(dg.tenant_code, '')
        )
      ) AS search_document
    FROM duplicate_groups dg
  ),
  filtered_findings AS (
    SELECT
      f.finding_id,
      f.finding_type,
      f.severity,
      f.message,
      f.finding_date,
      f.finding_tenant_id
    FROM findings f
    WHERE
      (v_type_filter IS NULL OR f.finding_type = v_type_filter)
      AND (v_severity_filter IS NULL OR f.severity = v_severity_filter)
      AND (v_search IS NULL OR f.search_document LIKE '%' || v_search || '%')
  ),
  ordered_findings AS (
    SELECT
      f.finding_id,
      f.finding_type,
      f.severity,
      f.message,
      f.finding_date,
      f.finding_tenant_id,
      count(*) OVER()::bigint AS total_count
    FROM filtered_findings f
    ORDER BY
      CASE WHEN f.severity = 'critical' THEN 0 ELSE 1 END,
      f.finding_date DESC NULLS LAST,
      f.finding_id
  )
  SELECT
    ofi.finding_id,
    ofi.finding_type,
    ofi.severity,
    ofi.message,
    ofi.finding_date,
    ofi.finding_tenant_id,
    ofi.total_count
  FROM ordered_findings ofi
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_hr_holiday_audit_findings(uuid, integer, integer, text, text, text) TO authenticated;
