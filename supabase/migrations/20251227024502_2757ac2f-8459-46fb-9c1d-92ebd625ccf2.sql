
-- Create storage bucket for organization logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization-logos',
  'organization-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- Create policies for organization logos bucket
CREATE POLICY "Public can view organization logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'organization-logos');

CREATE POLICY "Authenticated users can upload organization logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'organization-logos' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their organization logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'organization-logos'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete their organization logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'organization-logos'
  AND auth.role() = 'authenticated'
);
