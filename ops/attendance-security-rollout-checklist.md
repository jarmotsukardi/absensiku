# Checklist Rollout Attendance Security

Gunakan checklist ini saat mengaktifkan kembali policy keamanan absensi yang membatasi akses browser, mengaktifkan device binding, dan mewajibkan lokasi realtime.

## Header Eksekusi

- Tanggal:
- Jam mulai:
- Operator:
- Environment:
- Ref backup DB:

## Setting Aktif

- `block_all_browsers`:
- `allow_iphone_safari`:
- `block_desktop_browser`:
- `enable_device_binding`:
- `require_realtime_location`:
- `min_android_version`:
- `max_device_reset_count`:
- `require_password_change_for_reset`:
- `otp_send_rate_limit_enabled`:
- `otp_send_max_attempts`:
- `otp_send_window_minutes`:
- `otp_send_lockout_minutes`:

## Pra-Aktivasi

- [ ] Backup database remote sudah dibuat
- [ ] Nilai `attendance_security` saat ini sudah dicatat
- [ ] Akun uji employee Android tersedia
- [ ] Akun uji employee iPhone Safari tersedia
- [ ] Akun uji desktop browser tersedia
- [ ] Operator reset device siap standby

## Skenario 1: Android APK/WebView

- Akun uji:
- Login:
- Dashboard tampil:
- Check-in:
- Check-out:
- Hasil:
- Ref error jika ada:

## Skenario 2: Android Browser Biasa

- Device/browser:
- Buka `/employee/login`:
- Diblok:
- Hasil:
- Ref error jika ada:

## Skenario 3: iPhone Safari

- Device:
- Login:
- Dashboard tampil:
- Akses absensi:
- Hasil:
- Ref error jika ada:

## Skenario 4: Desktop Browser

- Device/browser:
- Buka `/employee/login`:
- Diblok:
- Hasil:
- Ref error jika ada:

## Skenario 5: Device Binding

- Device A dipakai absensi:
- Device B dicoba:
- Ditolak mismatch:
- Hasil:
- Ref error jika ada:

## Skenario 6: Reset Device

- Akun uji:
- OTP terkirim:
- Verifikasi OTP:
- Reset berhasil:
- Counter reset berubah:
- Hasil:
- Ref error jika ada:

## Skenario 7: Lokasi Realtime

- GPS aktif:
- Lokasi realtime valid:
- Lokasi stale/invalid ditolak:
- Hasil:
- Ref error jika ada:

## Ringkasan

- Status akhir:
- Masalah ditemukan:
- Perlu rollback: ya/tidak
- Jika rollback, langkah yang diambil:
- Catatan operator:

## Urutan Rollback Bertahap

1. Longgarkan `block_desktop_browser`
2. Jika masih bermasalah, longgarkan `block_all_browsers`
3. Langkah terakhir, nonaktifkan `enable_device_binding`

