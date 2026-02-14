-- Tambahkan kolom untuk tracking device session
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS last_login_device_id TEXT,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Create index untuk query performance
CREATE INDEX IF NOT EXISTS idx_employees_last_login_device ON public.employees(last_login_device_id);

-- Comment kolom baru
COMMENT ON COLUMN public.employees.last_login_device_id IS 'Device ID terakhir yang login untuk single device session validation';
COMMENT ON COLUMN public.employees.last_login_at IS 'Timestamp login terakhir';