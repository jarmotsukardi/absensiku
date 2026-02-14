-- Add additional billing settings for Xendit config and manual bank
INSERT INTO public.billing_settings (setting_key, setting_value, description)
VALUES 
  ('xendit_config', '{"secret_key": "", "callback_token": "", "is_production": false}'::jsonb, 'Konfigurasi API Xendit'),
  ('manual_bank_account', '{"bank_name": "", "account_number": "", "account_name": ""}'::jsonb, 'Rekening bank untuk pembayaran manual')
ON CONFLICT (setting_key) DO NOTHING;

-- Add payment_proof_url column to invoices if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'payment_proof_url'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN payment_proof_url TEXT;
  END IF;
END $$;

-- Add verified_by and verified_at columns to invoices if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'verified_by'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN verified_by UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add package_id and package_discount_percentage to invoices if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'package_id'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN package_id UUID REFERENCES public.subscription_packages(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'package_discount_percentage'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN package_discount_percentage NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Add marketing_staff_id to invoices if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'marketing_staff_id'
  ) THEN
    ALTER TABLE public.invoices ADD COLUMN marketing_staff_id UUID REFERENCES public.marketing_staff(id);
  END IF;
END $$;