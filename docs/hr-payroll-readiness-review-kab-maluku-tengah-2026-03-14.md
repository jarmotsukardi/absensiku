# HR Payroll Readiness Review

Review ini dibuat sebagai pembanding tenant kedua untuk kesiapan HR ke payroll.

Referensi acuan:
- [docs/hr-to-payroll-readiness.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-to-payroll-readiness.md)
- [docs/hr-payroll-ready-fields.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-ready-fields.md)
- [docs/hr-payroll-readiness-review-template.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-readiness-review-template.md)

## Metadata Review

| Item | Isi |
|---|---|
| Tenant name | Kab. Maluku Tengah |
| Tenant ID | ba7603b1-6827-4370-ae86-2e70dc5b09d5 |
| Reviewer | Codex |
| Tanggal review | 14 Maret 2026 |
| Sumber data | runtime Playwright, audit kredensial test account |
| Scope | baseline HR ke payroll |

## Ringkasan Keputusan

| Item | Isi |
|---|---|
| Status akhir tenant | `blocked` |
| Alasan utama | Review tenant ini belum bisa dipercaya karena kredensial `org_admin_centralized` saat diverifikasi ulang pada sesi browser bersih gagal login dengan pesan `Email atau password salah.` |
| Bloker terbesar | kredensial test account tenant pembanding belum valid untuk runtime review |
| Next action | perbarui dan verifikasi ulang kredensial `org_admin_centralized`, lalu ulangi review readiness payroll tenant ini |

## Review Per Area

| Area | Status | Bukti / Temuan | Gap utama | Keputusan |
|---|---|---|---|---|
| Validasi identitas tenant | blocked | pada sesi browser bersih, login `lisalfaisal@gmail.com` / `d7xTCFscyt` gagal dengan pesan `Email atau password salah.` | tenant target tidak bisa diverifikasi karena autentikasi dasar gagal | review dihentikan |
| Master pegawai | blocked | tidak dinilai, karena tenant runtime tidak tervalidasi | basis tenant salah | tunda |
| Status kepegawaian | blocked | tidak dinilai | basis tenant salah | tunda |
| Position / grade / golongan | blocked | tidak dinilai | basis tenant salah | tunda |
| Kontrak kerja | blocked | tidak dinilai | basis tenant salah | tunda |
| Struktur organisasi | blocked | tidak dinilai | basis tenant salah | tunda |
| Policy kerja | blocked | tidak dinilai | basis tenant salah | tunda |
| Leave / ESS approval | blocked | tidak dinilai | basis tenant salah | tunda |
| Dokumen HR | blocked | tidak dinilai | basis tenant salah | tunda |
| Laporan HR | blocked | tidak dinilai | basis tenant salah | tunda |
| Audit trail | blocked | tidak dinilai | basis tenant salah | tunda |

## Bukti Runtime / Audit

| Jenis bukti | Referensi |
|---|---|
| Kredensial acuan | `ops/test-accounts.local.json` mencantumkan `org_admin_centralized` dengan tenant `Kab. Maluku Tengah` |
| Hasil runtime terbaru | sesi browser bersih pada 14 Maret 2026 menampilkan error login `Email atau password salah.` untuk `org_admin_centralized` |
| Catatan investigasi | codebase sudah dipatch agar resolver tenant memilih `user_roles` dengan urutan `created_at DESC` sebelum fallback ke `employees`, sehingga gejala tenant salah tidak lagi bergantung pada `find()` tanpa ordering |
| Implikasi | review readiness tenant `Kab. Maluku Tengah` tetap belum bisa dilakukan sampai akun pembanding benar-benar bisa login |

## Keputusan Final

Keputusan untuk tenant `Kab. Maluku Tengah` saat ini:

- `blocked`: review readiness payroll belum boleh dilanjutkan sampai kredensial centralized tervalidasi dan tenant target bisa dibuka

## Aksi Lanjutan

1. perbarui akun `org_admin_centralized` di `ops/test-accounts.local.json` bila memang password berubah
2. verifikasi akun `org_admin_centralized` benar-benar membuka tenant `Kab. Maluku Tengah`
3. ulangi audit runtime `/org/hr`, `employees`, `reports`, dan ESS setelah tenant label sesuai
4. baru isi ulang template readiness payroll tenant ini dengan bukti yang valid
