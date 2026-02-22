-- Request topup saldo wallet dari organisasi, diverifikasi admin.

CREATE TABLE IF NOT EXISTS public.wallet_topup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_amount NUMERIC NOT NULL CHECK (requested_amount > 0),
  approved_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reference_number TEXT,
  notes TEXT,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_tenant_created
  ON public.wallet_topup_requests(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_status_created
  ON public.wallet_topup_requests(status, created_at DESC);

ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admin can view wallet topup requests" ON public.wallet_topup_requests;
CREATE POLICY "Tenant admin can view wallet topup requests" ON public.wallet_topup_requests
  FOR SELECT USING (
    tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Tenant admin can insert wallet topup requests" ON public.wallet_topup_requests;
CREATE POLICY "Tenant admin can insert wallet topup requests" ON public.wallet_topup_requests
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Super admin can manage wallet topup requests" ON public.wallet_topup_requests;
CREATE POLICY "Super admin can manage wallet topup requests" ON public.wallet_topup_requests
  FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_wallet_topup_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_wallet_topup_requests_updated_at ON public.wallet_topup_requests;
CREATE TRIGGER trg_touch_wallet_topup_requests_updated_at
BEFORE UPDATE ON public.wallet_topup_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_wallet_topup_requests_updated_at();

CREATE OR REPLACE FUNCTION public.submit_wallet_topup_request(
  p_tenant_id UUID,
  p_requested_amount NUMERIC,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_tenant_id UUID;
  v_existing_id UUID;
  v_row public.wallet_topup_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.is_super_admin(v_actor) THEN
    v_actor_tenant_id := public.get_user_tenant_id(v_actor);
    IF v_actor_tenant_id IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'Forbidden tenant access';
    END IF;
  END IF;

  IF COALESCE(p_requested_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Nominal topup harus lebih dari 0';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT, 202602221));

  SELECT id
  INTO v_existing_id
  FROM public.wallet_topup_requests
  WHERE tenant_id = p_tenant_id
    AND status = 'PENDING'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.wallet_topup_requests WHERE id = v_existing_id;
    RETURN jsonb_build_object(
      'id', v_row.id,
      'tenant_id', v_row.tenant_id,
      'requested_amount', v_row.requested_amount,
      'approved_amount', v_row.approved_amount,
      'status', v_row.status,
      'reference_number', v_row.reference_number,
      'notes', v_row.notes,
      'rejection_reason', v_row.rejection_reason,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'reused', TRUE
    );
  END IF;

  INSERT INTO public.wallet_topup_requests (
    tenant_id,
    requested_amount,
    reference_number,
    notes,
    created_by
  ) VALUES (
    p_tenant_id,
    ROUND(p_requested_amount, 0),
    NULLIF(BTRIM(p_reference_number), ''),
    NULLIF(BTRIM(p_notes), ''),
    v_actor
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'requested_amount', v_row.requested_amount,
    'approved_amount', v_row.approved_amount,
    'status', v_row.status,
    'reference_number', v_row.reference_number,
    'notes', v_row.notes,
    'rejection_reason', v_row.rejection_reason,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'reused', FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_wallet_topup_requests_for_tenant(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_tenant_id UUID;
  v_rows JSONB := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.is_super_admin(v_actor) THEN
    v_actor_tenant_id := public.get_user_tenant_id(v_actor);
    IF v_actor_tenant_id IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'Forbidden tenant access';
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'tenant_id', r.tenant_id,
        'requested_amount', r.requested_amount,
        'approved_amount', r.approved_amount,
        'status', r.status,
        'reference_number', r.reference_number,
        'notes', r.notes,
        'rejection_reason', r.rejection_reason,
        'reviewed_at', r.reviewed_at,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      ) ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT *
    FROM public.wallet_topup_requests
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  ) r;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'requests', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_wallet_topup_requests_admin(
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_rows JSONB := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'tenant_id', q.tenant_id,
        'tenant_name', q.tenant_name,
        'tenant_code', q.tenant_code,
        'requested_amount', q.requested_amount,
        'approved_amount', q.approved_amount,
        'status', q.status,
        'reference_number', q.reference_number,
        'notes', q.notes,
        'rejection_reason', q.rejection_reason,
        'reviewed_at', q.reviewed_at,
        'created_at', q.created_at,
        'updated_at', q.updated_at
      ) ORDER BY q.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      r.*,
      t.name AS tenant_name,
      t.code AS tenant_code
    FROM public.wallet_topup_requests r
    LEFT JOIN public.tenants t ON t.id = r.tenant_id
    WHERE p_status IS NULL OR UPPER(BTRIM(p_status)) = '' OR r.status = UPPER(BTRIM(p_status))
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ) q;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_wallet_topup_request(
  p_request_id UUID,
  p_action TEXT,
  p_approved_amount NUMERIC DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_action TEXT := UPPER(COALESCE(BTRIM(p_action), ''));
  v_request public.wallet_topup_requests%ROWTYPE;
  v_wallet public.tenant_wallets%ROWTYPE;
  v_credit_amount NUMERIC := 0;
  v_balance_before NUMERIC := 0;
  v_balance_after NUMERIC := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_action NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Action tidak valid';
  END IF;

  SELECT *
  INTO v_request
  FROM public.wallet_topup_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request topup tidak ditemukan';
  END IF;

  IF v_request.status <> 'PENDING' THEN
    RETURN jsonb_build_object(
      'id', v_request.id,
      'status', v_request.status,
      'changed', FALSE,
      'reason', 'request_not_pending'
    );
  END IF;

  IF v_action = 'REJECT' THEN
    UPDATE public.wallet_topup_requests
    SET
      status = 'REJECTED',
      rejection_reason = NULLIF(BTRIM(p_rejection_reason), ''),
      reviewed_by = v_actor,
      reviewed_at = NOW(),
      notes = COALESCE(NULLIF(BTRIM(p_notes), ''), notes)
    WHERE id = v_request.id
    RETURNING * INTO v_request;

    RETURN jsonb_build_object(
      'id', v_request.id,
      'status', v_request.status,
      'changed', TRUE
    );
  END IF;

  v_credit_amount := ROUND(COALESCE(p_approved_amount, v_request.requested_amount), 0);
  IF v_credit_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal persetujuan harus lebih dari 0';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_request.tenant_id::TEXT, 202602221));

  SELECT *
  INTO v_wallet
  FROM public.ensure_tenant_wallet(v_request.tenant_id);

  SELECT *
  INTO v_wallet
  FROM public.tenant_wallets
  WHERE tenant_id = v_request.tenant_id
  FOR UPDATE;

  v_balance_before := COALESCE(v_wallet.balance, 0);
  v_balance_after := v_balance_before + v_credit_amount;

  UPDATE public.tenant_wallets
  SET balance = v_balance_after
  WHERE tenant_id = v_request.tenant_id;

  INSERT INTO public.tenant_wallet_transactions (
    tenant_id,
    invoice_id,
    direction,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    reference,
    notes,
    created_by,
    metadata
  ) VALUES (
    v_request.tenant_id,
    NULL,
    'CREDIT',
    'TOPUP',
    v_credit_amount,
    v_balance_before,
    v_balance_after,
    COALESCE(v_request.reference_number, v_request.id::TEXT),
    COALESCE(NULLIF(BTRIM(p_notes), ''), 'Topup saldo wallet disetujui admin'),
    v_actor,
    jsonb_build_object('topup_request_id', v_request.id)
  );

  UPDATE public.wallet_topup_requests
  SET
    status = 'APPROVED',
    approved_amount = v_credit_amount,
    reviewed_by = v_actor,
    reviewed_at = NOW(),
    notes = COALESCE(NULLIF(BTRIM(p_notes), ''), notes)
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'approved_amount', v_request.approved_amount,
    'wallet_balance_before', v_balance_before,
    'wallet_balance_after', v_balance_after,
    'changed', TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_wallet_topup_request(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_topup_requests_for_tenant(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_topup_requests_admin(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_wallet_topup_request(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
