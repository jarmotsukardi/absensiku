-- Attendance Security Global Cutover
-- Paket operator-ready untuk:
-- 1) preview dua akun existing binding WEB-*
-- 2) dry-run reset binding
-- 3) eksekusi reset binding
-- 4) apply policy attendance_security global
-- 5) verifikasi pasca-cutover
--
-- Akun target:
-- - susibangka78@gmail.com
-- - lisfa82328729@gmail.com

-- =========================================================
-- 1. PREVIEW AKUN TARGET
-- =========================================================
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
where u.email in (
  'susibangka78@gmail.com',
  'lisfa82328729@gmail.com'
)
order by u.email;

-- =========================================================
-- 2. DRY-RUN RESET BINDING
-- Jalankan bagian ini dulu, lalu pastikan hasilnya aman.
-- =========================================================
begin;

update public.employees e
set
  android_id = null,
  device_id_reset_count = 0,
  device_id_last_reset = now(),
  updated_at = now()
from auth.users u
where u.id = e.user_id
  and u.email in (
    'susibangka78@gmail.com',
    'lisfa82328729@gmail.com'
  );

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
where u.email in (
  'susibangka78@gmail.com',
  'lisfa82328729@gmail.com'
)
order by u.email;

rollback;

-- =========================================================
-- 3. EKSEKUSI RESET BINDING
-- Hapus komentar setelah dry-run diverifikasi aman.
-- =========================================================
--
-- update public.employees e
-- set
--   android_id = null,
--   device_id_reset_count = 0,
--   device_id_last_reset = now(),
--   updated_at = now()
-- from auth.users u
-- where u.id = e.user_id
--   and u.email in (
--     'susibangka78@gmail.com',
--     'lisfa82328729@gmail.com'
--   );

-- =========================================================
-- 4. APPLY POLICY ATTENDANCE SECURITY GLOBAL
-- Hapus komentar hanya saat siap cutover.
-- =========================================================
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

-- =========================================================
-- 5. VERIFIKASI PASCA-RESET / PASCA-CUTOVER
-- =========================================================

-- Verifikasi dua akun target:
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
where u.email in (
  'susibangka78@gmail.com',
  'lisfa82328729@gmail.com'
)
order by u.email;

-- Verifikasi policy global:
select
  key,
  value
from public.system_settings
where key = 'attendance_security';

-- =========================================================
-- 6. ROLLBACK PARSIAL BERTAHAP
-- Jalankan berurutan jika ada gangguan besar pasca-cutover.
-- =========================================================

-- A. Longgarkan desktop browser:
-- update public.system_settings
-- set value = jsonb_set(value, '{block_desktop_browser}', 'false'::jsonb, true),
--     updated_at = now()
-- where key = 'attendance_security';

-- B. Longgarkan semua browser:
-- update public.system_settings
-- set value = jsonb_set(value, '{block_all_browsers}', 'false'::jsonb, true),
--     updated_at = now()
-- where key = 'attendance_security';

-- C. Langkah terakhir, nonaktifkan device binding:
-- update public.system_settings
-- set value = jsonb_set(value, '{enable_device_binding}', 'false'::jsonb, true),
--     updated_at = now()
-- where key = 'attendance_security';
