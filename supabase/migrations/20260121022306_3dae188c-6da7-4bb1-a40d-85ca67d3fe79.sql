-- =====================================================
-- TABEL: mutation_requests (Pengajuan Mutasi)
-- Untuk pengajuan perubahan profil atau pindah OPD/Satuan Kerja/Lokasi Kerja
-- =====================================================

CREATE TABLE public.mutation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  
  -- Jenis mutasi: 'profile_change' atau 'transfer'
  mutation_type TEXT NOT NULL CHECK (mutation_type IN ('profile_change', 'transfer')),
  
  -- Status pengajuan
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
  
  -- Data yang diajukan untuk diubah (JSON)
  -- Berisi field-field yang ingin diubah beserta nilai barunya
  requested_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Data lama sebelum perubahan (untuk audit trail)
  original_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Alasan pengajuan mutasi
  reason TEXT NOT NULL,
  
  -- Referensi dokumen administratif lama (legacy)
  attachment_url TEXT,
  
  -- Approval info
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mutation_requests ENABLE ROW LEVEL SECURITY;

-- Index untuk performa query
CREATE INDEX idx_mutation_requests_employee_id ON public.mutation_requests(employee_id);
CREATE INDEX idx_mutation_requests_tenant_id ON public.mutation_requests(tenant_id);
CREATE INDEX idx_mutation_requests_status ON public.mutation_requests(status);
CREATE INDEX idx_mutation_requests_created_at ON public.mutation_requests(created_at DESC);

-- RLS Policies

-- Karyawan bisa melihat pengajuan mutasi miliknya sendiri
CREATE POLICY "Users can view their own mutation requests"
ON public.mutation_requests
FOR SELECT
USING (
  (employee_id = get_user_employee_id(auth.uid()))
  OR is_super_admin(auth.uid())
  OR has_role(auth.uid(), 'admin_instansi'::app_role)
  OR has_role(auth.uid(), 'atasan'::app_role)
);

-- Karyawan bisa membuat pengajuan mutasi untuk diri sendiri
CREATE POLICY "Users can create their own mutation requests"
ON public.mutation_requests
FOR INSERT
WITH CHECK (employee_id = get_user_employee_id(auth.uid()));

-- Karyawan bisa update pengajuan yang masih menunggu
-- Admin/Super Admin bisa update semua pengajuan (untuk approve/reject)
CREATE POLICY "Users can update their own pending requests"
ON public.mutation_requests
FOR UPDATE
USING (
  ((employee_id = get_user_employee_id(auth.uid())) AND (status = 'menunggu'))
  OR is_super_admin(auth.uid())
  OR has_role(auth.uid(), 'admin_instansi'::app_role)
);

-- Karyawan bisa menghapus pengajuan yang masih menunggu
CREATE POLICY "Users can delete their own pending requests"
ON public.mutation_requests
FOR DELETE
USING (
  (employee_id = get_user_employee_id(auth.uid())) AND (status = 'menunggu')
);

-- Trigger untuk update updated_at
CREATE TRIGGER update_mutation_requests_updated_at
BEFORE UPDATE ON public.mutation_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
