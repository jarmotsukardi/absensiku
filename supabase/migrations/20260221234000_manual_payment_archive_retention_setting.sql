-- Configurable retention for archived manual payment proofs.
-- Default policy: 7 days.

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'payment_archive_retention_days',
  '{"value": 7}'::jsonb,
  'Masa simpan arsip pembayaran manual (hari) sebelum bukti transfer + arsip dihapus otomatis.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.manual_payments
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_proof_path text;

CREATE INDEX IF NOT EXISTS idx_manual_payments_archive_expiry
  ON public.manual_payments (is_archived, archive_expires_at)
  WHERE is_archived = true;

CREATE OR REPLACE FUNCTION public.get_payment_archive_retention_days()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_value jsonb;
  v_raw text;
  v_days integer := 7;
BEGIN
  SELECT value
  INTO v_value
  FROM public.system_settings
  WHERE key = 'payment_archive_retention_days'
  LIMIT 1;

  IF v_value IS NULL THEN
    RETURN 7;
  END IF;

  IF jsonb_typeof(v_value) = 'number' THEN
    v_raw := trim(both '"' from v_value::text);
  ELSIF jsonb_typeof(v_value) = 'string' THEN
    v_raw := trim(both '"' from v_value::text);
  ELSIF jsonb_typeof(v_value) = 'object' THEN
    v_raw := NULLIF(v_value ->> 'value', '');
  END IF;

  IF v_raw IS NOT NULL AND v_raw ~ '^\d+$' THEN
    v_days := v_raw::integer;
  END IF;

  RETURN LEAST(365, GREATEST(1, COALESCE(v_days, 7)));
END;
$$;

CREATE OR REPLACE FUNCTION public.fill_manual_payment_archive_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_retention_days integer := public.get_payment_archive_retention_days();
BEGIN
  IF NEW.is_archived = true THEN
    IF TG_OP = 'INSERT' OR COALESCE(OLD.is_archived, false) = false OR NEW.archived_at IS NULL THEN
      NEW.archived_at := COALESCE(NEW.archived_at, now());
    END IF;

    IF NEW.archive_expires_at IS NULL OR COALESCE(OLD.is_archived, false) = false THEN
      NEW.archive_expires_at := NEW.archived_at + make_interval(days => v_retention_days);
    END IF;
  ELSE
    NEW.archived_at := NULL;
    NEW.archive_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_manual_payment_archive_window ON public.manual_payments;
CREATE TRIGGER trg_fill_manual_payment_archive_window
BEFORE INSERT OR UPDATE OF is_archived, archived_at, archive_expires_at
ON public.manual_payments
FOR EACH ROW
EXECUTE FUNCTION public.fill_manual_payment_archive_window();
