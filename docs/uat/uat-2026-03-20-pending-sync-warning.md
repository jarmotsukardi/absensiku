# UAT Pending Sync Terlalu Lama Menampilkan Warning

## Metadata
- Tanggal: 2026-03-20
- Scope: memastikan pending sync yang terlalu lama menampilkan warning jelas di dashboard pegawai
- Environment: localhost `http://127.0.0.1:5173` + Playwright + IndexedDB browser + Supabase remote auth session
- Device / Browser: Playwright dengan sesi pegawai aktif, device binding valid, dan clock override browser untuk hari kerja
- Build / Versi: web dev server 2026-03-20
- Penguji: Codex

## Data uji
- Pegawai: `Susi`
- Employee ID: `b26b1414-618e-43cf-b084-7fd781019281`
- Tenant: `Kab. Maluku Tengah`
- Device binding: `WEB-0000000028A56620`
- Runtime sync setting: `offpeak_release_strategy = worker_only`
- Entry uji: 1 row `check_in` local dengan `syncStatus = pending`, `createdAt` dan `lastSyncAttempt` lebih tua `16 menit`

## Ringkasan hasil
- Total skenario diuji: 1
- Lulus: 1
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-PS-01 | Absensi dan Sinkronisasi | Pending sync yang terlalu lama menampilkan warning | LULUS | Setelah dashboard mobile `Susi` dimuat, storage lokal dibersihkan lalu disisipkan 1 entry `check_in` local berumur `16 menit`. Reload dashboard menampilkan banner `Sinkronisasi absensi tertunda terlalu lama` dengan detail `1 data belum tercatat final di server selama sekitar 16 menit...` dan Ref `ERR-20260317020000-G9WY4R` | `ERR-20260317020000-G9WY4R` | Banner muncul di halaman pegawai utama, bukan hanya komponen internal yang tidak terpasang |

## Temuan dan perbaikan
- Sebelum perbaikan, sinyal `stalePendingCount` dari `useAttendanceSync` sudah ada, tetapi warning UI hanya hidup di [AttendanceCard.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/employee/AttendanceCard.tsx#L443), sedangkan dashboard pegawai aktif memakai layout lain.
- Perbaikan dipasang di:
  - [EmployeeDashboardNew.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/employee/EmployeeDashboardNew.tsx#L2029)
- Sekarang dashboard mobile utama ikut menampilkan warning stale pending lengkap dengan jumlah data, umur terlama, dan Ref triase.

## Catatan metode
- Entry pending tua dibuat langsung di IndexedDB browser agar fokus pengujian berada pada banner warning, bukan pada proses sinkronisasi server.
- Runtime sync dipaksa ke mode `worker_only` agar entry tetap berada di state pending selama retest.
- Retest ini memvalidasi UX warning di web/mobile dashboard; perilaku native/device nyata tetap batch terpisah.

## Risiko tersisa
- Retest memakai browser override dan injeksi IndexedDB lokal, belum menutup APK/device nyata.
- Belum menutup skenario multi-entry stale pending sekaligus.
- Belum memverifikasi wording warning saat `syncStatus = failed` versus `pending`.

## Tindak lanjut
- Lanjut ke `Notifikasi absensi tidak boleh memberi kesan final jika data baru tersimpan lokal`.
- Lanjut ke batch native/device nyata untuk validasi warning serupa di APK.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
