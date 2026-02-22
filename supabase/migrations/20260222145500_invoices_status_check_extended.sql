-- Extend invoice status constraint for partial/revision verification flow.

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'PENDING'::text,
        'PAID'::text,
        'EXPIRED'::text,
        'CANCELLED'::text,
        'REFUNDED'::text,
        'AWAITING_VERIFICATION'::text,
        'AWAITING_VERIFICATION_FULL'::text,
        'PENDING_VERIFICATION_PARTIAL'::text,
        'PARTIALLY_PAID'::text,
        'REJECTED_NEEDS_REVISION'::text
      ]
    )
  );
