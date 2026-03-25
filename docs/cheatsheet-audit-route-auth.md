# Cheatsheet Audit Route dan Auth

Dokumen ini fokus untuk audit route dan autentikasi di `ABSENSIKU`.

## Area Route Prioritas

- `/admin/*`
- `/org/*`
- `/org/hr/*`
- `/org/payroll/*`
- `/employee/*`

Catatan:
- route family legacy seperti `/dashboard*` perlu dibedakan dari flow employee modern
- route yang tidak lagi ada di [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx) jangan langsung dianggap hilang karena cleanup; bisa jadi memang deprecated

## Langkah Audit Route

1. Jalankan doctor:

```bash
npm run ops:sandbox:doctor:strict
```

2. Ambil daftar route:

```bash
rg -n '<Route\\s+path="/(admin|org|employee|dashboard)' src/App.tsx
```

3. Login sesuai role:
- superadmin untuk `/admin/*`
- admin instansi untuk `/org/*`, `/org/hr/*`, `/org/payroll/*`
- employee untuk `/employee/*`

4. Buka route prioritas di browser
5. Catat:
- 404
- redirect aneh
- UI error
- route/tab hilang

## Langkah Audit Auth

Fokus file:
- [api/mobile-api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api/mobile-api)
- [src/pages/employee/EmployeeLogin.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/employee/EmployeeLogin.tsx)
- [src/pages/admin/SuperAdminLogin.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/SuperAdminLogin.tsx)
- [src/pages/org/OrgLogin.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/OrgLogin.tsx)

Checklist:
- login sukses
- password salah
- lock atau `rate_limited`
- `ref_id` atau `trace_id`
- redirect setelah login benar

## Hasil Smoke yang Perlu Diingat

Saat audit browser terakhir:
- route prioritas `admin`: lolos
- route prioritas `org`, `org/hr`, `org/payroll`: lolos
- route modern `employee`: lolos
- route legacy `/dashboard*`: redirect ke `/auth`

## Tanda Bahaya

Segera curigai regresi jika:
- route ada di [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx) tapi browser gagal membukanya
- route/tab utama hilang dari area `/admin`, `/org`, `/org/hr`, `/org/payroll`, atau `/employee`
- endpoint auth gagal memberi `ref_id`
- rewrite Vercel membuat `/mobile-api/*` tidak aktif

## Penutup

Setelah audit selesai:

```bash
npm run ops:memory:task -- --title "audit route/auth" --summary "hasil audit"
npm run faq:offer
```
