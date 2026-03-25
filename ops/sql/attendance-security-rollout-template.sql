-- Attendance Security Rollout Template
-- Isi TENANT_ID target bila ingin reset binding WEB-* pada tenant uji terlebih dahulu.
-- Jalankan langkah ini secara bertahap dan selalu backup DB remote sebelum write.

-- 1) Preview akun dengan binding WEB-* (global)
select
  e.id as employee_id,
  u.email,
  e.name,
  e.tenant_id,
  e.android_id,
  e.last_login_device_id,
  e.device_id_reset_count,
  e.device_id_last_reset
from public.employees e
join auth.users u on u.id = e.user_id
where coalesce(e.android_id, '') like 'WEB-%'
order by e.tenant_id, e.name;

-- 2) Preview akun WEB-* di tenant tertentu
select
  e.id as employee_id,
  u.email,
  e.name,
  e.tenant_id,
  e.android_id,
  e.last_login_device_id,
  e.device_id_reset_count
from public.employees e
join auth.users u on u.id = e.user_id
where e.tenant_id = 'TENANT_ID'
  and coalesce(e.android_id, '') like 'WEB-%'
order by e.name;

-- 3) Dry-run reset binding WEB-* untuk tenant tertentu
begin;

update public.employees
set
  android_id = null,
  device_id_reset_count = 0,
  device_id_last_reset = now(),
  updated_at = now()
where tenant_id = 'TENANT_ID'
  and coalesce(android_id, '') like 'WEB-%';

select
  e.id as employee_id,
  u.email,
  e.name,
  e.tenant_id,
  e.android_id,
  e.device_id_reset_count,
  e.device_id_last_reset
from public.employees e
join auth.users u on u.id = e.user_id
where e.tenant_id = 'TENANT_ID'
order by e.name;

rollback;

-- 4) Eksekusi reset binding WEB-* untuk tenant tertentu
-- Hapus komentar setelah dry-run diverifikasi aman.
--
-- update public.employees
-- set
--   android_id = null,
--   device_id_reset_count = 0,
--   device_id_last_reset = now(),
--   updated_at = now()
-- where tenant_id = 'TENANT_ID'
--   and coalesce(android_id, '') like 'WEB-%';

-- 5) Apply policy attendance_security target
-- Sesuaikan hanya jika benar-benar siap cutover.
--
-- update public.system_settings
-- set
--   value = jsonb_build_object(
--     'block_all_browsers', true,
--     'allow_iphone_safari', true,
--     'block_desktop_browser', true,
--     'enable_device_binding', true,
--     'require_realtime_location', true,
--     'min_android_version', 7,
--     'max_device_reset_count', 3,
--     'require_password_change_for_reset', true,
--     'otp_send_rate_limit_enabled', true,
--     'otp_send_max_attempts', 3,
--     'otp_send_window_minutes', 60,
--     'otp_send_lockout_minutes', 60
--   ),
--   updated_at = now()
-- where key = 'attendance_security';

-- 6) Verifikasi policy aktif
select value
from public.system_settings
where key = 'attendance_security';

-- 7) Rollback parsial bertahap bila diperlukan
-- Longgarkan desktop lebih dulu:
-- update public.system_settings
-- set value = jsonb_set(value, '{block_desktop_browser}', 'false'::jsonb, true),
--     updated_at = now()
-- where key = 'attendance_security';
--
-- Longgarkan browser umum:
-- update public.system_settings
-- set value = jsonb_set(value, '{block_all_browsers}', 'false'::jsonb, true),
--     updated_at = now()
-- where key = 'attendance_security';
--
-- Langkah terakhir, nonaktifkan device binding:
-- update public.system_settings
-- set value = jsonb_set(value, '{enable_device_binding}', 'false'::jsonb, true),
--     updated_at = now()
-- where key = 'attendance_security';
