-- Create positions table for job positions management
CREATE TABLE public.positions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    opd_id UUID REFERENCES public.opd(id) ON DELETE SET NULL,
    work_unit_id UUID REFERENCES public.work_units(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for performance
CREATE INDEX idx_positions_tenant_id ON public.positions(tenant_id);
CREATE INDEX idx_positions_opd_id ON public.positions(opd_id);
CREATE INDEX idx_positions_work_unit_id ON public.positions(work_unit_id);

-- Enable Row Level Security
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admin can manage positions" 
ON public.positions 
FOR ALL 
USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid())) AND has_role(auth.uid(), 'admin_instansi'::app_role)));

CREATE POLICY "Users can view positions in their tenant" 
ON public.positions 
FOR SELECT 
USING ((tenant_id = get_user_tenant_id(auth.uid())) OR is_super_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_positions_updated_at
BEFORE UPDATE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();