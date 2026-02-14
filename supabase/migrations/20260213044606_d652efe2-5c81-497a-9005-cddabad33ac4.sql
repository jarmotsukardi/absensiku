
-- Create announcements table for organization-specific announcements
CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admin can manage announcements"
ON public.announcements FOR ALL
USING (
  is_super_admin(auth.uid()) OR
  (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Employees can view published announcements in their tenant"
ON public.announcements FOR SELECT
USING (
  is_published = true AND tenant_id = get_user_tenant_id(auth.uid())
);

-- Index
CREATE INDEX idx_announcements_tenant_published ON public.announcements(tenant_id, is_published, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
