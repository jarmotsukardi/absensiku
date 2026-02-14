-- Create employee_invitations table for invitation system
CREATE TABLE public.employee_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    phone TEXT,
    name TEXT NOT NULL,
    nik TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    invitation_code TEXT NOT NULL UNIQUE,
    invited_by UUID REFERENCES public.employees(id),
    verified_by UUID REFERENCES public.employees(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invitations
CREATE POLICY "Admin can manage invitations" ON public.employee_invitations
FOR ALL USING (
    is_super_admin(auth.uid()) OR 
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Anyone can view invitation by code" ON public.employee_invitations
FOR SELECT USING (true);

-- Create news/announcements table for organization
CREATE TABLE public.news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    is_published BOOLEAN DEFAULT true,
    is_global BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.employees(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- RLS Policies for news
CREATE POLICY "Admin can manage news" ON public.news
FOR ALL USING (
    is_super_admin(auth.uid()) OR 
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Users can view published news" ON public.news
FOR SELECT USING (
    is_published = true AND (
        is_global = true OR 
        tenant_id = get_user_tenant_id(auth.uid()) OR
        is_super_admin(auth.uid())
    )
);

-- Create FAQ table
CREATE TABLE public.faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for FAQs
CREATE POLICY "Admin can manage FAQs" ON public.faqs
FOR ALL USING (
    is_super_admin(auth.uid()) OR 
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Users can view active FAQs" ON public.faqs
FOR SELECT USING (
    is_active = true AND (
        tenant_id IS NULL OR 
        tenant_id = get_user_tenant_id(auth.uid()) OR
        is_super_admin(auth.uid())
    )
);

-- Add landing page settings columns to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS landing_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS landing_description TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS landing_hero_image TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS apk_url TEXT;

-- Add updated_at trigger
CREATE TRIGGER update_employee_invitations_updated_at
    BEFORE UPDATE ON public.employee_invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_news_updated_at
    BEFORE UPDATE ON public.news
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_faqs_updated_at
    BEFORE UPDATE ON public.faqs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();