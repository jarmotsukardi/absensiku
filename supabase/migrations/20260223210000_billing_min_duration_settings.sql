-- Seed minimum duration settings for billing policies.
-- Existing rows are preserved; defaults only apply when key is missing.

INSERT INTO public.billing_settings (setting_key, setting_value, description)
VALUES
  (
    'individual_min_duration_months',
    '{"value": 6}'::jsonb,
    'Durasi minimum langganan billing mandiri (bulan). Opsi: 1/3/6/12.'
  ),
  (
    'centralized_min_duration_pemerintah_daerah_months',
    '{"value": 12}'::jsonb,
    'Durasi minimum langganan billing terpusat untuk Pemerintah Daerah (bulan). Opsi: 1/3/6/12.'
  ),
  (
    'centralized_min_duration_instansi_pemerintah_months',
    '{"value": 1}'::jsonb,
    'Durasi minimum langganan billing terpusat untuk Instansi Pemerintah (bulan). Opsi: 1/3/6/12.'
  ),
  (
    'centralized_min_duration_perusahaan_months',
    '{"value": 1}'::jsonb,
    'Durasi minimum langganan billing terpusat untuk Perusahaan (bulan). Opsi: 1/3/6/12.'
  ),
  (
    'centralized_min_duration_sekolah_months',
    '{"value": 6}'::jsonb,
    'Durasi minimum langganan billing terpusat untuk Sekolah (bulan). Opsi: 1/3/6/12.'
  )
ON CONFLICT (setting_key) DO NOTHING;
