INSERT INTO public.system_settings (key, value, description, updated_at)
VALUES (
  'attendance_scalability',
  jsonb_build_object(
    'version', 2,
    'mode', 'manual',
    'tier', 'large',
    'suggested_tier', 'large',
    'effective_tier', 'large',
    'peak_hour_enabled', true,
    'peak_hour_windows', jsonb_build_array(
      jsonb_build_object('name', 'check_in', 'start', '06:30', 'end', '09:00'),
      jsonb_build_object('name', 'check_out', 'start', '16:00', 'end', '18:30')
    ),
    'peak_hour_hold_sync', true,
    'queue_only_ingest', false,
    'offpeak_release_strategy', 'client_after_window',
    'release_jitter_min_ms', 15000,
    'release_jitter_max_ms', 120000,
    'admin_visibility_mode', 'final_only_with_backlog',
    'logout_pending_policy', 'keep_local_pending'
  ),
  'Konfigurasi skalabilitas absensi versi 2 untuk autoscale bertahap dan peak-hour buffering.',
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = (
    COALESCE(public.system_settings.value, '{}'::jsonb)
    || jsonb_build_object(
      'version', 2,
      'peak_hour_enabled', COALESCE((public.system_settings.value->>'peak_hour_enabled')::boolean, true),
      'peak_hour_windows', COALESCE(
        public.system_settings.value->'peak_hour_windows',
        jsonb_build_array(
          jsonb_build_object('name', 'check_in', 'start', '06:30', 'end', '09:00'),
          jsonb_build_object('name', 'check_out', 'start', '16:00', 'end', '18:30')
        )
      ),
      'peak_hour_hold_sync', COALESCE((public.system_settings.value->>'peak_hour_hold_sync')::boolean, false),
      'queue_only_ingest', COALESCE((public.system_settings.value->>'queue_only_ingest')::boolean, false),
      'offpeak_release_strategy', COALESCE(NULLIF(public.system_settings.value->>'offpeak_release_strategy', ''), 'client_after_window'),
      'release_jitter_min_ms', COALESCE((public.system_settings.value->>'release_jitter_min_ms')::integer, 15000),
      'release_jitter_max_ms', COALESCE((public.system_settings.value->>'release_jitter_max_ms')::integer, 120000),
      'admin_visibility_mode', COALESCE(NULLIF(public.system_settings.value->>'admin_visibility_mode', ''), 'final_only_with_backlog'),
      'logout_pending_policy', COALESCE(NULLIF(public.system_settings.value->>'logout_pending_policy', ''), 'keep_local_pending'),
      'suggested_tier', COALESCE(NULLIF(public.system_settings.value->>'suggested_tier', ''), COALESCE(NULLIF(public.system_settings.value->>'effective_tier', ''), NULLIF(public.system_settings.value->>'tier', ''), 'large'))
    )
  ),
  description = 'Konfigurasi skalabilitas absensi versi 2 untuk autoscale bertahap dan peak-hour buffering.',
  updated_at = now();
