-- ============================================
-- BILLING & PAYMENT GATEWAY SYSTEM
-- ============================================

-- 1. BILLING SETTINGS (Pengaturan Harga & Konfigurasi)
CREATE TABLE public.billing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default billing settings
INSERT INTO public.billing_settings (setting_key, setting_value, description) VALUES
('price_per_employee', '{"amount": 15000, "currency": "IDR"}'::jsonb, 'Harga per pegawai per bulan'),
('vat_percentage', '{"value": 11}'::jsonb, 'Persentase PPN'),
('grace_period_days', '{"value": 3}'::jsonb, 'Jumlah hari grace period setelah expired'),
('individual_min_duration_months', '{"value": 6}'::jsonb, 'Durasi minimum langganan perorangan (bulan)'),
('xendit_enabled', '{"value": false}'::jsonb, 'Apakah Xendit aktif'),
('manual_payment_enabled', '{"value": true}'::jsonb, 'Apakah pembayaran manual aktif');

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view billing settings" ON public.billing_settings
  FOR SELECT USING (true);

CREATE POLICY "Super admin can manage billing settings" ON public.billing_settings
  FOR ALL USING (is_super_admin(auth.uid()));

-- 2. SUBSCRIPTION PACKAGES (Paket Berlangganan)
CREATE TABLE public.subscription_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months IN (1, 3, 6, 12)),
  base_price_per_month NUMERIC NOT NULL DEFAULT 15000,
  discount_percentage NUMERIC NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  is_active BOOLEAN DEFAULT true,
  applies_to TEXT NOT NULL DEFAULT 'ALL' CHECK (applies_to IN ('ALL', 'INSTITUTION', 'INDIVIDUAL')),
  description TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default packages
INSERT INTO public.subscription_packages (name, duration_months, base_price_per_month, discount_percentage, applies_to, description, sort_order) VALUES
('Bulanan', 1, 15000, 0, 'ALL', 'Paket fleksibel tanpa komitmen jangka panjang', 1),
('Triwulan', 3, 15000, 5, 'ALL', 'Hemat 5% dengan berlangganan 3 bulan', 2),
('Semester', 6, 15000, 10, 'ALL', 'Rekomendasi! Hemat 10% dengan berlangganan 6 bulan', 3),
('Tahunan', 12, 15000, 15, 'ALL', 'Hemat maksimal 15% dengan berlangganan 1 tahun', 4);

ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages" ON public.subscription_packages
  FOR SELECT USING (is_active = true OR is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage packages" ON public.subscription_packages
  FOR ALL USING (is_super_admin(auth.uid()));

-- 3. INVOICES (Tagihan untuk Institusi/Tenant)
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id),
  invoice_number TEXT NOT NULL UNIQUE,
  external_id TEXT, -- Xendit invoice ID
  
  -- Package Snapshot (WAJIB untuk audit)
  package_id UUID REFERENCES public.subscription_packages(id),
  package_name TEXT,
  package_duration_months INTEGER,
  package_discount_percentage NUMERIC,
  
  -- Pricing
  employee_count INTEGER NOT NULL DEFAULT 1,
  price_per_employee NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  vat_percentage NUMERIC NOT NULL DEFAULT 11,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  gross_amount NUMERIC NOT NULL,
  xendit_fee NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'AWAITING_VERIFICATION')),
  payment_method_type TEXT CHECK (payment_method_type IN ('XENDIT', 'MANUAL_TRANSFER')),
  
  -- URLs & References
  invoice_url TEXT,
  payment_proof_url TEXT,
  
  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  
  -- Verification (for manual payment)
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Marketing/Sales tracking (1 invoice = 1 marketing)
  marketing_id UUID,
  marketing_name TEXT,
  marketing_incentive_percentage NUMERIC DEFAULT 0,
  marketing_incentive_amount NUMERIC DEFAULT 0,
  
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_external_id ON public.invoices(external_id);
CREATE INDEX idx_invoices_invoice_number ON public.invoices(invoice_number);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admin can view their invoices" ON public.invoices
  FOR SELECT USING (
    tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid())
  );

CREATE POLICY "Super admin can manage all invoices" ON public.invoices
  FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "System can insert invoices" ON public.invoices
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid())
  );

-- 4. FINANCIAL LEDGER (Buku Besar Keuangan)
CREATE TABLE public.financial_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id),
  tenant_id UUID REFERENCES public.tenants(id),
  
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('PAYMENT', 'REFUND', 'ADJUSTMENT')),
  
  gross_amount NUMERIC NOT NULL,
  xendit_fee NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  
  payment_source TEXT NOT NULL CHECK (payment_source IN ('XENDIT', 'MANUAL')),
  payment_method TEXT, -- e.g., 'BANK_BCA', 'VIRTUAL_ACCOUNT', 'EWALLET_OVO'
  
  reference_number TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_financial_ledger_date ON public.financial_ledger(transaction_date);
CREATE INDEX idx_financial_ledger_tenant ON public.financial_ledger(tenant_id);

ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view financial ledger" ON public.financial_ledger
  FOR SELECT USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage financial ledger" ON public.financial_ledger
  FOR ALL USING (is_super_admin(auth.uid()));

