# Decision Tree Command Lokal

Gunakan dokumen ini untuk memilih command lokal yang benar sebelum mulai kerja.

## Langkah 1

Apakah task hanya menyentuh UI/frontend biasa?

- Ya:
  gunakan `npm run dev`
- Tidak:
  lanjut ke langkah 2

## Langkah 2

Apakah task menyentuh salah satu dari ini?
- login employee
- forgot password / OTP
- `ref_id`
- rate limit / lockout
- Android/WebView bootstrap/session
- integrasi frontend ke `mobile-api`

- Ya:
  lanjut ke langkah 3
- Tidak:
  biasanya `npm run dev` cukup

## Langkah 3

Apakah Anda perlu frontend dan auth lokal berjalan bersamaan?

- Ya:
  gunakan `npm run dev:parity`
- Tidak:
  gunakan `npm run dev:mobile-api`

## Langkah 4

Apakah Anda hanya ingin mengecek apakah `mobile-api` lokal sehat?

Gunakan:

```bash
curl http://127.0.0.1:3000/mobile-api/health
```

Jika sehat, hasilnya:

```json
{"ok":true,"service":"mobile-api-local"}
```

## Langkah 5

Apakah task menyentuh DB remote atau migration?

- Ya:
  sebelum perubahan sensitif, jalankan:

```bash
npm run db:backup:supabase
```

Lalu lanjut ke workflow backend/Supabase

- Tidak:
  lanjutkan dengan workflow lokal yang sudah dipilih

## Ringkasan Cepat

- `npm run dev`
  untuk frontend biasa
- `npm run dev:mobile-api`
  untuk auth/API lokal tanpa frontend
- `npm run dev:parity`
  untuk frontend + auth lokal sekaligus

## Jika Masih Ragu

Baca:
- [docs/onboarding-developer-baru.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-developer-baru.md)
- [docs/onboarding-frontend.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-frontend.md)
- [docs/onboarding-backend-supabase.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-backend-supabase.md)
- [docs/onboarding-operator-release.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-operator-release.md)
