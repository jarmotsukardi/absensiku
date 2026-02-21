-- Hotfix: avoid PL/pgSQL variable/column ambiguity in snapshot function.

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

SELECT * FROM public.capture_invoice_number_health_snapshot(CURRENT_DATE);

