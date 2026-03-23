-- Allow extended manual payment statuses for partial/full verification flow.
-- Fixes runtime insert failure on /org/billing (varchar(20) + legacy check constraint).

-- Trigger depends on status column, so drop and re-create around ALTER TYPE.
DROP TRIGGER IF EXISTS trg_guard_manual_payment_verified_total ON public.manual_payments;

ALTER TABLE public.manual_payments
  ALTER COLUMN status TYPE VARCHAR(64);

ALTER TABLE public.manual_payments
  DROP CONSTRAINT IF EXISTS manual_payments_status_check;

ALTER TABLE public.manual_payments
  ADD CONSTRAINT manual_payments_status_check
  CHECK (
    (status)::text = ANY (
      ARRAY[
        'pending'::text,
        'verified'::text,
        'rejected'::text,
        'awaiting_verification'::text,
        'awaiting_verification_full'::text,
        'pending_verification_partial'::text
      ]
    )
  );

CREATE TRIGGER trg_guard_manual_payment_verified_total
BEFORE INSERT OR UPDATE OF status, verified_amount, amount
ON public.manual_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_manual_payment_verified_total();
