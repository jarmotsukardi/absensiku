-- Performance optimization for /org/invitations search & pagination.
-- Safe/idempotent migration:
-- - Adds filter/sort btree indexes
-- - Adds trigram GIN indexes for ILIKE search on name/email/invitation_code

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Main filter + sort path: tenant scoped list ordered by created_at desc
CREATE INDEX IF NOT EXISTS idx_emp_inv_tenant_created_at
  ON public.employee_invitations (tenant_id, created_at DESC);

-- Status filter path
CREATE INDEX IF NOT EXISTS idx_emp_inv_tenant_status_created_at
  ON public.employee_invitations (tenant_id, status, created_at DESC);

-- Optional OPD filter path (guarded for schema variants)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee_invitations'
      AND column_name = 'opd_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_emp_inv_tenant_opd_created_at
             ON public.employee_invitations (tenant_id, opd_id, created_at DESC)';
  END IF;
END
$$;

-- Trigram indexes for ilike: name/email/invitation_code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee_invitations'
      AND column_name = 'name'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_emp_inv_name_trgm
             ON public.employee_invitations USING gin (name gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee_invitations'
      AND column_name = 'email'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_emp_inv_email_trgm
             ON public.employee_invitations USING gin (email gin_trgm_ops)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employee_invitations'
      AND column_name = 'invitation_code'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_emp_inv_code_trgm
             ON public.employee_invitations USING gin (invitation_code gin_trgm_ops)';
  END IF;
END
$$;
