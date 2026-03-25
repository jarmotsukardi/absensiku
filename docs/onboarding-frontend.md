# Onboarding Frontend

Dokumen ini untuk developer yang fokus di frontend `ABSENSIKU`.

## Fokus Kerja

Area utama:
- [src](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src)
- [src/main.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/main.tsx)
- [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)

Route besar dibagi ke:
- `/admin`
- `/org`
- `/employee`

## Command yang Paling Sering Dipakai

Frontend saja:

```bash
npm run dev
```

Frontend + auth lokal:

```bash
npm run dev:parity
```

Lint targeted:

```bash
npx eslint path/ke/file.tsx
```

Build:

```bash
npm run build
```

## Kapan Perlu `dev:parity`

Gunakan `dev:parity` bila perubahan menyentuh:
- login employee
- forgot password / OTP
- `ref_id`
- rate limit / lockout
- integrasi session bootstrap Android/WebView

Kalau hanya menyentuh UI/layout biasa, `npm run dev` cukup.

## Hal yang Perlu Dipahami

- auth employee sekarang lewat `mobile-api`, bukan hanya langsung ke Supabase Auth di browser
- error auth membawa `ref_id`
- repo sering dirty, jadi scope file harus disiplin

## File yang Sering Jadi Anchor

- [src/pages/employee/EmployeeLogin.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/employee/EmployeeLogin.tsx)
- [src/hooks/useSecurityCheck.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/hooks/useSecurityCheck.ts)
- [src/components/admin/superadmin/SuperAdminLayout.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/superadmin/SuperAdminLayout.tsx)
- [src/pages/org/hr/OrgHRErrorLogs.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRErrorLogs.tsx)

## Checklist Frontend

1. tentukan route/halaman target
2. pilih `dev` atau `dev:parity`
3. edit file dalam scope kecil
4. lint file terkait
5. kalau auth/role kritikal, build penuh
6. update memory task setelah selesai
