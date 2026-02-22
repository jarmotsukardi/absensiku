-- Add explicit confirmation vs verification amounts for manual payment audit.
ALTER TABLE public.manual_payments
  ADD COLUMN IF NOT EXISTS confirmed_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS verified_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS verification_method TEXT;

UPDATE public.manual_payments
SET confirmed_amount = amount
WHERE confirmed_amount IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'manual_payments_verification_method_check'
  ) THEN
    ALTER TABLE public.manual_payments
      ADD CONSTRAINT manual_payments_verification_method_check
      CHECK (
        verification_method IS NULL
        OR verification_method IN ('manual', 'bank_mutation', 'ocr', 'other')
      );
  END IF;
END $$;