-- 5. PAYMENT LOGS (Log Webhook Xendit)
CREATE TABLE public.payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id),
  external_id TEXT,
  event_type TEXT NOT NULL, -- e.g., 'invoice.paid', 'invoice.expired'
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_logs_external_id ON public.payment_logs(external_id);
CREATE INDEX idx_payment_logs_processed ON public.payment_logs(processed);

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view payment logs" ON public.payment_logs
  FOR SELECT USING (is_super_admin(auth.uid()));

CREATE POLICY "System can insert payment logs" ON public.payment_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update payment logs" ON public.payment_logs
  FOR UPDATE USING (true);

-- 6. NOTIFICATION LOGS (Log Email/WhatsApp)
CREATE TABLE public.billing_notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id),
  invoice_id UUID REFERENCES public.invoices(id),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('EMAIL', 'WHATSAPP', 'PUSH')),
  recipient TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'DELIVERED')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_notification_logs_tenant ON public.billing_notification_logs(tenant_id);

ALTER TABLE public.billing_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage notification logs" ON public.billing_notification_logs
  FOR ALL USING (is_super_admin(auth.uid()));

-- 7. MARKETING/SALES STAFF (Untuk tracking insentif)
CREATE TABLE public.marketing_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  incentive_percentage NUMERIC NOT NULL DEFAULT 5 CHECK (incentive_percentage >= 0 AND incentive_percentage <= 50),
  is_active BOOLEAN DEFAULT true,
  total_sales_count INTEGER DEFAULT 0,
  total_sales_amount NUMERIC DEFAULT 0,
  total_incentive_earned NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage marketing staff" ON public.marketing_staff
  FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "Marketing can view own data" ON public.marketing_staff
  FOR SELECT USING (user_id = auth.uid());

-- 8. Update subscriptions table to add grace period tracking
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS grace_period_end DATE,
ADD COLUMN IF NOT EXISTS last_invoice_id UUID REFERENCES public.invoices(id),
ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'MONTHLY';

-- 9. Function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_month TEXT;
  seq_num INTEGER;
  invoice_num TEXT;
BEGIN
  year_month := TO_CHAR(NOW(), 'YYYYMM');
  
  SELECT COUNT(*) + 1 INTO seq_num
  FROM public.invoices
  WHERE invoice_number LIKE 'INV-' || year_month || '-%';
  
  invoice_num := 'INV-' || year_month || '-' || LPAD(seq_num::TEXT, 4, '0');
  
  RETURN invoice_num;
END;
$$;

-- 10. Function to calculate invoice amounts
CREATE OR REPLACE FUNCTION public.calculate_invoice_amounts(
  p_employee_count INTEGER,
  p_duration_months INTEGER,
  p_price_per_employee NUMERIC,
  p_discount_percentage NUMERIC,
  p_vat_percentage NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  subtotal NUMERIC;
  discount_amount NUMERIC;
  amount_after_discount NUMERIC;
  vat_amount NUMERIC;
  gross_amount NUMERIC;
BEGIN
  -- Calculate subtotal
  subtotal := p_employee_count * p_price_per_employee * p_duration_months;
  
  -- Calculate discount
  discount_amount := subtotal * (p_discount_percentage / 100);
  amount_after_discount := subtotal - discount_amount;
  
  -- Calculate VAT
  vat_amount := amount_after_discount * (p_vat_percentage / 100);
  
  -- Gross amount
  gross_amount := amount_after_discount + vat_amount;
  
  RETURN jsonb_build_object(
    'subtotal', subtotal,
    'discount_amount', discount_amount,
    'amount_after_discount', amount_after_discount,
    'vat_amount', vat_amount,
    'gross_amount', gross_amount
  );
END;
$$;

-- 11. Function to check and update subscription status
CREATE OR REPLACE FUNCTION public.check_subscription_status(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription RECORD;
  v_grace_days INTEGER;
  v_new_status TEXT;
BEGIN
  -- Get grace period days from settings
  SELECT (setting_value->>'value')::INTEGER INTO v_grace_days
  FROM public.billing_settings
  WHERE setting_key = 'grace_period_days';
  
  v_grace_days := COALESCE(v_grace_days, 3);
  
  -- Get current subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE tenant_id = p_tenant_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN 'NO_SUBSCRIPTION';
  END IF;
  
  -- Check status based on dates
  IF v_subscription.end_date >= CURRENT_DATE THEN
    v_new_status := 'active';
  ELSIF v_subscription.end_date + v_grace_days >= CURRENT_DATE THEN
    v_new_status := 'grace_period';
  ELSE
    v_new_status := 'expired';
  END IF;
  
  -- Update if changed
  IF v_subscription.status::TEXT != v_new_status THEN
    UPDATE public.subscriptions
    SET status = v_new_status::subscription_status,
        grace_period_end = CASE 
          WHEN v_new_status = 'grace_period' THEN v_subscription.end_date + v_grace_days
          ELSE NULL
        END,
        updated_at = NOW()
    WHERE id = v_subscription.id;
  END IF;
  
  RETURN v_new_status;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_billing_settings_updated_at
  BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_packages_updated_at
  BEFORE UPDATE ON public.subscription_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_staff_updated_at
  BEFORE UPDATE ON public.marketing_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();