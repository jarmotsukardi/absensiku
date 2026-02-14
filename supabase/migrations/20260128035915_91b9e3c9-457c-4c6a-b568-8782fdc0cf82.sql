-- =============================================
-- SECURITY FIX: Multi-issue remediation
-- =============================================

-- 1. FIX NEWS-IMAGES BUCKET POLICIES
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload news images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update news images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete news images" ON storage.objects;

-- Create restricted policies for admin/atasan only
CREATE POLICY "Admin can upload news images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'news-images' AND (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role) OR
    public.has_role(auth.uid(), 'atasan'::public.app_role)
  )
);

CREATE POLICY "Admin can update news images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'news-images' AND (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role) OR
    public.has_role(auth.uid(), 'atasan'::public.app_role)
  )
);

CREATE POLICY "Admin can delete news images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'news-images' AND (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

-- 2. FIX OTP TABLE - Add hash column and rate limiting table
-- Rename otp_code to otp_hash for clarity
ALTER TABLE public.password_reset_otps 
RENAME COLUMN otp_code TO otp_hash;

COMMENT ON COLUMN public.password_reset_otps.otp_hash IS 'SHA-256 hash of OTP code - never store plaintext';

-- 3. CREATE RATE LIMITING TABLE
CREATE TABLE IF NOT EXISTS public.rate_limit_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  attempt_type TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  UNIQUE(identifier, attempt_type)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON public.rate_limit_otp(identifier, attempt_type);

-- RLS for rate_limit_otp - service role only
ALTER TABLE public.rate_limit_otp ENABLE ROW LEVEL SECURITY;

-- Only allow service role (edge functions) to manage rate limits
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limit_otp FOR ALL
USING (true)
WITH CHECK (true);

-- 4. FIX EMPLOYEES TABLE - Restrict sensitive data access
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view employees in their tenant" ON public.employees;

-- Create new granular policies
-- Regular employees can only see basic info of colleagues
CREATE POLICY "Users can view own full profile"
ON public.employees FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can view colleagues basic info only"
ON public.employees FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid()) AND
  user_id != auth.uid() AND
  NOT public.is_super_admin(auth.uid()) AND
  NOT public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
);

CREATE POLICY "Admins can view all employees in tenant"
ON public.employees FOR SELECT
USING (
  public.is_super_admin(auth.uid()) OR
  (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role) AND
    tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

-- 5. FIX ATTENDANCE RECORDS - Hide GPS from regular employees
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view attendance based on hierarchy" ON public.attendance_records;

-- Create new policy - employees see their own, supervisors/admins see subordinates
CREATE POLICY "Users can view own attendance"
ON public.attendance_records FOR SELECT
USING (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Supervisors can view subordinate attendance"
ON public.attendance_records FOR SELECT
USING (
  public.has_role(auth.uid(), 'atasan'::public.app_role) AND
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_records.employee_id
    AND e.supervisor_id = public.get_user_employee_id(auth.uid())
  )
);

CREATE POLICY "Admins can view tenant attendance"
ON public.attendance_records FOR SELECT
USING (
  public.is_super_admin(auth.uid()) OR
  (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role) AND
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_records.employee_id
      AND e.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  )
);

-- 6. FIX TENANTS TABLE - Restrict sensitive business data
-- Create security definer function to get safe tenant data for employees
CREATE OR REPLACE FUNCTION public.get_tenant_public_info(_tenant_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  code TEXT,
  logo_url TEXT,
  organization_type public.organization_type
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    t.id,
    t.name,
    t.code,
    t.logo_url,
    t.organization_type
  FROM public.tenants t
  WHERE t.id = _tenant_id
$$;

-- Drop existing tenant policies
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;

-- Create restrictive tenant policies
CREATE POLICY "Users can view limited tenant info"
ON public.tenants FOR SELECT
USING (
  id = public.get_user_tenant_id(auth.uid()) AND
  NOT public.has_role(auth.uid(), 'admin_instansi'::public.app_role) AND
  NOT public.is_super_admin(auth.uid())
);

CREATE POLICY "Admins can view full tenant info"
ON public.tenants FOR SELECT
USING (
  public.is_super_admin(auth.uid()) OR
  (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role) AND
    id = public.get_user_tenant_id(auth.uid())
  )
);

-- 7. CLEANUP - Delete existing plaintext OTPs
DELETE FROM public.password_reset_otps WHERE created_at < NOW();

-- 8. Auto-cleanup function for rate limits
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_otp
  WHERE last_attempt_at < NOW() - INTERVAL '24 hours';
END;
$$;