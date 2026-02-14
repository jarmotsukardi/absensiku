
-- Feature #3: Billing policy per tenant (terpusat vs mandiri)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'centralized' CHECK (billing_mode IN ('centralized', 'individual'));
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_mode_updated_at timestamptz;

-- Feature #4 & #5: Institution types table (managed by super admin, read-only for org)
CREATE TABLE IF NOT EXISTS public.institution_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  description_html text,
  icon text DEFAULT 'building',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.institution_types ENABLE ROW LEVEL SECURITY;

-- Everyone can read institution types
CREATE POLICY "Anyone can read institution types" ON public.institution_types FOR SELECT USING (true);

-- Only super admin can modify (via service role or RPC)
CREATE POLICY "Super admins can manage institution types" ON public.institution_types 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- Seed default institution types  
INSERT INTO public.institution_types (name, code, description, icon, sort_order) VALUES
  ('Pemerintahan', 'PEMERINTAHAN', 'Instansi pemerintahan daerah seperti Dinas, Badan, dan Kantor', 'landmark', 1),
  ('Rumah Sakit', 'RS', 'Rumah Sakit Umum Daerah (RSUD) dan fasilitas kesehatan tingkat lanjut', 'hospital', 2),
  ('Puskesmas', 'PKM', 'Pusat Kesehatan Masyarakat dan fasilitas kesehatan tingkat pertama', 'building', 3),
  ('Sekolah', 'SEKOLAH', 'Satuan pendidikan dari tingkat dasar hingga menengah', 'graduation', 4),
  ('Pabrik / Manufaktur', 'MANUFAKTUR', 'Biasanya menggunakan 3 shift (Pagi, Sore, Malam) dengan rotasi ketat', 'factory', 5),
  ('Retail / Pusat Perbelanjaan', 'RETAIL', 'Mengikuti jam operasional mall, sering kali ada shift akhir pekan', 'store', 6),
  ('Hotel & Pariwisata', 'HOTEL', 'Operasional 24 jam dengan sistem split shift atau jam kerja fleksibel', 'hotel', 7),
  ('Konstruksi / Proyek', 'KONSTRUKSI', 'Jam kerja sering dimulai lebih pagi, sangat bergantung pada lokasi proyek (GPS)', 'hard-hat', 8),
  ('Logistik & Transportasi', 'LOGISTIK', 'Jam kerja tidak menentu, sering berbasis durasi perjalanan atau on-call', 'truck', 9),
  ('Perusahaan Swasta / Kantor', 'SWASTA', 'Jam kerja standar (9-to-5) dengan kebijakan fleksibel', 'briefcase', 10),
  ('Media & Kreatif', 'MEDIA', 'Biasanya menerapkan jam kerja fleksibel (flexi-time) atau berbasis target', 'palette', 11)
ON CONFLICT (code) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_institution_types_active ON public.institution_types (is_active, sort_order);
