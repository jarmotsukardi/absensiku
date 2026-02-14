-- Buat bucket untuk gambar berita
INSERT INTO storage.buckets (id, name, public) VALUES ('news-images', 'news-images', true) ON CONFLICT DO NOTHING;

-- Policy: Anyone can view images
CREATE POLICY "Anyone can view news images" ON storage.objects FOR SELECT USING (bucket_id = 'news-images');

-- Policy: Authenticated users in same tenant can upload
CREATE POLICY "Authenticated users can upload news images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'news-images' AND auth.uid() IS NOT NULL);

-- Policy: Authenticated users can update their uploads
CREATE POLICY "Authenticated users can update news images" ON storage.objects FOR UPDATE USING (bucket_id = 'news-images' AND auth.uid() IS NOT NULL);

-- Policy: Authenticated users can delete their uploads
CREATE POLICY "Authenticated users can delete news images" ON storage.objects FOR DELETE USING (bucket_id = 'news-images' AND auth.uid() IS NOT NULL);