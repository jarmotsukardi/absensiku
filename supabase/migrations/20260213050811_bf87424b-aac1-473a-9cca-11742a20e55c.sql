
-- Add B2B negotiation threshold setting
INSERT INTO public.system_settings (key, value, description)
VALUES ('b2b_negotiation_threshold', '2000', 'Ambang batas jumlah pegawai untuk negosiasi B2B')
ON CONFLICT (key) DO NOTHING;
