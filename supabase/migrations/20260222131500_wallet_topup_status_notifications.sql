-- Notifikasi in-app saat request topup wallet di-approve/reject oleh admin.

CREATE OR REPLACE FUNCTION public.notify_wallet_topup_status(
  p_request_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.wallet_topup_requests%ROWTYPE;
  v_tenant_name TEXT := 'Organisasi';
  v_title TEXT;
  v_message TEXT;
  v_link TEXT := '/org/billing?menu=topup';
  v_metadata JSONB := '{}'::jsonb;
  v_inserted INTEGER := 0;
  v_recipient UUID;
BEGIN
  SELECT *
  INTO v_request
  FROM public.wallet_topup_requests
  WHERE id = p_request_id
  LIMIT 1;

  IF v_request.id IS NULL THEN
    RETURN 0;
  END IF;

  IF v_request.status NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(name), ''), 'Organisasi')
  INTO v_tenant_name
  FROM public.tenants
  WHERE id = v_request.tenant_id
  LIMIT 1;

  IF v_request.status = 'APPROVED' THEN
    v_title := 'Topup saldo disetujui';
    v_message := format(
      'Request topup %s disetujui. Saldo wallet telah ditambahkan ke akun %s.',
      to_char(COALESCE(v_request.approved_amount, v_request.requested_amount), 'FM999G999G999G999'),
      v_tenant_name
    );
  ELSE
    v_title := 'Topup saldo ditolak';
    v_message := format(
      'Request topup %s ditolak. Alasan: %s',
      to_char(v_request.requested_amount, 'FM999G999G999G999'),
      COALESCE(NULLIF(BTRIM(v_request.rejection_reason), ''), 'Tidak ada alasan')
    );
  END IF;

  v_metadata := jsonb_build_object(
    'event', 'WALLET_TOPUP_REVIEWED',
    'topup_request_id', v_request.id,
    'tenant_id', v_request.tenant_id,
    'status', v_request.status,
    'requested_amount', v_request.requested_amount,
    'approved_amount', v_request.approved_amount
  );

  FOR v_recipient IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.tenant_id = v_request.tenant_id
      AND ur.role IN ('admin_instansi'::public.app_role, 'atasan'::public.app_role)
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, is_read, link, metadata)
    VALUES (
      v_recipient,
      v_title,
      v_message,
      'billing',
      false,
      v_link,
      v_metadata
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  INSERT INTO public.billing_notification_logs (
    tenant_id,
    invoice_id,
    notification_type,
    recipient,
    subject,
    message,
    status,
    sent_at,
    metadata
  ) VALUES (
    v_request.tenant_id,
    NULL,
    'PUSH',
    format('tenant:%s', v_request.tenant_id),
    v_title,
    v_message,
    'SENT',
    now(),
    v_metadata
  );

  RETURN v_inserted;
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
  v_notif_count INTEGER := 0;
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

    v_notif_count := public.notify_wallet_topup_status(v_request.id);

    RETURN jsonb_build_object(
      'id', v_request.id,
      'status', v_request.status,
      'changed', TRUE,
      'notifications_inserted', v_notif_count
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

  v_notif_count := public.notify_wallet_topup_status(v_request.id);

  RETURN jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'approved_amount', v_request.approved_amount,
    'wallet_balance_before', v_balance_before,
    'wallet_balance_after', v_balance_after,
    'changed', TRUE,
    'notifications_inserted', v_notif_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_wallet_topup_status(UUID) TO authenticated;
