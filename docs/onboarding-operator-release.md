# Onboarding Operator dan Release

Dokumen ini untuk orang yang fokus pada readiness, smoke test, dokumentasi operasional, dan hygiene sebelum release.

## Fokus Kerja

Area yang paling sering dipakai:
- [ops](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops)
- [docs](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs)
- [tests](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests)

## Command Dasar

Readiness:

```bash
npm run ops:readiness
```

Doctor localhost:

```bash
npm run ops:sandbox:doctor:strict
```

Quality gate cepat:

```bash
npm run qa:fast
```

Audit risiko permission payroll:

```bash
npm run ops:payroll:permission-audit
```

FAQ offer:

```bash
npm run faq:offer
```

FAQ ack:

```bash
npm run faq:ack
```

Memory task:

```bash
npm run ops:memory:task -- --title "Judul task" --summary "Ringkasan task"
```

## Kapan Operator Perlu `dev:parity`

Gunakan saat memverifikasi:
- login employee web
- rate limit / lockout
- forgot password / OTP
- flow auth yang butuh `ref_id`

## Fokus Release Hygiene

Sebelum release formal:
1. cek workspace dirty
2. pastikan file yang benar-benar relevan
3. cek command validasi sesuai risiko
4. pastikan FAQ dan memory sudah diperbarui bila relevan
5. jangan deploy tanpa instruksi eksplisit

## Hal yang Wajib Diingat

- repo ini bisa sangat dirty
- push/deploy bukan aksi default
- `Supabase remote` adalah live environment
- perubahan DB sensitif harus didahului backup

## Dokumen Rujukan

- [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)
- [docs/workflow-aman-workspace-dirty.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/workflow-aman-workspace-dirty.md)
- [docs/index-operasional.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/index-operasional.md)
- [AGENTS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/AGENTS.md)

## Checklist Operator/Release

1. pastikan target verifikasi jelas
2. jalankan readiness/doctor bila perlu localhost
3. pilih validasi sesuai risiko
4. catat hasil dan risiko tersisa
5. update memory
6. tawarkan/update FAQ bila ada perubahan fitur atau operasional
