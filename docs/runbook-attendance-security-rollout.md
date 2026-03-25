# Runbook Rollout Attendance Security

Dokumen ini adalah versi operator-ready untuk mengaktifkan kembali policy keamanan absensi yang:
- memaksa Android memakai APK/WebView
- tetap mengizinkan Safari iPhone
- memblok browser desktop
- mengaktifkan device binding
- mewajibkan lokasi realtime
- memverifikasi `native_app_code` ringan untuk APK resmi

## Target Policy

```json
{
  "block_all_browsers": true,
  "allow_iphone_safari": true,
  "block_desktop_browser": true,
  "enable_device_binding": true,
  "require_realtime_location": true,
  "min_android_version": 7,
  "native_app_code": "AKN1",
  "max_device_reset_count": 3,
  "require_password_change_for_reset": true,
  "otp_send_rate_limit_enabled": true,
  "otp_send_max_attempts": 3,
  "otp_send_window_minutes": 60,
  "otp_send_lockout_minutes": 60
}
```

## Risiko Utama Sebelum Aktivasi

- akun yang sudah punya `employees.android_id` lama, terutama pola `WEB-*`, bisa kena `DEVICE_BINDING_MISMATCH`
- user desktop akan langsung terblokir
- iPhone Safari hanya lolos jika binding perangkatnya memang cocok atau masih first bind
- APK lama yang belum membawa `app_code` aktif akan gagal di jalur native/absensi Android WebView setelah policy ini diterapkan

## Urutan Eksekusi

1. backup database remote
2. preview akun `WEB-*`
3. pilih tenant uji
4. dry-run reset binding tenant uji
5. jika aman, reset binding tenant uji
6. apply policy `attendance_security`
7. verifikasi `native_app_code` di `system_settings.attendance_security`
8. smoke test Android APK, Android browser, iPhone Safari, desktop, mismatch, dan reset device
9. rollback parsial bila ada gangguan besar

## File Pendukung

- checklist operator:
  [ops/attendance-security-rollout-checklist.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/attendance-security-rollout-checklist.md)
- SQL template:
  [ops/sql/attendance-security-rollout-template.sql](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/sql/attendance-security-rollout-template.sql)

## Perintah Awal

Backup:

```bash
npm run db:backup:supabase
```

## Aturan Praktis

- mulai dari tenant uji, jangan langsung global
- lakukan di luar jam absensi sibuk
- siapkan operator reset device
- jangan mengubah `.env.local` atau `.env.online` sebagai bagian dari rollout ini
- saat bump APK, pastikan file unduhan publik ikut diganti ke versi yang sudah membawa `app_code` aktif
- jika `native_app_code` dirotasi, APK publik lama harus dianggap tidak berlaku

## Kapan Rollback

Rollback dipertimbangkan jika:
- banyak akun nyata langsung terkunci karena mismatch
- Android APK tidak bisa check-in padahal seharusnya lolos
- iPhone Safari gagal untuk akun yang memang menjadi fallback resmi
- operator reset device tidak sanggup mengejar volume masalah

Urutan rollback:
1. longgarkan `block_desktop_browser`
2. longgarkan `block_all_browsers`
3. langkah terakhir, nonaktifkan `enable_device_binding`
