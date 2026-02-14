-- Tambah kolom 'purpose' pada password_reset_otps jika belum ada
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'password_reset_otps' 
    AND column_name = 'purpose'
  ) THEN
    ALTER TABLE public.password_reset_otps ADD COLUMN purpose TEXT DEFAULT 'password_reset';
  END IF;
END $$;

-- Create self_registered_users table untuk menyimpan data user yang registrasi mandiri
CREATE TABLE IF NOT EXISTS public.self_registered_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  whatsapp TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pending_invitation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_self_registered_users_user_id ON public.self_registered_users(user_id);
CREATE INDEX IF NOT EXISTS idx_self_registered_users_status ON public.self_registered_users(status);

-- Enable RLS
ALTER TABLE public.self_registered_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for self_registered_users
-- Users can view their own data
CREATE POLICY "Users can view their own registration"
  ON public.self_registered_users
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own data  
CREATE POLICY "Users can update their own registration"
  ON public.self_registered_users
  FOR UPDATE
  USING (user_id = auth.uid());

-- System can insert (via service role)
CREATE POLICY "System can insert registrations"
  ON public.self_registered_users
  FOR INSERT
  WITH CHECK (true);

-- Super admin can view all
CREATE POLICY "Super admin can view all registrations"
  ON public.self_registered_users
  FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_self_registered_users_updated_at
  BEFORE UPDATE ON public.self_registered_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();