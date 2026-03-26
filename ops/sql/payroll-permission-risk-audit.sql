-- Payroll Permission Risk Audit
-- Tujuan:
--   mendeteksi tenant yang berisiko mengalami denial payroll karena mode strict
--   efektif, admin organisasi aktif ada, tetapi assignment payroll aktif kosong.
--
-- Cara pakai:
--   set -a && source .env.online && set +a
--   psql "$SUPABASE_DB_URL" -f ops/sql/payroll-permission-risk-audit.sql
--
-- Catatan:
-- 1) Query ini read-only.
-- 2) effective_mode default ke "strict" jika row setting belum ada.
-- 3) Lakukan backup DB remote sebelum write lanjutan.

\echo ''
\echo '== 1) Ringkasan tenant berisiko =='

WITH tenant_admins AS (
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    COUNT(DISTINCT ur.user_id) FILTER (WHERE ur.role = 'admin_instansi') AS admin_count
  FROM public.tenants t
  LEFT JOIN public.user_roles ur
    ON ur.tenant_id = t.id
  GROUP BY t.id, t.name
),
tenant_payroll AS (
  SELECT
    pra.tenant_id,
    COUNT(DISTINCT pra.user_id) FILTER (WHERE pra.is_active) AS assigned_user_count,
    COUNT(*) FILTER (WHERE pra.is_active) AS active_assignment_count
  FROM public.payroll_role_assignments pra
  GROUP BY pra.tenant_id
),
payroll_mode AS (
  SELECT
    os.tenant_id,
    os.setting_value ->> 'mode' AS mode,
    true AS explicit_mode_setting
  FROM public.organization_settings os
  WHERE os.setting_key = 'org_payroll_access_mode_v1'
),
payment_policy AS (
  SELECT
    os.tenant_id,
    COALESCE((os.setting_value ->> 'paymentCommitted')::boolean, false) AS payment_committed
  FROM public.organization_settings os
  WHERE os.setting_key = 'org_hr_payroll_access_policy_v1'
),
workspace_modules AS (
  SELECT
    os.tenant_id,
    COALESCE(os.setting_value -> 'modules' ->> 'payroll', 'default-true') AS payroll_module
  FROM public.organization_settings os
  WHERE os.setting_key = 'org_workspace_modules_v1'
)
SELECT
  ta.tenant_id,
  ta.tenant_name,
  COALESCE(s.status::text, '-') AS subscription_status,
  COALESCE(pp.payment_committed, false) AS payment_committed,
  ta.admin_count,
  (SELECT COUNT(*) FROM public.employees e WHERE e.tenant_id = ta.tenant_id) AS employee_count,
  (SELECT COUNT(*) FROM public.work_units wu WHERE wu.tenant_id = ta.tenant_id) AS work_units,
  (SELECT COUNT(*) FROM public.offices off WHERE off.tenant_id = ta.tenant_id) AS offices,
  (SELECT COUNT(*) FROM public.work_hours wh WHERE wh.tenant_id = ta.tenant_id) AS work_hours,
  (SELECT COUNT(*) FROM public.absence_limits al WHERE al.tenant_id = ta.tenant_id) AS absence_limits,
  COALESCE(pm.mode, 'strict') AS effective_mode,
  COALESCE(pm.explicit_mode_setting, false) AS explicit_mode_setting,
  COALESCE(wm.payroll_module, 'default-true') AS payroll_module,
  COALESCE(tp.assigned_user_count, 0) AS assigned_user_count,
  COALESCE(tp.active_assignment_count, 0) AS active_assignment_count
FROM tenant_admins ta
LEFT JOIN payroll_mode pm
  ON pm.tenant_id = ta.tenant_id
LEFT JOIN tenant_payroll tp
  ON tp.tenant_id = ta.tenant_id
LEFT JOIN public.subscriptions s
  ON s.tenant_id = ta.tenant_id
LEFT JOIN payment_policy pp
  ON pp.tenant_id = ta.tenant_id
LEFT JOIN workspace_modules wm
  ON wm.tenant_id = ta.tenant_id
