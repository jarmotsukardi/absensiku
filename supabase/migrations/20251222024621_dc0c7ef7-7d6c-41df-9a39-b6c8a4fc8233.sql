-- Add timezone column to tenants table for multi-tenant timezone support
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta';

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.timezone IS 'IANA Time Zone Database identifier (e.g., Asia/Jakarta, Asia/Makassar, Asia/Jayapura)';

-- Create organization_settings table for additional tenant settings
CREATE TABLE IF NOT EXISTS public.organization_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, setting_key)
);

-- Enable RLS on organization_settings
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization_settings
CREATE POLICY "Admin can manage organization_settings" 
ON public.organization_settings 
FOR ALL 
USING (
    is_super_admin(auth.uid()) OR 
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Users can view organization_settings in their tenant" 
ON public.organization_settings 
FOR SELECT 
USING (
    tenant_id = get_user_tenant_id(auth.uid()) OR 
    is_super_admin(auth.uid())
);

-- Create trigger for updated_at
CREATE TRIGGER update_organization_settings_updated_at
    BEFORE UPDATE ON public.organization_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();