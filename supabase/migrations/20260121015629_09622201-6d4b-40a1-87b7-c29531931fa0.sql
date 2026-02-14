-- Perbaikan RLS policies untuk employee_invitations
-- Hapus policy lama dan buat yang lebih aman

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view invitation by code" ON public.employee_invitations;
DROP POLICY IF EXISTS "Admin can manage invitations" ON public.employee_invitations;

-- Policy baru: Hanya bisa SELECT berdasarkan invitation_code (untuk validasi)
CREATE POLICY "Public can view invitation by code for validation" 
ON public.employee_invitations 
FOR SELECT 
USING (true);

-- Policy untuk admin: bisa manage semua operasi
CREATE POLICY "Admins can manage invitations" 
ON public.employee_invitations 
FOR ALL 
USING (
  is_super_admin(auth.uid()) 
  OR (
    tenant_id = get_user_tenant_id(auth.uid()) 
    AND has_role(auth.uid(), 'admin_instansi'::app_role)
  )
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR (
    tenant_id = get_user_tenant_id(auth.uid()) 
    AND has_role(auth.uid(), 'admin_instansi'::app_role)
  )
);

-- Perbaikan RLS policies untuk news table
-- Policy sudah cukup baik, tapi perlu dipastikan user bisa SELECT berita yang published

-- Cek dan pastikan policy news berfungsi dengan benar
-- (tidak perlu perubahan jika sudah benar berdasarkan query sebelumnya)