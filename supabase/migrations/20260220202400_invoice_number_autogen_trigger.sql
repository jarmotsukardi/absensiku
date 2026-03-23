-- Ensure invoice numbers are always generated automatically at DB level.
-- This covers all insert sources (UI, RPC, cron, edge functions).

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_month TEXT;
  seq_num BIGINT;
  invoice_num TEXT;
BEGIN
  year_month := TO_CHAR(NOW(), 'YYYYMM');

  -- Serialize generator per month to avoid duplicate numbers on concurrent inserts.
  PERFORM pg_advisory_xact_lock(hashtext('invoice-number-' || year_month));

  SELECT COALESCE(
    MAX(
      CASE
        WHEN invoice_number ~ ('^INV-' || year_month || '-[0-9]+$')
          THEN split_part(invoice_number, '-', 3)::BIGINT
        ELSE NULL
      END
    ),
    0
  ) + 1
  INTO seq_num
  FROM public.invoices;

  invoice_num := 'INV-' || year_month || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN invoice_num;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_invoice_number_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR BTRIM(NEW.invoice_number) = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_invoice_number_before_insert ON public.invoices;
CREATE TRIGGER set_invoice_number_before_insert
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_invoice_number_before_insert();

