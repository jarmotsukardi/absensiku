DO $$
BEGIN
  IF to_regclass('public.payroll_audit_logs') IS NULL THEN
    RAISE NOTICE 'skip payroll_errorlog_columns: table public.payroll_audit_logs not found';
    RETURN;
  END IF;

  ALTER TABLE public.payroll_audit_logs
    ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'error',
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS source_route text;

  UPDATE public.payroll_audit_logs
  SET severity = CASE
    WHEN lower(coalesce(action_type, '') || ' ' || coalesce(action_label, '') || ' ' || coalesce(notes, '')) LIKE '%warn%' THEN 'warning'
    ELSE 'error'
  END
  WHERE severity IS NULL OR severity = '';

  UPDATE public.payroll_audit_logs
  SET status = CASE
    WHEN lower(coalesce(action_type, '') || ' ' || coalesce(action_label, '') || ' ' || coalesce(notes, '')) ~ '(archive|arsip)' THEN 'archived'
    WHEN lower(coalesce(action_type, '') || ' ' || coalesce(action_label, '') || ' ' || coalesce(notes, '')) ~ '(done|resolved|selesai|fixed)' THEN 'done'
    ELSE 'open'
  END
  WHERE status IS NULL OR status = '';

  UPDATE public.payroll_audit_logs
  SET source_route = CASE
    WHEN source_route IS NOT NULL AND source_route <> '' THEN source_route
    WHEN entity_type = 'payroll_webhook' THEN '/org/payroll/integrations'
    ELSE '/org/payroll/audit-log'
  END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_audit_logs_severity_check'
      AND conrelid = 'public.payroll_audit_logs'::regclass
  ) THEN
    ALTER TABLE public.payroll_audit_logs
      ADD CONSTRAINT payroll_audit_logs_severity_check
      CHECK (severity IN ('error', 'warning'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_audit_logs_status_check'
      AND conrelid = 'public.payroll_audit_logs'::regclass
  ) THEN
    ALTER TABLE public.payroll_audit_logs
      ADD CONSTRAINT payroll_audit_logs_status_check
      CHECK (status IN ('open', 'done', 'archived'));
  END IF;

  CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_tenant_severity_status_created
    ON public.payroll_audit_logs(tenant_id, severity, status, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_tenant_source_route_created
    ON public.payroll_audit_logs(tenant_id, source_route, created_at DESC);
END $$;
