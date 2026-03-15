INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-employee-documents',
  'hr-employee-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "HR docs read" ON storage.objects;
DROP POLICY IF EXISTS "HR docs upload" ON storage.objects;
DROP POLICY IF EXISTS "HR docs update" ON storage.objects;
DROP POLICY IF EXISTS "HR docs delete" ON storage.objects;

CREATE POLICY "HR docs read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'hr-employee-documents'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
    OR public.has_role(auth.uid(), 'atasan'::public.app_role)
  )
);

CREATE POLICY "HR docs upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'hr-employee-documents'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

CREATE POLICY "HR docs update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'hr-employee-documents'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

CREATE POLICY "HR docs delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'hr-employee-documents'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);
