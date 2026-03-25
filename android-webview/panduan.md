# Panduan Android WebView (AbsensiKu)

Panduan ini merangkum alur APK (native) ke WebView dan hal-hal penting untuk menjaga stabilitas dan keamanan.

## Tujuan
- Login native sebagai sumber sesi utama.
- Handoff sesi yang stabil ke WebView.
- Proteksi dasar terhadap fake GPS dan spoofing host.

## Kesepakatan Model Hybrid (API + Cookie Bridge)
Model yang disepakati mengikuti pola ESYATOUR:
1. Login dilakukan **native** ke endpoint mobile auth (JSON).
2. Backend mengembalikan **Set-Cookie** sesi web yang valid.
3. Cookie dari respons login disalin ke `android.webkit.CookieManager`.
4. WebView langsung membuka `/employee/dashboard` **tanpa** melewati `/employee/login`.
5. Endpoint mobile auth **tidak boleh** mengembalikan HTML redirect; semua respons **JSON**.
6. Login web tetap tersedia untuk browser biasa.
7. Pada APK, `/employee/login` harus dibypass ke flow native/bootstrap.

Catatan implementasi ke ABSENSIKU:
- Desain endpoint `/mobile-api/auth/*` (atau Supabase edge function yang set cookie/session).
- Sinkronisasi cookie → WebView sebelum membuka dashboard.
- Alur `/employee/native-bootstrap` selalu langsung ke `/employee/dashboard` tanpa `/employee/login`.
- Login native **tanpa captcha**.
- Login native **bisa menyimpan username & password** (penyimpanan terenkripsi).
- Perilaku login native mengikuti web login: ada tombol `eye`, `lupa password`, `reset password`, OTP via **WA/Email**.
- Data absensi lokal **ikut perilaku web login** (buffer/queue WebView harus dipertahankan dan tidak dihapus agresif).
- **Acuan utama**: pola implementasi mengikuti `ESYATOUR/android-finance-webview`.

## Review (Catatan Audit)
### Temuan Utama (Perlu Perhatian)
- **Rate limit server-side** sebagai pengganti captcha sudah disepakati: **cukup untuk login saja**.
- **Sumber kebenaran sesi** (cookie vs token) dan **masa berlaku** masih perlu ditegaskan: TTL, refresh, dan kondisi expired.

### Temuan Menengah
- Panduan belum menyebut **kebijakan logout** (hapus cookie, sesi, cache). Untuk hybrid, ini penting dan harus konsisten.

## Tambahan (Disepakati)
- Kontrak sesi & TTL: cookie vs token, refresh policy, dan kondisi expired.
- Kebijakan logout: hapus cookie, session native, cache tenant, dan buffer absensi (atau tidak) secara eksplisit.
- Kontrak error code + `Ref ID` untuk semua flow native.
- Hardening ringan `app_code` untuk native login dan absensi:
  - APK mengirim `app_code` singkat dari `BuildConfig.APP_CODE`.
  - Native login menandai request dengan header `X-Absensiku-Native-Client: android-webview`.
  - Server mobile auth menolak native login jika `app_code` salah.
  - RPC absensi Android WebView menolak `client_context.app_code` yang tidak cocok dengan `system_settings.attendance_security.native_app_code`.
- Flow device binding (jika wajib untuk absensi), termasuk fail‑closed policy.
- Kebijakan akses host WebView dan cara menangani external link.
- Uji loop redirect & failover (login → bootstrap → dashboard).

## Rekomendasi Tambahan (Opsional)
- Preflight API sebelum login (status app, maintenance, min version).
- Forced update (blokir versi APK di bawah minimum).
- App attestation (Play Integrity) untuk hardening APK clone.
- Device binding server-side (fail‑closed untuk absensi jika device berubah).
- Session invalidation policy (logout dari web memutus APK).
- Offline notice khusus saat WebView gagal load.
- Retry/backoff saat bootstrap atau refresh.
- Monitoring/trace: semua error auth wajib punya `Ref ID`.
- CSP di web app untuk menekan risiko XSS.
- Pastikan WebView debug nonaktif di release dan `mixedContentMode` aman.

## Tambahan Eksekusi (Opsional)
- Kontrak payload login native (field minimal: `email`, `password`, `device_id`, `app_version`).
- Kontrak response login (field minimal: `ok`, `message`, `dashboard_url`, `session`, `ref_id`).
- Kebijakan retry (jumlah retry login/OTP sebelum error final).
- Batasan logging: jangan log token atau kredensial.

## Checklist UAT Ringkas (Opsional)
- Login sukses → dashboard.
- Login gagal → pesan + `Ref ID`.
- Logout → cookie/session/cache sesuai kebijakan.
- Session expired → kembali ke native login tanpa loop.
- OTP WA/Email → sukses/reset.

