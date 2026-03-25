# Blueprint Menu Utama HR-Payroll (Historis)

Dokumen ini tetap dipertahankan sebagai dasar implementasi Payroll di repo ABSENSIKU.

Catatan status:
- Dokumen ini adalah blueprint menu dan referensi struktur domain Payroll.
- Status implementasi aktual tidak boleh disimpulkan dari file ini saja; gunakan `AGENTS.md`, dokumen operasional utama, dan arahan user pada turn aktif.

## Prinsip
- Tenant-aware (seluruh data scoped per organisasi).
- Payroll terpisah domain dari absensi, tetapi menerima input absensi yang tervalidasi.
- Semua aksi kritikal wajib audit log.
- Status proses payroll harus deterministik: `draft -> review -> approved -> paid -> archived`.

## Struktur Sidebar (Final)
1. Dashboard Payroll
2. Master Karyawan Payroll
3. Struktur Organisasi & Grade
4. Komponen Penghasilan
5. Komponen Potongan
6. Kebijakan Payroll
7. Periode Payroll
8. Input Variabel Bulanan
9. Validasi & Rekonsiliasi
10. Proses Payroll (Run Engine)
11. Approval Payroll
12. Slip Gaji & Distribusi
13. Pembayaran & Bank File
14. Pajak & Kepatuhan
15. Laporan & Analitik
16. Audit Log Payroll
17. Role & Permission Payroll
18. Integrasi

## Definisi Menu (MVP Scope)

### 1) Dashboard Payroll
- KPI: total pegawai payroll, bruto, potongan, netto, status periode aktif, anomali.
- Widget: tugas pending approval, payroll run terakhir, error validasi teratas.

### 2) Master Karyawan Payroll
- Data: metode bayar, bank, rekening, NPWP/NIK, PTKP, status payroll aktif.
- Aksi: bulk edit, import, mapping employee absensi -> employee payroll.

### 3) Struktur Organisasi & Grade
- Data: grade/level/golongan payroll.
- Fungsi: baseline skala gaji, policy per grade.

### 4) Komponen Penghasilan
- Jenis: fixed, variable, formula-based.
- Contoh: gaji pokok, tunjangan jabatan, transport, lembur, bonus.

### 5) Komponen Potongan
- Jenis: fixed, variable, cicilan.
- Contoh: BPJS, PPh21, pinjaman, denda, iuran.

### 6) Kebijakan Payroll
- Cutoff absensi, prorata masuk/keluar, pembulatan, basis lembur, default service fee.

### 7) Periode Payroll
- Buka periode, lock data sumber, close periode.
- Status: draft/review/approved/paid/archived.

### 8) Input Variabel Bulanan
- Input massal komponen variabel (bonus, lembur, koreksi).
- Mendukung import CSV/XLSX.

### 9) Validasi & Rekonsiliasi
- Rule check: rekening kosong, item duplikat, nilai outlier, mismatch absensi.

### 10) Proses Payroll (Run Engine)
- Simulasi, eksekusi, rerun terbatas (dengan trace).
- Snapshot hasil hitung per run.

### 11) Approval Payroll
- Multi level approval: HR -> Finance -> Pimpinan.
- Catatan revisi/penolakan.

### 12) Slip Gaji & Distribusi
- Generate slip PDF, publish portal pegawai, kirim notifikasi.

### 13) Pembayaran & Bank File
- Export file transfer bank, rekonsiliasi payment status.

### 14) Pajak & Kepatuhan
- Rekap PPh21/BPJS, export data pelaporan.

### 15) Laporan & Analitik
- Laporan biaya payroll per unit/grade/periode.

### 16) Audit Log Payroll
- Jejak aksi user (sebelum/sesudah), trace_id/log_id.

### 17) Role & Permission Payroll
- Role: payroll_admin, payroll_officer, finance, approver, auditor.

### 18) Integrasi
- Integrasi absensi, akuntansi, payout/bank, webhook/API.

## Prioritas Delivery (Wajib)
- Phase 1: menu 1,2,4,5,6,7
- Phase 2: menu 8,9,10,11
- Phase 3: menu 12,13,15,16
- Phase 4: menu 3,14,17,18

## Out-of-Scope Awal
- ESS lanjutan non-payroll (klaim/benefit kompleks).
- Multi-company consolidation lintas tenant.
