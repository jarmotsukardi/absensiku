-- Create work_units table
CREATE TABLE public.work_units (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    opd_id UUID REFERENCES public.opd(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT,
    institution_type TEXT NOT NULL DEFAULT 'pemerintahan',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for better performance
CREATE INDEX idx_work_units_tenant_id ON public.work_units(tenant_id);
CREATE INDEX idx_work_units_opd_id ON public.work_units(opd_id);

-- Enable Row Level Security
ALTER TABLE public.work_units ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admin can manage work units"
ON public.work_units
FOR ALL
USING (
    is_super_admin(auth.uid()) OR 
    (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin_instansi'::app_role))
);

CREATE POLICY "Users can view work units in their tenant"
ON public.work_units
FOR SELECT
USING (
    tenant_id = get_user_tenant_id(auth.uid()) OR is_super_admin(auth.uid())
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_work_units_updated_at
BEFORE UPDATE ON public.work_units
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();