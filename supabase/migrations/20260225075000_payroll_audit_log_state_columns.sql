-- Persist status/severity untuk triase payroll error log lintas tenant.
DO $$
BEGIN
  IF to_regclass('public.payroll_audit_logs') IS NULL THEN
    RAISE NOTICE 'skip payroll_audit_log_state_columns: table public.payroll_audit_logs not found';
    RETURN;
  END IF;

  ALTER TABLE public.payroll_audit_logs
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'error',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS source_route text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by text,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by text,
  ADD COLUMN IF NOT EXISTS archive_note text;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payroll_audit_logs_severity_check'
      AND conrelid = 'public.payroll_audit_logs'::regclass
  ) THEN
    ALTER TABLE public.payroll_audit_logs
    ADD CONSTRAINT payroll_audit_logs_severity_check
    CHECK (severity = ANY (ARRAY['error'::text, 'warning'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payroll_audit_logs_status_check'
      AND conrelid = 'public.payroll_audit_logs'::regclass
  ) THEN
    ALTER TABLE public.payroll_audit_logs
    ADD CONSTRAINT payroll_audit_logs_status_check
    CHECK (status = ANY (ARRAY['open'::text, 'done'::text, 'archived'::text]));
  END IF;

  UPDATE public.payroll_audit_logs
  SET severity = 'warning'
  WHERE severity = 'error'
    AND lower(coalesce(action_type, '') || ' ' || coalesce(action_label, '') || ' ' || coalesce(notes, '')) LIKE '%warn%';

  CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_status_created_at
    ON public.payroll_audit_logs (status, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_severity_created_at
    ON public.payroll_audit_logs (severity, created_at DESC);
END $$;
