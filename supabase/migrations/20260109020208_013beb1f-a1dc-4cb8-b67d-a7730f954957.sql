-- Add system settings for access restriction during work hours and 2FA
INSERT INTO system_settings (key, value, description)
VALUES 
  ('restrict_access_during_attendance', 'false', 'Batasi akses ke halaman non-absensi saat jam sibuk absensi'),
  ('access_restriction_buffer_hours', '3', 'Jam buffer setelah jam pulang sebelum akses dibuka kembali'),
  ('admin_2fa_enabled', 'false', 'Aktifkan 2FA untuk login Super Admin')
ON CONFLICT (key) DO NOTHING;

-- Create function to auto-update leave requests status after 3 days without response
CREATE OR REPLACE FUNCTION update_expired_leave_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update leave requests that have been pending for more than 3 days
  UPDATE leave_requests
  SET 
    status = 'ditolak',
    rejection_reason = 'Tidak ditanggapi dalam 3 hari',
    updated_at = NOW()
  WHERE status = 'menunggu'
    AND created_at < NOW() - INTERVAL '3 days';
END;
$$;