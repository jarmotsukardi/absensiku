# UAT Logout Saat Ada Pending Attendance

## Metadata
- Tanggal: 2026-03-20
- Scope: validasi policy logout saat masih ada absensi pending di perangkat
- Environment: localhost `http://127.0.0.1:5173` + IndexedDB browser + Supabase remote auth session
- Device / Browser: Playwright dengan runtime Safari iPhone spoof untuk membuka `/employee/dashboard`
- Build / Versi: web dev server 2026-03-20
- Penguji: Codex

## Data uji
- Pegawai 1: `Lisfa Uji Billing`
- Employee ID 1: `9b66b701-d05a-41ed-8bc2-6de395ea82fc`
- Pegawai 2: `Susi`
- Employee ID 2: `b26b1414-618e-43cf-b084-7fd781019281`
- Pending local entry: 1 row dummy di IndexedDB `AttendanceOfflineDB.attendanceEntries`

## Ringkasan hasil
- Total skenario diuji: 4
- Lulus: 4
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-LP-01 | Logout Policy | Policy `block_logout` menahan logout jika masih ada pending attendance lokal | LULUS | Pada `/employee/dashboard?tab=profile`, setelah policy lokal di-set ke `block_logout` dan 1 pending entry dummy disisipkan ke IndexedDB, klik tombol `Keluar` menampilkan toast `Logout ditahan` dengan detail `1 data absensi masih menunggu sinkronisasi...` dan user tetap berada di dashboard | - | Ini sekaligus memverifikasi defect implementasi sebelumnya sudah tertutup setelah guard logout dipasang |
| UAT-LP-02 | Logout Policy | Policy `keep_local_pending` tetap mengizinkan logout walau ada pending attendance lokal | LULUS | Dengan pending entry yang sama, policy diganti ke `keep_local_pending`, klik tombol `Keluar` berhasil redirect ke `/employee/login` | - | Mode default tidak regress menjadi terlalu ketat |
| UAT-LP-03 | Logout Policy | Policy `warn_then_logout` menampilkan dialog peringatan dan tetap menahan sesi jika user memilih `Cancel` | LULUS | Pada `/employee/dashboard?tab=profile` milik `Susi`, policy lokal di-set ke `warn_then_logout` dan 1 entry `failed` dummy disisipkan ke IndexedDB. Klik `Keluar` memunculkan dialog `1 data absensi masih menunggu sinkronisasi. Logout akan membersihkan sesi, tetapi data lokal tetap dipertahankan. Lanjut logout?`. Saat dialog di-`Cancel`, user tetap berada di `/employee/dashboard?tab=profile` | - | Membuktikan cabang warning tidak langsung logout sepihak |
| UAT-LP-04 | Logout Policy | Policy `warn_then_logout` tetap mengizinkan logout jika user menyetujui peringatan, sambil mempertahankan buffer lokal | LULUS | Dengan entry `failed` dummy yang sama, klik `Keluar` lalu `OK` pada dialog mengarahkan user ke `/employee/login`. Setelah logout, IndexedDB `AttendanceOfflineDB.attendanceEntries` masih berisi 1 row milik `employeeId = b26b1414-618e-43cf-b084-7fd781019281` dengan `syncStatus = failed` | - | Membuktikan warning bersifat konfirmasi, bukan penghapusan buffer |

## Temuan dan perbaikan
- Sebelum retest, jalur logout pegawai di dashboard mobile dan dashboard readonly langsung memanggil `signOut()` tanpa memeriksa `logout_pending_policy`.
- Perbaikan dipasang di:
  - [attendanceLogoutPolicy.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/attendanceLogoutPolicy.ts#L1)
  - [EmployeeDashboardNew.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/employee/EmployeeDashboardNew.tsx#L1563)
  - [EmployeeDashboardReadonly.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/dashboard/EmployeeDashboardReadonly.tsx#L512)

## Risiko tersisa
- Batch ini memvalidasi policy terhadap pending local buffer, bukan terhadap queue/device Android nyata.
- Skenario `double tap`, `lokasi invalid`, dan `device nyata` tetap belum tertutup karena masih tertahan device binding / runtime native.

## Tindak lanjut
- Lanjut ke `check-in tanpa lokasi valid` dan `double tap tombol absen` saat environment native/emulator siap.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
