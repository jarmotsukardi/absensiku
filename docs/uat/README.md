# UAT Aplikasi AbsensiKu

Folder ini dipakai untuk mencatat hasil User Acceptance Test yang benar-benar dijalankan.

## Aturan pakai
- Setiap sesi uji gunakan file baru dengan format nama:
  - `uat-YYYY-MM-DD-<scope>.md`
  - `sign-off-YYYY-MM-DD-<scope>.md` untuk ringkasan akhir batch yang sudah lengkap
  - `go-no-go-YYYY-MM-DD-<scope>.md` untuk ringkasan keputusan singkat non-teknis
- Contoh:
  - `uat-2026-03-19-auth-dan-android.md`
  - `uat-2026-03-19-undangan-email-gateway.md`
  - `sign-off-2026-03-20-android-runtime.md`
  - `go-no-go-2026-03-20-android-runtime.md`
- Hanya skenario yang benar-benar diuji yang dicatat.
- Untuk setiap skenario yang berhasil, isi hasil sebagai `LULUS`.
- Untuk skenario gagal, isi `GAGAL` dan sertakan `Ref ID` atau `trace_id` bila ada.
- Jika ada screenshot, logcat, query hasil verifikasi, atau URL bukti, tautkan di kolom bukti.
- Setelah file UAT dibuat atau diperbarui, hasil batch wajib disinkronkan ke Monitoring UAT:
  - `npm run uat:sync-monitoring -- --domain=absensi --file docs/checklist-uji-aplikasi.md`
  - `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-YYYY-MM-DD-hr-<scope>.md`
  - `npm run uat:sync-monitoring -- --domain=payroll --file docs/uat/uat-YYYY-MM-DD-payroll-<scope>.md`
- Jika UAT menemukan temuan:
  - jalankan `npm run autofix` terlebih dahulu bila relevan
  - lanjutkan perbaikan manual dan retest terarah
  - perbarui file UAT dengan hasil terbaru
  - sync ulang ke Monitoring UAT
  - buat batch retest baru berstatus `lolos` setelah temuan benar-benar tertutup

## Struktur minimum file UAT
- `## Log Update yang Sudah Diuji` dengan 1 baris ringkasan batch agar kompatibel dengan sync monitoring
- Ringkasan scope
- Environment pengujian
- Akun/data uji yang dipakai
- Tabel hasil per skenario
- Risiko tersisa
- Keputusan akhir: `siap`, `siap dengan catatan`, atau `belum siap`

## Struktur minimum file sign-off
- Referensi ke file UAT utama
- Ringkasan keputusan `GO / GO dengan catatan / NO-GO`
- Area yang sudah tertutup
- Bukti utama
- Risiko tersisa
- Rekomendasi tindak lanjut

## Struktur minimum file go / no-go
- Status keputusan singkat
- Dasar keputusan
- Yang sudah terbukti aman
- Catatan yang masih tersisa
- Rekomendasi keputusan

## Template
Gunakan template dasar berikut:
- [template-uat-aplikasi.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/template-uat-aplikasi.md)
- [runsheet-uat-hr-admin-org.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/runsheet-uat-hr-admin-org.md) untuk pembagian batch audit `/admin/hr` dan `/org/hr`
- [uat-template-hr-admin-org.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-template-hr-admin-org.md) untuk batch hasil UAT HR admin/org
- [sign-off-template-hr.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/sign-off-template-hr.md) untuk penutupan batch HR
- [go-no-go-template-hr.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/go-no-go-template-hr.md) untuk keputusan singkat stakeholder HR

## Catatan sync Monitoring UAT HR
- Script sync saat ini membaca section `## Log Update yang Sudah Diuji`.
- Untuk domain HR dan Payroll, pastikan file `uat-*.md` memuat table log ringkas berikut:

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| YYYY-MM-DD | UAT HR <scope> | <area batch> | `x/y` lulus, siap | `docs/uat/uat-YYYY-MM-DD-hr-<scope>.md` |
