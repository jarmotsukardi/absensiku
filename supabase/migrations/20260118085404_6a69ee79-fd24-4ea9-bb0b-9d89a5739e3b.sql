-- Tabel untuk permohonan absensi khusus
CREATE TABLE public.flexible_attendance_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    request_date DATE NOT NULL,
    reason_type TEXT NOT NULL, -- dinas_luar, rapat_eksternal, kunjungan_lapangan, tugas_pimpinan, kegiatan_instansi
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'menunggu', -- menunggu, disetujui, ditolak
    approved_by UUID REFERENCES public.employees(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index untuk query cepat
CREATE INDEX idx_flex_req_employee ON public.flexible_attendance_requests(employee_id);
CREATE INDEX idx_flex_req_tenant_status ON public.flexible_attendance_requests(tenant_id, status);
CREATE INDEX idx_flex_req_date ON public.flexible_attendance_requests(request_date);

-- Trigger updated_at
CREATE TRIGGER update_flexible_attendance_requests_updated_at
    BEFORE UPDATE ON public.flexible_attendance_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.flexible_attendance_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Pegawai bisa lihat permohonan sendiri
CREATE POLICY "Pegawai dapat melihat permohonan sendiri"
    ON public.flexible_attendance_requests
    FOR SELECT
    USING (employee_id = public.get_user_employee_id(auth.uid()));

-- Policy: Pegawai bisa buat permohonan sendiri
CREATE POLICY "Pegawai dapat membuat permohonan"
    ON public.flexible_attendance_requests
    FOR INSERT
    WITH CHECK (employee_id = public.get_user_employee_id(auth.uid()));

-- Policy: Admin instansi bisa lihat semua permohonan di tenant-nya
CREATE POLICY "Admin dapat melihat semua permohonan tenant"
    ON public.flexible_attendance_requests
    FOR SELECT
    USING (
        public.has_role(auth.uid(), 'admin_instansi'::public.app_role) 
        AND tenant_id = public.get_user_tenant_id(auth.uid())
    );

-- Policy: Admin instansi bisa update permohonan di tenant-nya
CREATE POLICY "Admin dapat update permohonan tenant"
    ON public.flexible_attendance_requests
    FOR UPDATE
    USING (
        public.has_role(auth.uid(), 'admin_instansi'::public.app_role) 
        AND tenant_id = public.get_user_tenant_id(auth.uid())
    );

-- Policy: Super admin bisa akses semua
CREATE POLICY "Super admin akses penuh"
    ON public.flexible_attendance_requests
    FOR ALL
    USING (public.is_super_admin(auth.uid()));