WHERE ta.admin_count > 0
  AND COALESCE(pm.mode, 'strict') = 'strict'
  AND COALESCE(tp.assigned_user_count, 0) = 0
ORDER BY
  CASE COALESCE(s.status::text, '-')
    WHEN 'active' THEN 0
    WHEN 'trial' THEN 1
    ELSE 2
  END,
  ta.tenant_name;

\echo ''
\echo '== 2) Detail admin untuk tenant berisiko =='

WITH tenant_admins AS (
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    COUNT(DISTINCT ur.user_id) FILTER (WHERE ur.role = 'admin_instansi') AS admin_count
  FROM public.tenants t
  LEFT JOIN public.user_roles ur
    ON ur.tenant_id = t.id
  GROUP BY t.id, t.name
),
tenant_payroll AS (
  SELECT
    pra.tenant_id,
    COUNT(DISTINCT pra.user_id) FILTER (WHERE pra.is_active) AS assigned_user_count
  FROM public.payroll_role_assignments pra
  GROUP BY pra.tenant_id
),
payroll_mode AS (
  SELECT
    os.tenant_id,
    os.setting_value ->> 'mode' AS mode
  FROM public.organization_settings os
  WHERE os.setting_key = 'org_payroll_access_mode_v1'
),
risky_tenants AS (
  SELECT
    ta.tenant_id,
    ta.tenant_name
  FROM tenant_admins ta
  LEFT JOIN payroll_mode pm
    ON pm.tenant_id = ta.tenant_id
  LEFT JOIN tenant_payroll tp
    ON tp.tenant_id = ta.tenant_id
  WHERE ta.admin_count > 0
    AND COALESCE(pm.mode, 'strict') = 'strict'
    AND COALESCE(tp.assigned_user_count, 0) = 0
)
SELECT
  rt.tenant_name,
  ur.user_id,
  COALESCE(e.name, '-') AS employee_name,
  COALESCE(e.email, '-') AS employee_email,
  COALESCE(
    STRING_AGG(
      CASE WHEN pra.is_active THEN pra.payroll_role END,
      ',' ORDER BY pra.payroll_role
    ),
    '-'
  ) AS active_payroll_roles
FROM risky_tenants rt
JOIN public.user_roles ur
  ON ur.tenant_id = rt.tenant_id
 AND ur.role = 'admin_instansi'
LEFT JOIN public.employees e
  ON e.user_id = ur.user_id
 AND e.tenant_id = rt.tenant_id
LEFT JOIN public.payroll_role_assignments pra
  ON pra.user_id = ur.user_id
 AND pra.tenant_id = rt.tenant_id
GROUP BY rt.tenant_name, ur.user_id, e.name, e.email
ORDER BY rt.tenant_name, employee_name;

\echo ''
\echo '== 3) Ringkasan jumlah tenant berisiko =='

WITH tenant_admins AS (
  SELECT
    t.id AS tenant_id,
    COUNT(DISTINCT ur.user_id) FILTER (WHERE ur.role = 'admin_instansi') AS admin_count
  FROM public.tenants t
  LEFT JOIN public.user_roles ur
    ON ur.tenant_id = t.id
  GROUP BY t.id
),
tenant_payroll AS (
  SELECT
    pra.tenant_id,
    COUNT(DISTINCT pra.user_id) FILTER (WHERE pra.is_active) AS assigned_user_count
  FROM public.payroll_role_assignments pra
  GROUP BY pra.tenant_id
),
payroll_mode AS (
  SELECT
    os.tenant_id,
    os.setting_value ->> 'mode' AS mode
  FROM public.organization_settings os
  WHERE os.setting_key = 'org_payroll_access_mode_v1'
)
SELECT COUNT(*) AS risky_tenant_count
FROM tenant_admins ta
LEFT JOIN payroll_mode pm
  ON pm.tenant_id = ta.tenant_id
LEFT JOIN tenant_payroll tp
  ON tp.tenant_id = ta.tenant_id
WHERE ta.admin_count > 0
  AND COALESCE(pm.mode, 'strict') = 'strict'
  AND COALESCE(tp.assigned_user_count, 0) = 0;
