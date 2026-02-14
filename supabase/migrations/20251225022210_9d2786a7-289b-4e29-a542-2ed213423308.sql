-- Create storage bucket for organization logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('organization-logos', 'organization-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for APK files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('apk-files', 'apk-files', true, 104857600, ARRAY['application/vnd.android.package-archive', 'application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for organization-logos bucket
CREATE POLICY "Anyone can view organization logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'organization-logos');

CREATE POLICY "Admin can upload organization logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'organization-logos' AND
  (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Admin can update organization logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'organization-logos' AND
  (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Admin can delete organization logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'organization-logos' AND
  (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role))
);

-- RLS policies for apk-files bucket
CREATE POLICY "Anyone can view APK files"
ON storage.objects FOR SELECT
USING (bucket_id = 'apk-files');

CREATE POLICY "Admin can upload APK files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'apk-files' AND
  (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Admin can delete APK files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'apk-files' AND
  (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role))
);