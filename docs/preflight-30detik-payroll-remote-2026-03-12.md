# Preflight 30 Detik Payroll Remote

Gunakan checklist ini tepat sebelum operator menjalankan command backup atau migration remote.

## Wajib Benar

- [ ] target project adalah `zrhgqpjbeyzwpgywelcr`
- [ ] `.env.local` atau shell export sudah berisi credential remote yang benar
- [ ] `SUPABASE_DB_PASSWORD` atau `DATABASE_URL` sudah siap
- [ ] operator tidak memakai `npm run db:migrate:supabase`
- [ ] operator akan memakai `supabase db push --db-url "$DATABASE_URL"`
- [ ] backup belum dilewati

## Command Minimum

```bash
npm run db:backup:supabase
supabase db push --db-url "$DATABASE_URL" --dry-run
supabase db push --db-url "$DATABASE_URL"
```

## Jangan Lanjut Jika

- [ ] backup gagal
- [ ] dry-run gagal
- [ ] `PGRST205` root cause belum dipahami
- [ ] credential remote masih diragukan

## Referensi Cepat

- [runbook-final-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/runbook-final-sinkronisasi-payroll-remote-2026-03-12.md:1)
- [template-env-operator-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/template-env-operator-payroll-remote-2026-03-12.md:1)
