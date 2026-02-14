-- Create notifications table
CREATE TABLE public.notifications (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT false,
    link TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- Super admins and admins can insert notifications
CREATE POLICY "Admins can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role) OR has_role(auth.uid(), 'atasan'::app_role));

-- Super admins can manage all notifications
CREATE POLICY "Super admins can manage all notifications"
ON public.notifications
FOR ALL
USING (is_super_admin(auth.uid()));

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create system_settings table for super admin configuration
CREATE TABLE public.system_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_by UUID
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage system settings
CREATE POLICY "Super admins can manage system settings"
ON public.system_settings
FOR ALL
USING (is_super_admin(auth.uid()));

-- Everyone can view system settings
CREATE POLICY "Anyone can view system settings"
ON public.system_settings
FOR SELECT
USING (true);

-- Insert default system settings
INSERT INTO public.system_settings (key, value, description) VALUES
('site_name', '"AbsensiKu"', 'Nama aplikasi'),
('site_description', '"Sistem Absensi Digital Berbasis GPS"', 'Deskripsi aplikasi'),
('maintenance_mode', 'false', 'Mode maintenance'),
('max_trial_days', '30', 'Jumlah hari trial'),
('max_trial_employees', '3', 'Maksimal pegawai trial'),
('attendance_radius_default', '100', 'Radius default absensi dalam meter'),
('late_tolerance_default', '15', 'Toleransi terlambat default dalam menit');