# UAT OTP Registrasi Salah atau Expired

- Tanggal uji: 2026-03-20
- Domain: Absensi
- Area: Daftar Pegawai
- Environment: remote Supabase + localhost tooling
- Metode: edge function verification dengan data OTP uji terkontrol

## Tujuan
Memastikan OTP registrasi yang salah atau sudah kadaluarsa ditolak dengan pesan yang jelas.

## Catatan Metode
- Flow registrasi memakai edge function [verify-registration-otp](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/functions/verify-registration-otp/index.ts#L1).
- OTP plaintext tidak disimpan oleh sistem, sehingga negative case diuji dengan menanam row OTP uji terkontrol pada tabel `password_reset_otps` untuk email dummy yang unik.
- Setelah pengujian selesai, row OTP uji dan jejak registrasi dummy dibersihkan kembali.

## Hasil

| ID | Skenario | Hasil | Bukti | Catatan |
|---|---|---|---|---|
| UAT-ROTP-01 | OTP registrasi salah ditolak | LULUS | `POST verify-registration-otp` untuk email dummy dengan OTP salah mengembalikan `HTTP 400`, `code = INVALID_OTP`, pesan `Kode OTP tidak valid atau sudah kadaluarsa`, trace `verify-registration-otp-mmyqczgg-7qeuhp` | Row OTP uji disiapkan valid dan belum kadaluarsa, sehingga kegagalan memang berasal dari kode yang salah |
| UAT-ROTP-02 | OTP registrasi expired ditolak | LULUS | `POST verify-registration-otp` untuk email dummy dengan OTP benar tetapi `expires_at` sudah lewat mengembalikan `HTTP 400`, `code = INVALID_OTP`, pesan `Kode OTP tidak valid atau sudah kadaluarsa`, trace `verify-registration-otp-mmyqczzo-0955qc` | Row OTP uji disiapkan dengan hash yang benar namun timestamp kedaluwarsa, sehingga skenario expired teruji eksplisit |

## Ringkasan
- `2/2` lulus.
- Pesan gagal sudah cukup jelas dan konsisten untuk kasus OTP salah maupun kadaluarsa.
- Tidak ada akun auth atau data registrasi dummy yang tertinggal setelah batch selesai.
