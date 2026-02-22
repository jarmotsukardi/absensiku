-- Fix audit RPC record_id type to UUID.
CREATE OR REPLACE FUNCTION public.log_manual_payment_verification_audit(
  p_invoice_id UUID,
  p_manual_payment_id UUID,
  p_tenant_id UUID,
  p_claimed_amount INTEGER,
  p_verified_amount INTEGER,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    table_name,
    record_id,
    new_values
  ) VALUES (
    p_tenant_id,
    auth.uid(),
    CASE
      WHEN p_decision = 'reject' THEN 'MANUAL_PAYMENT_REJECTED_NEEDS_REVISION'
      ELSE 'MANUAL_PAYMENT_VERIFICATION_MISMATCH'
    END,
    'manual_payments',
    p_manual_payment_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'manual_payment_id', p_manual_payment_id,
      'claimed_amount', p_claimed_amount,
      'verified_amount', p_verified_amount,
      'decision', p_decision,
      'notes', p_notes,
      'created_at', now()
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;
