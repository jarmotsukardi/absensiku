-- ============================================
-- A. MANAJEMEN ORGANISASI & PEGAWAI
-- ============================================

-- 1. Tambah kolom subscription_settings ke organization_type_settings
-- untuk mengatur default trial per tipe organisasi
ALTER TABLE public.organization_type_settings 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general';

-- 2. Tambah kolom untuk APK upload di tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS apk_version VARCHAR(20),
ADD COLUMN IF NOT EXISTS apk_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS npwp VARCHAR(30),
ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20),
ADD COLUMN IF NOT EXISTS owner_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS owner_verified_at TIMESTAMP WITH TIME ZONE;

-- 3. Buat tabel untuk admin OPD
CREATE TABLE IF NOT EXISTS public.opd_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opd_id UUID NOT NULL REFERENCES public.opd(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    can_approve_leave BOOLEAN DEFAULT true,
    can_view_reports BOOLEAN DEFAULT true,
    can_export_reports BOOLEAN DEFAULT true,
    can_invite_employees BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES public.employees(id),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(opd_id, employee_id)
);

ALTER TABLE public.opd_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage OPD admins" ON public.opd_admins
FOR ALL USING (
    is_super_admin(auth.uid()) OR 
    (EXISTS (
        SELECT 1 FROM employees e 
        WHERE e.user_id = auth.uid() 
        AND e.tenant_id = (SELECT tenant_id FROM opd WHERE id = opd_admins.opd_id)
    ) AND has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "OPD admins can view their OPD" ON public.opd_admins
FOR SELECT USING (
    employee_id = get_user_employee_id(auth.uid())
);

-- 4. Buat tabel untuk hari libur nasional Indonesia (bisa digunakan semua tenant)
CREATE TABLE IF NOT EXISTS public.national_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    year INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.national_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view national holidays" ON public.national_holidays
FOR SELECT USING (true);

CREATE POLICY "Super admin can manage national holidays" ON public.national_holidays
FOR ALL USING (is_super_admin(auth.uid()));

-- 5. Buat tabel untuk pembayaran manual
CREATE TABLE IF NOT EXISTS public.manual_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id),
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    account_name VARCHAR(255),
    transfer_proof_url TEXT,
    reference_number VARCHAR(100),
    payment_date DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    verified_by UUID REFERENCES public.employees(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    notes TEXT,
    invoice_number VARCHAR(50),
    invoice_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admin can view their payments" ON public.manual_payments
FOR SELECT USING (
    tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid())
);

CREATE POLICY "Tenant admin can create payments" ON public.manual_payments
FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid())
);

CREATE POLICY "Super admin can manage all payments" ON public.manual_payments
FOR ALL USING (is_super_admin(auth.uid()));

-- 6. Buat tabel untuk pengaturan halaman depan (layout builder)
CREATE TABLE IF NOT EXISTS public.homepage_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_key VARCHAR(50) NOT NULL UNIQUE,
    section_name VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view enabled sections" ON public.homepage_sections
FOR SELECT USING (true);

CREATE POLICY "Super admin can manage sections" ON public.homepage_sections
FOR ALL USING (is_super_admin(auth.uid()));

-- Insert default sections
INSERT INTO public.homepage_sections (section_key, section_name, sort_order, is_enabled, settings) VALUES
('hero', 'Hero Banner', 1, true, '{"showCTA": true}'),
('features', 'Fitur Unggulan', 2, true, '{}'),
('clients', 'Logo Klien/Mitra', 3, true, '{}'),
('payment_methods', 'Metode Pembayaran', 4, true, '{}'),
('articles', 'Artikel/Berita', 5, true, '{}'),
('testimonials', 'Testimoni', 6, false, '{}'),
('faq', 'FAQ', 7, true, '{}'),
('cta', 'Call to Action', 8, true, '{}'),
('footer', 'Footer', 9, true, '{}')
ON CONFLICT (section_key) DO NOTHING;

-- 7. Buat tabel untuk artikel/berita global
CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    excerpt TEXT,
    image_url TEXT,
    category VARCHAR(50) DEFAULT 'umum',
    is_published BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    author_id UUID REFERENCES public.employees(id),
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published articles" ON public.articles
FOR SELECT USING (is_published = true OR is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage articles" ON public.articles
FOR ALL USING (is_super_admin(auth.uid()));

-- 8. Buat tabel untuk logo klien/mitra
CREATE TABLE IF NOT EXISTS public.client_logos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    logo_url TEXT NOT NULL,
    website_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.client_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active logos" ON public.client_logos
FOR SELECT USING (is_active = true OR is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage logos" ON public.client_logos
FOR ALL USING (is_super_admin(auth.uid()));

-- 9. Buat tabel untuk metode pembayaran yang ditampilkan
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    logo_url TEXT,
    type VARCHAR(50) DEFAULT 'bank',
    account_number VARCHAR(50),
    account_name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active payment methods" ON public.payment_methods
FOR SELECT USING (is_active = true OR is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage payment methods" ON public.payment_methods
FOR ALL USING (is_super_admin(auth.uid()));

-- 10. Update subscriptions untuk menambah detail langganan
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS max_offices INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS price_per_month DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS price_per_employee DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 11. Buat index untuk performa
CREATE INDEX IF NOT EXISTS idx_opd_admins_opd_id ON public.opd_admins(opd_id);
CREATE INDEX IF NOT EXISTS idx_opd_admins_employee_id ON public.opd_admins(employee_id);
CREATE INDEX IF NOT EXISTS idx_manual_payments_tenant_id ON public.manual_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_manual_payments_status ON public.manual_payments(status);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON public.articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_published ON public.articles(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_national_holidays_year ON public.national_holidays(year);
CREATE INDEX IF NOT EXISTS idx_national_holidays_date ON public.national_holidays(date);