-- Snapshot and overview helper for invoice number format health.
-- Format target: INV-YYYYMM-####(dapat lebih dari 4 digit).

CREATE TABLE IF NOT EXISTS public.invoice_number_health_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  total_count BIGINT NOT NULL DEFAULT 0,
  valid_count BIGINT NOT NULL DEFAULT 0,
  invalid_count BIGINT NOT NULL DEFAULT 0,
  invalid_samples TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_number_health_snapshots_snapshot_date_key UNIQUE (snapshot_date)
);

ALTER TABLE public.invoice_number_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin can read invoice health snapshots" ON public.invoice_number_health_snapshots;
CREATE POLICY "Super admin can read invoice health snapshots"
ON public.invoice_number_health_snapshots
FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_invoice_number_health_overview()
RETURNS TABLE (
  total_count BIGINT,
  valid_count BIGINT,
  invalid_count BIGINT,
  invalid_samples TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT
    i.id,
    NULLIF(BTRIM(i.invoice_number), '') AS invoice_number,
    i.created_at
  FROM public.invoices i
),
summary AS (
  SELECT
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (
      WHERE invoice_number ~ '^INV-[0-9]{6}-[0-9]{4,}$'
    )::BIGINT AS valid_count
  FROM base
),
sample AS (
  SELECT
    ARRAY(
      SELECT COALESCE(invoice_number, '(kosong)')
      FROM base
      WHERE invoice_number IS NULL
         OR invoice_number !~ '^INV-[0-9]{6}-[0-9]{4,}$'
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 5
    ) AS invalid_samples
)
SELECT
  summary.total_count,
  summary.valid_count,
  (summary.total_count - summary.valid_count)::BIGINT AS invalid_count,
  sample.invalid_samples
FROM summary
CROSS JOIN sample;
$$;

CREATE OR REPLACE FUNCTION public.capture_invoice_number_health_snapshot(
  p_snapshot_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  snapshot_date DATE,
  total_count BIGINT,
  valid_count BIGINT,
  invalid_count BIGINT,
  invalid_samples TEXT[],
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH overview AS (
  SELECT * FROM public.get_invoice_number_health_overview()
),
upserted AS (
  INSERT INTO public.invoice_number_health_snapshots (
    snapshot_date,
    total_count,
    valid_count,
    invalid_count,
    invalid_samples,
    created_at,
    updated_at
  )
  SELECT
    p_snapshot_date,
    overview.total_count,
    overview.valid_count,
    overview.invalid_count,
    COALESCE(overview.invalid_samples, '{}'::TEXT[]),
    NOW(),
    NOW()
  FROM overview
  ON CONFLICT (snapshot_date) DO UPDATE
    SET total_count = EXCLUDED.total_count,
        valid_count = EXCLUDED.valid_count,
        invalid_count = EXCLUDED.invalid_count,
        invalid_samples = EXCLUDED.invalid_samples,
        updated_at = NOW()
  RETURNING
    invoice_number_health_snapshots.snapshot_date,
    invoice_number_health_snapshots.total_count,
    invoice_number_health_snapshots.valid_count,
    invoice_number_health_snapshots.invalid_count,
    invoice_number_health_snapshots.invalid_samples,
    invoice_number_health_snapshots.updated_at
)
SELECT
  upserted.snapshot_date,
  upserted.total_count,
  upserted.valid_count,
  upserted.invalid_count,
  upserted.invalid_samples,
  upserted.updated_at
FROM upserted;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_number_health_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capture_invoice_number_health_snapshot(DATE) TO authenticated, service_role;