## Kontrak API Mobile Auth (Draft)
> Mengikuti pola ESYATOUR, semua response **JSON** dan tidak ada HTML redirect.

### Endpoint
- `POST /mobile-api/auth/login`
- `GET /mobile-api/auth/session`
- `POST /mobile-api/auth/logout`
- `POST /mobile-api/auth/forgot-password/request`
- `POST /mobile-api/auth/forgot-password/verify-otp`
- `POST /mobile-api/auth/forgot-password/reset`

### Payload Login (Request)
```json
{
  "email": "user@contoh.com",
  "password": "secret",
  "device_id": "AND-xxxx",
  "app_version": "1.0.3",
  "app_code": "AKN1"
}
```

Catatan:
- `app_code` wajib untuk flow native Android resmi.
- Login web/browser biasa tetap tidak perlu `app_code`.
- Header native yang dipakai saat ini: `X-Absensiku-Native-Client: android-webview`.

### Response Sukses (Login)
```json
{
  "ok": true,
  "message": "Login berhasil",
  "dashboard_url": "/employee/dashboard",
  "session": {
    "is_expired": false,
    "expires_at": 1710000000,
    "ttl_seconds": 7200
  },
  "ref_id": "REF-LOGIN-OK-001"
}
```

### Response Gagal (Login)
```json
{
  "ok": false,
  "code": "invalid_credentials",
  "message": "Email atau password salah.",
  "ref_id": "REF-LOGIN-ERR-001"
}
```

### Response Session Check
```json
{
  "ok": true,
  "authenticated": true,
  "dashboard_url": "/employee/dashboard",
  "session": {
    "is_expired": false,
    "expires_at": 1710000000,
    "ttl_seconds": 7200
  },
  "ref_id": "REF-SESSION-OK-001"
}
```

### Response Logout
```json
{
  "ok": true,
  "message": "Logout berhasil",
  "ref_id": "REF-LOGOUT-OK-001"
}
```

### Error Code Minimum (Wajib)
- `invalid_credentials`
- `inactive_user`
- `session_expired`
- `rate_limited`
- `otp_invalid`
- `otp_expired`
- `otp_max_attempts`
- `otp_channel_unavailable`
- `validation_error`
- `network_error`

Catatan:
- Semua error wajib menyertakan `ref_id`.
- Rate limit **hanya** untuk login.

## Kebijakan Eksekusi
- Pembuatan APK native login → `/employee/dashboard` **wajib fokus ke inti dulu**.
- Uji/test **baru dilakukan setelah implementasi inti 100% selesai**.

## Alur Startup (Ringkas)
1. App dibuka.
2. Cek konfigurasi build (URL + publishable key).
3. Cek izin lokasi (minta jika belum ada).
4. Jalankan guard mock location / fake GPS.
5. Jika ada sesi native tersimpan dan valid: lanjut bootstrap WebView.
6. Jika tidak ada sesi: tampilkan login native.

## Alur Login Native (Cookie Bridge)
1. User mengisi email + password.
2. App login ke endpoint **/mobile-api/auth/login** (JSON).
3. Backend mengembalikan **Set-Cookie** sesi web yang valid.
4. Cookie disalin ke `CookieManager`.
5. WebView langsung membuka **/employee/dashboard**.

## Handoff Sesi ke WebView (Cookie Bridge)
1. Setelah login sukses, app menyalin cookie ke `CookieManager`.
2. WebView langsung membuka **/employee/dashboard**.
3. Jika sesi tidak valid/expired, app kembali ke login native (fail-closed, tanpa loop).

## Kebijakan WebView
- Hanya host dari `ABSENSIKU_WEB_BASE_URL` yang diizinkan.
- HTTPS wajib di mode release.
- Mixed content dinonaktifkan.
- JS bridge hanya untuk kebutuhan bootstrap dan sync sesi.

## Catatan Keamanan
- Jangan simpan password mentah di storage.
- Selalu tampilkan `Ref ID` saat error.
- Deteksi fake GPS hanya lapisan client: server tetap wajib memvalidasi.
- `app_code` ini hanya hardening ringan untuk clone sederhana, bukan proteksi terhadap reverse engineering serius.

## Checklist Uji Manual Minimal
- Login native berhasil.
- Handoff ke dashboard berhasil.
- Logout kembali ke login native.
- Guard fake GPS memblokir device bermasalah.
- Host di luar allowlist diblokir.

Checklist utama lintas aplikasi sekarang dicatat di:
- [docs/checklist-uji-aplikasi.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-uji-aplikasi.md)
