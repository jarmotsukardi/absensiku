-- Wallet saldo tenant untuk menampung angka unik dan auto-deduct pembayaran invoice berikutnya.

CREATE TABLE IF NOT EXISTS public.tenant_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('CREDIT_UNIQUE', 'DEBIT_INVOICE', 'TOPUP', 'ADJUSTMENT')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  balance_before NUMERIC NOT NULL DEFAULT 0,
  balance_after NUMERIC NOT NULL DEFAULT 0,
  reference TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_wallet_tx_tenant_created
  ON public.tenant_wallet_transactions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_wallet_tx_invoice
  ON public.tenant_wallet_transactions(invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_invoice_unique_credit
  ON public.tenant_wallet_transactions(invoice_id, transaction_type)
  WHERE transaction_type = 'CREDIT_UNIQUE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_invoice_debit
  ON public.tenant_wallet_transactions(invoice_id, transaction_type)
  WHERE transaction_type = 'DEBIT_INVOICE';

ALTER TABLE public.tenant_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admin can view tenant wallets" ON public.tenant_wallets
  FOR SELECT USING (
    tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Super admin can manage tenant wallets" ON public.tenant_wallets
  FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant admin can view wallet transactions" ON public.tenant_wallet_transactions
  FOR SELECT USING (
    tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Super admin can manage wallet transactions" ON public.tenant_wallet_transactions
  FOR ALL USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_tenant_wallet_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_tenant_wallet_updated_at ON public.tenant_wallets;
CREATE TRIGGER trg_touch_tenant_wallet_updated_at
BEFORE UPDATE ON public.tenant_wallets
FOR EACH ROW
EXECUTE FUNCTION public.touch_tenant_wallet_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_tenant_wallet(p_tenant_id UUID)
RETURNS public.tenant_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.tenant_wallets%ROWTYPE;
BEGIN
  INSERT INTO public.tenant_wallets (tenant_id, balance)
  VALUES (p_tenant_id, 0)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.tenant_wallets
  WHERE tenant_id = p_tenant_id
  LIMIT 1;

  RETURN v_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_wallet_unique_code(
  p_invoice_id UUID,
  p_actor_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_wallet public.tenant_wallets%ROWTYPE;
  v_unique_code INTEGER := 0;
  v_balance_before NUMERIC := 0;
  v_balance_after NUMERIC := 0;
  v_actor_tenant_id UUID;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  LIMIT 1;

  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('credited', FALSE, 'reason', 'invoice_not_found');
  END IF;

  IF p_actor_user_id IS NOT NULL AND NOT public.is_super_admin(p_actor_user_id) THEN
    v_actor_tenant_id := public.get_user_tenant_id(p_actor_user_id);
    IF v_actor_tenant_id IS DISTINCT FROM v_invoice.tenant_id THEN
      RAISE EXCEPTION 'Forbidden tenant access';
    END IF;
  END IF;

  v_unique_code := GREATEST(COALESCE((v_invoice.metadata->>'unique_code')::INTEGER, 0), 0);

  IF v_unique_code <= 0 THEN
    RETURN jsonb_build_object('credited', FALSE, 'reason', 'no_unique_code');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_wallet_transactions
    WHERE invoice_id = v_invoice.id
      AND transaction_type = 'CREDIT_UNIQUE'
  ) THEN
    RETURN jsonb_build_object('credited', FALSE, 'reason', 'already_credited');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_invoice.tenant_id::TEXT, 20260222));

  SELECT *
  INTO v_wallet
  FROM public.ensure_tenant_wallet(v_invoice.tenant_id);

  SELECT *
  INTO v_wallet
  FROM public.tenant_wallets
  WHERE tenant_id = v_invoice.tenant_id
  FOR UPDATE;

  v_balance_before := COALESCE(v_wallet.balance, 0);
  v_balance_after := v_balance_before + v_unique_code;

  UPDATE public.tenant_wallets
  SET balance = v_balance_after
  WHERE tenant_id = v_invoice.tenant_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_wallet_transactions
    WHERE invoice_id = v_invoice.id
      AND transaction_type = 'CREDIT_UNIQUE'
  ) THEN
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
      v_invoice.tenant_id,
      v_invoice.id,
      'CREDIT',
      'CREDIT_UNIQUE',
      v_unique_code,
      v_balance_before,
      v_balance_after,
      v_invoice.invoice_number,
      'Kembalian angka unik invoice ke saldo tenant',
      p_actor_user_id,
      jsonb_build_object('invoice_number', v_invoice.invoice_number, 'source', 'invoice_unique_code')
    );
  END IF;

  RETURN jsonb_build_object(
    'credited', TRUE,
    'amount', v_unique_code,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'invoice_number', v_invoice.invoice_number
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_wallet_to_invoice_if_possible(
  p_invoice_id UUID,
  p_actor_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_wallet public.tenant_wallets%ROWTYPE;
  v_required NUMERIC := 0;
  v_balance_before NUMERIC := 0;
  v_balance_after NUMERIC := 0;
  v_actor_tenant_id UUID;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  LIMIT 1;

  IF v_invoice.id IS NULL THEN
    RETURN jsonb_build_object('applied', FALSE, 'reason', 'invoice_not_found');
  END IF;

  IF p_actor_user_id IS NOT NULL AND NOT public.is_super_admin(p_actor_user_id) THEN
    v_actor_tenant_id := public.get_user_tenant_id(p_actor_user_id);
    IF v_actor_tenant_id IS DISTINCT FROM v_invoice.tenant_id THEN
      RAISE EXCEPTION 'Forbidden tenant access';
    END IF;
  END IF;

  IF v_invoice.status NOT IN ('PENDING', 'AWAITING_VERIFICATION') THEN
    RETURN jsonb_build_object('applied', FALSE, 'reason', 'invoice_not_payable', 'status', v_invoice.status);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_wallet_transactions
    WHERE invoice_id = v_invoice.id
      AND transaction_type = 'DEBIT_INVOICE'
  ) THEN
    RETURN jsonb_build_object('applied', FALSE, 'reason', 'already_debited');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_invoice.tenant_id::TEXT, 20260222));

  SELECT *
  INTO v_wallet
  FROM public.ensure_tenant_wallet(v_invoice.tenant_id);

  SELECT *
  INTO v_wallet
  FROM public.tenant_wallets
  WHERE tenant_id = v_invoice.tenant_id
  FOR UPDATE;

  v_required := GREATEST(COALESCE(v_invoice.gross_amount, 0), 0);
  v_balance_before := COALESCE(v_wallet.balance, 0);

  IF v_required <= 0 THEN
    RETURN jsonb_build_object('applied', FALSE, 'reason', 'invalid_invoice_amount');
  END IF;

  IF v_balance_before < v_required THEN
    RETURN jsonb_build_object(
      'applied', FALSE,
      'reason', 'insufficient_balance',
      'required', v_required,
      'wallet_balance', v_balance_before
    );
  END IF;

  v_balance_after := v_balance_before - v_required;

  UPDATE public.tenant_wallets
  SET balance = v_balance_after
  WHERE tenant_id = v_invoice.tenant_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_wallet_transactions
    WHERE invoice_id = v_invoice.id
      AND transaction_type = 'DEBIT_INVOICE'
  ) THEN
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
      v_invoice.tenant_id,
      v_invoice.id,
      'DEBIT',
      'DEBIT_INVOICE',
      v_required,
      v_balance_before,
      v_balance_after,
      v_invoice.invoice_number,
      'Potong otomatis saldo wallet untuk pembayaran invoice',
      p_actor_user_id,
      jsonb_build_object('invoice_number', v_invoice.invoice_number, 'source', 'wallet_auto_payment')
    );
  END IF;

  UPDATE public.invoices
  SET
    status = 'PAID',
    paid_at = NOW(),
    verified_at = NOW(),
    verified_by = p_actor_user_id,
    payment_method_type = 'WALLET_BALANCE',
    notes = trim(BOTH FROM concat_ws(E'\n', notes, '[AUTO_WALLET_PAID] Invoice dibayar otomatis dari saldo wallet.')),
    updated_at = NOW()
  WHERE id = v_invoice.id
    AND status IN ('PENDING', 'AWAITING_VERIFICATION');

  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_ledger
    WHERE invoice_id = v_invoice.id
  ) THEN
    INSERT INTO public.financial_ledger (
      invoice_id,
      tenant_id,
      transaction_date,
      transaction_type,
      gross_amount,
      xendit_fee,
      vat_amount,
      ppn_amount,
      pph_amount,
      net_amount,
      payment_source,
      payment_method,
      reference_number,
      notes,
      metadata
    ) VALUES (
      v_invoice.id,
      v_invoice.tenant_id,
      CURRENT_DATE,
      'PAYMENT',
      COALESCE(v_invoice.gross_amount, 0),
      0,
      COALESCE(v_invoice.vat_amount, 0),
      COALESCE(v_invoice.ppn_amount, 0),
      COALESCE(v_invoice.pph_amount, 0),
      GREATEST(COALESCE(v_invoice.gross_amount, 0) - COALESCE(v_invoice.vat_amount, 0), 0),
      'MANUAL',
      'WALLET_BALANCE',
      v_invoice.invoice_number,
      'Pembayaran invoice otomatis dari saldo wallet tenant',
      jsonb_build_object('source', 'wallet_auto_payment', 'invoice_number', v_invoice.invoice_number)
    );
  END IF;

  RETURN jsonb_build_object(
    'applied', TRUE,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'paid_amount', v_required,
    'wallet_balance_before', v_balance_before,
    'wallet_balance_after', v_balance_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.on_invoice_paid_credit_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'PAID' THEN
    PERFORM public.credit_wallet_unique_code(NEW.id, NEW.verified_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_paid_credit_unique_code ON public.invoices;
CREATE TRIGGER trg_invoice_paid_credit_unique_code
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW
WHEN (NEW.status = 'PAID')
EXECUTE FUNCTION public.on_invoice_paid_credit_unique_code();

CREATE OR REPLACE FUNCTION public.get_tenant_wallet_snapshot(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.tenant_wallets%ROWTYPE;
  v_actor UUID := auth.uid();
  v_actor_tenant_id UUID;
  v_transactions JSONB := '[]'::jsonb;
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

  SELECT * INTO v_wallet FROM public.ensure_tenant_wallet(p_tenant_id);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'tenant_id', t.tenant_id,
        'invoice_id', t.invoice_id,
        'direction', t.direction,
        'transaction_type', t.transaction_type,
        'amount', t.amount,
        'balance_before', t.balance_before,
        'balance_after', t.balance_after,
        'reference', t.reference,
        'notes', t.notes,
        'created_at', t.created_at,
        'metadata', t.metadata
      )
      ORDER BY t.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_transactions
  FROM (
    SELECT *
    FROM public.tenant_wallet_transactions
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200)
  ) t;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'wallet_id', v_wallet.id,
    'balance', COALESCE(v_wallet.balance, 0),
    'transactions', v_transactions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_or_get_manual_invoice(
  p_tenant_id UUID,
  p_subscription_id UUID,
  p_package_id UUID,
  p_package_name TEXT,
  p_package_duration_months INTEGER,
  p_package_discount_percentage NUMERIC,
  p_employee_count INTEGER,
  p_price_per_employee NUMERIC,
  p_subtotal NUMERIC,
  p_discount_amount NUMERIC,
  p_vat_percentage NUMERIC,
  p_vat_amount NUMERIC,
  p_gross_amount NUMERIC,
  p_xendit_fee NUMERIC,
  p_net_amount NUMERIC,
  p_due_date DATE,
  p_unique_code INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing public.invoices%ROWTYPE;
  v_inserted public.invoices%ROWTYPE;
  v_invoice_number TEXT;
  v_ppn_percentage NUMERIC := 11;
  v_pph_percentage NUMERIC := 2;
  v_internal_tax_percentage NUMERIC := 13;
  v_subtotal NUMERIC;
  v_discount_amount NUMERIC;
  v_base_amount NUMERIC;
  v_ppn_amount NUMERIC;
  v_pph_amount NUMERIC;
  v_internal_tax_amount NUMERIC;
  v_gross_amount NUMERIC;
  v_wallet_apply_result JSONB := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (
    p_tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden tenant access';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT, 20260221));

  SELECT *
  INTO v_existing
  FROM public.invoices
  WHERE tenant_id = p_tenant_id
    AND status IN ('PENDING', 'AWAITING_VERIFICATION')
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_wallet_apply_result := public.apply_wallet_to_invoice_if_possible(v_existing.id, auth.uid());

    SELECT * INTO v_existing FROM public.invoices WHERE id = v_existing.id LIMIT 1;

    RETURN jsonb_build_object(
      'id', v_existing.id,
      'invoice_number', v_existing.invoice_number,
      'gross_amount', v_existing.gross_amount,
      'status', v_existing.status,
      'due_date', v_existing.due_date,
      'payment_method_type', v_existing.payment_method_type,
      'unique_code', COALESCE((v_existing.metadata->>'unique_code')::INTEGER, 0),
      'reused', TRUE,
      'wallet_applied', COALESCE((v_wallet_apply_result->>'applied')::BOOLEAN, FALSE),
      'wallet_apply', v_wallet_apply_result
    );
  END IF;

  SELECT public.generate_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL OR btrim(v_invoice_number) = '' THEN
    RAISE EXCEPTION 'Nomor faktur otomatis tidak tersedia';
  END IF;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
      WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
      ELSE NULL
    END,
    11
  )
  INTO v_ppn_percentage
  FROM public.billing_settings
  WHERE setting_key = 'vat_percentage'
  LIMIT 1;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
      WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
      ELSE NULL
    END,
    2
  )
  INTO v_pph_percentage
  FROM public.billing_settings
  WHERE setting_key = 'pph_percentage'
  LIMIT 1;

  v_internal_tax_percentage := v_ppn_percentage + v_pph_percentage;
  v_subtotal := GREATEST(COALESCE(p_subtotal, 0), 0);
  v_discount_amount := GREATEST(COALESCE(p_discount_amount, 0), 0);
  v_base_amount := GREATEST(v_subtotal - v_discount_amount, 0);
  v_ppn_amount := ROUND(v_base_amount * (v_ppn_percentage / 100), 0);
  v_pph_amount := ROUND(v_base_amount * (v_pph_percentage / 100), 0);
  v_internal_tax_amount := v_ppn_amount + v_pph_amount;
  v_gross_amount := v_base_amount + v_internal_tax_amount + GREATEST(COALESCE(p_unique_code, 0), 0);

  INSERT INTO public.invoices (
    tenant_id,
    subscription_id,
    package_id,
    package_name,
    package_duration_months,
    package_discount_percentage,
    employee_count,
    price_per_employee,
    subtotal,
    discount_amount,
    vat_percentage,
    vat_amount,
    ppn_percentage,
    pph_percentage,
    ppn_amount,
    pph_amount,
    gross_amount,
    xendit_fee,
    net_amount,
    invoice_number,
    status,
    payment_method_type,
    due_date,
    metadata,
    notes
  )
  VALUES (
    p_tenant_id,
    p_subscription_id,
    p_package_id,
    p_package_name,
    p_package_duration_months,
    p_package_discount_percentage,
    p_employee_count,
    p_price_per_employee,
    v_subtotal,
    v_discount_amount,
    v_internal_tax_percentage,
    v_internal_tax_amount,
    v_ppn_percentage,
    v_pph_percentage,
    v_ppn_amount,
    v_pph_amount,
    v_gross_amount,
    0,
    v_gross_amount,
    v_invoice_number,
    'PENDING',
    'MANUAL_TRANSFER',
    p_due_date,
    jsonb_build_object('unique_code', p_unique_code),
    COALESCE(p_notes, format('Angka unik: %s', p_unique_code))
  )
  RETURNING * INTO v_inserted;

  v_wallet_apply_result := public.apply_wallet_to_invoice_if_possible(v_inserted.id, auth.uid());

  SELECT * INTO v_inserted FROM public.invoices WHERE id = v_inserted.id LIMIT 1;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'invoice_number', v_inserted.invoice_number,
    'gross_amount', v_inserted.gross_amount,
    'status', v_inserted.status,
    'due_date', v_inserted.due_date,
    'payment_method_type', v_inserted.payment_method_type,
    'unique_code', p_unique_code,
    'reused', FALSE,
    'wallet_applied', COALESCE((v_wallet_apply_result->>'applied')::BOOLEAN, FALSE),
    'wallet_apply', v_wallet_apply_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_get_manual_invoice(
  UUID,
  UUID,
  UUID,
  TEXT,
  INTEGER,
  NUMERIC,
  INTEGER,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  DATE,
  INTEGER,
  TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_tenant_wallet_snapshot(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wallet_to_invoice_if_possible(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_unique_code(UUID, UUID) TO authenticated;
