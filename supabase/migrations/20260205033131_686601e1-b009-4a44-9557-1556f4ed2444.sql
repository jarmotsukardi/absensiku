-- =============================================
-- SISTEM PENGAJUAN LEMBUR (OVERTIME REQUEST SYSTEM)
-- =============================================

-- 1. Tabel pengaturan lembur per tenant
CREATE TABLE IF NOT EXISTS public.overtime_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT true,
    min_hours NUMERIC(4,2) DEFAULT 1.0,
    max_hours_per_day NUMERIC(4,2) DEFAULT 4.0,
    max_hours_per_month NUMERIC(5,2) DEFAULT 40.0,
    requires_approval BOOLEAN DEFAULT true,
    rate_multiplier NUMERIC(3,2) DEFAULT 1.5,
    weekend_rate_multiplier NUMERIC(3,2) DEFAULT 2.0,
    holiday_rate_multiplier NUMERIC(3,2) DEFAULT 2.5,
    allow_multi_date_request BOOLEAN DEFAULT true,
    max_dates_per_request INTEGER DEFAULT 10,
    auto_reject_after_days INTEGER DEFAULT 3,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_overtime_settings_tenant UNIQUE (tenant_id)
);

-- 2. Tabel pengajuan lembur
CREATE TABLE IF NOT EXISTS public.overtime_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    request_number VARCHAR(50) NOT NULL,
    total_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    approved_by UUID REFERENCES public.employees(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabel detail tanggal lembur (multi-date support)
CREATE TABLE IF NOT EXISTS public.overtime_request_dates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    overtime_request_id UUID NOT NULL REFERENCES public.overtime_requests(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    hours NUMERIC(4,2) NOT NULL,
    is_weekend BOOLEAN DEFAULT false,
    is_holiday BOOLEAN DEFAULT false,
    rate_multiplier NUMERIC(3,2) DEFAULT 1.5,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.overtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overtime_request_dates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for overtime_settings
CREATE POLICY "Super admin can manage all overtime settings"
    ON public.overtime_settings FOR ALL
    USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Admin instansi can manage own tenant overtime settings"
    ON public.overtime_settings FOR ALL
    USING (
        public.has_role(auth.uid(), 'admin_instansi') 
        AND tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "Employees can view own tenant overtime settings"
    ON public.overtime_settings FOR SELECT
    USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for overtime_requests
CREATE POLICY "Super admin can manage all overtime requests"
    ON public.overtime_requests FOR ALL
    USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Admin instansi can manage own tenant overtime requests"
    ON public.overtime_requests FOR ALL
    USING (
        public.has_role(auth.uid(), 'admin_instansi') 
        AND tenant_id = public.get_user_tenant_id(auth.uid())
    );

CREATE POLICY "Employees can view own overtime requests"
    ON public.overtime_requests FOR SELECT
    USING (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Employees can create own overtime requests"
    ON public.overtime_requests FOR INSERT
    WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

CREATE POLICY "Employees can update own pending overtime requests"
    ON public.overtime_requests FOR UPDATE
    USING (
        employee_id = public.get_user_employee_id(auth.uid()) 
        AND status = 'pending'
    );

-- RLS Policies for overtime_request_dates
CREATE POLICY "Super admin can manage all overtime request dates"
    ON public.overtime_request_dates FOR ALL
    USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view overtime request dates they have access to"
    ON public.overtime_request_dates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.overtime_requests r
            WHERE r.id = overtime_request_id
            AND (
                r.employee_id = public.get_user_employee_id(auth.uid())
                OR (
                    public.has_role(auth.uid(), 'admin_instansi')
                    AND r.tenant_id = public.get_user_tenant_id(auth.uid())
                )
            )
        )
    );

CREATE POLICY "Employees can create overtime request dates for own requests"
    ON public.overtime_request_dates FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.overtime_requests r
            WHERE r.id = overtime_request_id
            AND r.employee_id = public.get_user_employee_id(auth.uid())
            AND r.status = 'pending'
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_overtime_requests_employee ON public.overtime_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_tenant ON public.overtime_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_status ON public.overtime_requests(status);
CREATE INDEX IF NOT EXISTS idx_overtime_request_dates_request ON public.overtime_request_dates(overtime_request_id);
CREATE INDEX IF NOT EXISTS idx_overtime_request_dates_date ON public.overtime_request_dates(date);

-- Function to generate overtime request number
CREATE OR REPLACE FUNCTION public.generate_overtime_request_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    year_month TEXT;
    seq_num INTEGER;
    request_num TEXT;
BEGIN
    year_month := TO_CHAR(NOW(), 'YYYYMM');
    
    SELECT COUNT(*) + 1 INTO seq_num
    FROM public.overtime_requests
    WHERE tenant_id = p_tenant_id
    AND request_number LIKE 'OT-' || year_month || '-%';
    
    request_num := 'OT-' || year_month || '-' || LPAD(seq_num::TEXT, 4, '0');
    
    RETURN request_num;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_overtime_settings_updated_at
    BEFORE UPDATE ON public.overtime_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_overtime_requests_updated_at
    BEFORE UPDATE ON public.overtime_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add Xendit sandbox mode to billing_settings
INSERT INTO public.billing_settings (setting_key, setting_value, description)
VALUES (
    'xendit_sandbox_mode',
    '{"enabled": true, "log_requests": true}'::jsonb,
    'Mode sandbox untuk testing payment gateway tanpa API key production'
)
ON CONFLICT (setting_key) DO NOTHING;