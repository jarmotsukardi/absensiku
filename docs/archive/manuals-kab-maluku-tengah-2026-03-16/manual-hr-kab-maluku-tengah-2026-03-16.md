# Manual Uji Coba HR (Kab. Maluku Tengah)

Tanggal: 16 Maret 2026

## Tujuan
- Menjalankan verifikasi HR utama (workspace, kontrak, dokumen, laporan, analitik, tiket).
- Mendokumentasikan hasil uji coba HR untuk tenant Kab. Maluku Tengah.

## Prasyarat
- Repo berjalan pada `http://127.0.0.1:5173`.
- Kredensial `org_admin_centralized` valid di `ops/test-accounts.local.json`.
- Gunakan `.env.online` (Supabase remote).

## Ringkasan Tenant
- Tenant: Kab. Maluku Tengah
- Tenant ID: `ba7603b1-6827-4370-ae86-2e70dc5b09d5`

## Langkah Uji Coba HR

### 1. Login sebagai admin organisasi (centralized)
Gunakan akun `org_admin_centralized`.

### 2. Pastikan workspace HR aktif
- Buka halaman HR workspace.
- Aktifkan jika masih non-aktif.

### 3. Verifikasi halaman HR penting
- **Kontrak HR**: buka halaman, lakukan pencarian dengan keyword spesial.
- **Dokumen HR**: pastikan filter dan pencarian berfungsi.
- **Laporan HR**: cek statistik kontrak jatuh tempo.
- **Analitik Kehadiran HR**: pastikan filter tanggal + export tersedia.
- **Tiket HR**: buka list tiket, cek tombol buat tiket, uji thread komentar.

## Hasil Uji Coba
- HR smoke tercakup dalam suite `payroll-smoke`.
- Status terakhir: lulus pada 16 Maret 2026.

## Artefak
- Playwright report: `artifacts/playwright-report-hr-payroll-smoke`
- Test results: `test-results/`

## Catatan Risiko
- Hasil HR ini mengikuti suite payroll-smoke; bila perlu audit HR lebih spesifik, jalankan suite HR terpisah.
