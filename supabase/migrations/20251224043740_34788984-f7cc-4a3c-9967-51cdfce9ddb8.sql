-- Add expiry date to employee_invitations
ALTER TABLE public.employee_invitations 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS invitation_type VARCHAR(20) DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS opd_id UUID REFERENCES public.opd(id),
ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES public.offices(id),
ADD COLUMN IF NOT EXISTS is_used BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE;

-- Create organization_type_settings table for type-specific settings
CREATE TABLE IF NOT EXISTS public.organization_type_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_type VARCHAR(50) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_type, setting_key)
);

-- Enable RLS
ALTER TABLE public.organization_type_settings ENABLE ROW LEVEL SECURITY;

-- Create policies - only super_admin can manage
CREATE POLICY "Super admins can view org type settings"
ON public.organization_type_settings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

CREATE POLICY "Super admins can manage org type settings"
ON public.organization_type_settings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Insert default settings for each organization type
INSERT INTO public.organization_type_settings (organization_type, setting_key, setting_value, description) VALUES
-- Pemerintah Daerah
('pemerintah_daerah', 'employee_fields', '{"required": ["nip", "golongan", "opd_id"], "optional": ["gelar_depan", "gelar_belakang"]}', 'Field pegawai yang wajib diisi'),
('pemerintah_daerah', 'attendance_rules', '{"tolerance_minutes": 15, "require_photo": false, "require_location": true}', 'Aturan absensi'),
('pemerintah_daerah', 'leave_types', '{"enabled": ["cuti_tahunan", "cuti_penting", "sakit", "izin", "tugas_luar"]}', 'Jenis cuti yang aktif'),
('pemerintah_daerah', 'work_schedule', '{"default_start": "07:30", "default_end": "16:00", "work_days": [1,2,3,4,5]}', 'Jadwal kerja default'),

-- Instansi Pemerintah
('instansi_pemerintah', 'employee_fields', '{"required": ["nip", "golongan"], "optional": ["gelar_depan", "gelar_belakang"]}', 'Field pegawai yang wajib diisi'),
('instansi_pemerintah', 'attendance_rules', '{"tolerance_minutes": 15, "require_photo": false, "require_location": true}', 'Aturan absensi'),
('instansi_pemerintah', 'leave_types', '{"enabled": ["cuti_tahunan", "cuti_penting", "sakit", "izin", "tugas_luar"]}', 'Jenis cuti yang aktif'),
('instansi_pemerintah', 'work_schedule', '{"default_start": "08:00", "default_end": "16:00", "work_days": [1,2,3,4,5]}', 'Jadwal kerja default'),

-- Perusahaan
('perusahaan', 'employee_fields', '{"required": ["employee_category"], "optional": ["position"]}', 'Field pegawai yang wajib diisi'),
('perusahaan', 'attendance_rules', '{"tolerance_minutes": 10, "require_photo": true, "require_location": true}', 'Aturan absensi'),
('perusahaan', 'leave_types', '{"enabled": ["cuti_tahunan", "sakit", "izin"]}', 'Jenis cuti yang aktif'),
('perusahaan', 'work_schedule', '{"default_start": "08:00", "default_end": "17:00", "work_days": [1,2,3,4,5]}', 'Jadwal kerja default'),

-- Sekolah
('sekolah', 'employee_fields', '{"required": ["position", "work_unit_id"], "optional": ["nip"]}', 'Field pegawai yang wajib diisi'),
('sekolah', 'attendance_rules', '{"tolerance_minutes": 5, "require_photo": false, "require_location": true}', 'Aturan absensi'),
('sekolah', 'leave_types', '{"enabled": ["cuti_tahunan", "sakit", "izin"]}', 'Jenis cuti yang aktif'),
('sekolah', 'work_schedule', '{"default_start": "07:00", "default_end": "14:00", "work_days": [1,2,3,4,5,6]}', 'Jadwal kerja default')
ON CONFLICT (organization_type, setting_key) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_organization_type_settings_updated_at
BEFORE UPDATE ON public.organization_type_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();