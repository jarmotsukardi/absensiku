
-- =============================================
-- FIX 1: Remove overly permissive storage policies
-- =============================================

-- Drop permissive "authenticated" policies that bypass role checks
DROP POLICY IF EXISTS "Authenticated users can upload organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view organization logos" ON storage.objects;

-- The role-based policies (Admin can upload/delete/update organization logos) already exist and are correct.
-- The "Anyone can view organization logos" policy already exists for public read access.

-- =============================================
-- FIX 2: Restrict APK uploads to super_admin only
-- =============================================

-- Drop existing APK upload policy (allows admin_instansi too)
DROP POLICY IF EXISTS "Admin can upload APK files" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete APK files" ON storage.objects;

-- Recreate APK policies - super_admin only
CREATE POLICY "Super admin can upload APK files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'apk-files'
  AND public.is_super_admin(auth.uid())
);

CREATE POLICY "Super admin can delete APK files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'apk-files'
  AND public.is_super_admin(auth.uid())
);

-- =============================================
-- FIX 3: Fix attendance_records_partitioned atasan policy
-- The current policy allows ANY atasan to see ALL records across tenants
-- =============================================

DROP POLICY IF EXISTS "Users can view attendance_part in their tenant" ON public.attendance_records_partitioned;

-- Recreate with proper tenant scoping
CREATE POLICY "Users can view attendance_part in their tenant"
ON public.attendance_records_partitioned
FOR SELECT
USING (
  employee_id = public.get_user_employee_id(auth.uid())
  OR public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_records_partitioned.employee_id
      AND e.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  )
  OR (
    public.has_role(auth.uid(), 'atasan'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_records_partitioned.employee_id
      AND e.supervisor_id = public.get_user_employee_id(auth.uid())
    )
  )
);

-- Also fix admin manage policy to scope to tenant
DROP POLICY IF EXISTS "Admin can manage attendance_part" ON public.attendance_records_partitioned;

CREATE POLICY "Admin can manage attendance_part"
ON public.attendance_records_partitioned
FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_records_partitioned.employee_id
      AND e.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  )
);
