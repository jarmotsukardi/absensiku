# UAT Auth Web Reset Password Sampai Selesai

- Tanggal uji: 2026-03-20
- Domain: Absensi
- Area: Auth Web Umum
- Environment: localhost `http://127.0.0.1:5173`
- Metode: Playwright lokal + Supabase Auth Admin (`service_role`) untuk generate recovery link valid
- Akun uji: `employee` dari `ops/test-accounts.local.json`

## Tujuan
Memastikan flow `Lupa password` pada web umum benar-benar bisa sampai password berubah, lalu akun dapat login dengan password baru.

## Catatan Metode
- Karena inbox email nyata tidak dipakai pada batch ini, recovery link valid digenerate langsung dari Supabase Auth Admin dengan `type = recovery` dan `redirectTo = /auth/reset-password`.
- Pendekatan ini tetap menguji UI [ResetPassword](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/auth/ResetPassword.tsx#L1) secara end-to-end tanpa mengubah source aplikasi.
- Setelah verifikasi selesai, password akun uji dikembalikan ke password awal via Admin API agar environment tetap bersih.

## Hasil

| ID | Skenario | Hasil | Bukti | Catatan |
|---|---|---|---|---|
| UAT-AWR-01 | Lupa password berjalan sampai reset selesai | LULUS | Recovery link valid dengan path `/auth/v1/verify` berhasil membuka `/auth/reset-password`, submit password baru sukses, muncul state `Password Berhasil Diubah!`, lalu login ulang dengan password baru menghasilkan `access_token` valid | Redirect akhir berada di `/dashboard`; verifikasi final memakai keberadaan `access_token`, bukan hanya perubahan URL |

## Ringkasan
- `1/1` lulus.
- Flow reset password web umum berhasil ditutup sampai password baru dapat dipakai login.
- Password akun uji sudah direstore ke nilai awal setelah pengujian selesai.
