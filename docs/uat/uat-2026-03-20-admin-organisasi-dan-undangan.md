# UAT Admin Organisasi dan Undangan

## Metadata
- Tanggal: 2026-03-20
- Scope: Batch 2 UAT absensi tahap berikutnya, fokus login admin organisasi, master pegawai aktif, undangan pegawai, dan penyimpanan pengaturan keamanan absensi
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser: Playwright Chromium desktop dan simulasi Safari iPhone
- Build / Versi: Web dev server 2026-03-20
- Penguji: Codex

## Data uji
- Tenant: Pengajian Al-Akbar
- Admin: `aikuisfa@gmail.com`
- Super Admin: `qa.superadmin.smoke@absensiku.local`
- Pegawai target undangan: `Debug Pegawai 10625339`
- Email gateway: belum diverifikasi kirim real email pada batch ini
- Catatan data:
  - akun admin organisasi default dari `ops/test-accounts.local.json`
  - captcha login yang diuji pada sesi ini: `SMEHXZ`
  - kode undangan yang dibuat pada batch ini: `INV-MMYKH0NY-RHOG9H`

## Ringkasan hasil
- Total skenario diuji: 15
- Lulus: 15
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-01 | Admin Organisasi | Login admin organisasi dengan akun valid berhasil | LULUS | Playwright 2026-03-20, URL akhir `/org` | - | Admin masuk ke dashboard organisasi |
| UAT-02 | Admin Organisasi | Admin dapat membuka halaman pegawai aktif | LULUS | Playwright 2026-03-20, URL `/org/employees/active`, judul `Pegawai Aktif` | - | Data pegawai tenant berhasil dimuat |
| UAT-03 | Undangan Pegawai | Admin dapat membuat undangan aktivasi dari pegawai yang belum aktif | LULUS | Toast `Kode undangan berhasil dibuat` dan dialog `Kode Aktivasi Akun` | - | Pegawai target `Debug Pegawai 10625339` berhasil mendapat kode undangan |
| UAT-04 | Undangan Pegawai | Setelah undangan dibuat, status pegawai berubah dari `Belum Diundang` menjadi `Undangan Terkirim` | LULUS | Baris pegawai pada `/org/employees/active` berubah menjadi `Belum Aktif / Undangan Terkirim` | - | Flow status inti bekerja |
| UAT-05 | Undangan Pegawai | Halaman `/org/invitations` menampilkan undangan baru dengan status `Menunggu` | LULUS | Baris undangan `INV-MMYKH0NY-RHOG9H` tampil pada daftar dengan status `Menunggu` dan tanggal berlaku `27 Mar 2026` | - | Monitoring undangan tersedia |
| UAT-06 | Undangan Pegawai | Aksi operator `salin link` pada undangan aktif berjalan | LULUS | Toast `Link undangan disalin!` pada halaman `/org/invitations` | - | Aksi non-destruktif operator terbukti bekerja |
| UAT-07 | Undangan Pegawai | Filter tab `Menunggu` hanya menampilkan undangan berstatus menunggu | LULUS | Re-test setelah perbaikan menunjukkan tab `Menunggu` hanya menampilkan 1 undangan aktif dan tidak lagi memuat undangan `Kedaluwarsa` | - | Bug filter status sudah ditutup |
| UAT-08 | Undangan Pegawai | Admin dapat memverifikasi undangan dari halaman `/org/invitations` | LULUS | Toast `Undangan diverifikasi!` dan status row berubah ke `Terverifikasi` | - | Aksi verifikasi admin-side berjalan |
| UAT-09 | Undangan Pegawai | Tab `Terverifikasi` menampilkan undangan yang baru diverifikasi | LULUS | Tab `Terverifikasi` menampilkan 1 data dengan kode `INV-MMYKH0NY-RHOG9H` dan status `Terverifikasi` | - | Monitoring status verified tersedia |
| UAT-10 | Undangan Pegawai | Link undangan berstatus `verified` tetap valid saat dibuka dari jalur browser yang diizinkan policy | LULUS | Simulasi Safari iPhone menampilkan form `Undangan Valid!` lengkap dengan prefill data `Debug Pegawai 10625339` | - | Bug lama `verified -> invalid` sudah tertutup setelah perbaikan query `EmployeeLogin` dan policy RLS undangan |
| UAT-11 | Undangan Pegawai | Registrasi pegawai dari link undangan dapat ditutup sampai status `used` | LULUS | Submit dari simulasi Safari iPhone berhasil menutup undangan `INV-MMYKH0NY-RHOG9H`; verifikasi DB menunjukkan `employee_invitations.is_used = true`, auth user baru terbentuk, employee existing NIK `3174000010625339` ter-link ke `user_id`, dan role `pegawai` tersedia | - | Flow invite registration sekarang memakai edge function `complete-employee-invitation-registration`, sehingga tidak lagi bergantung pada `POST /auth/v1/signup` publik yang sebelumnya kena `429` |
| UAT-12 | Undangan Pegawai | Admin dapat menghapus undangan yang sudah kedaluwarsa | LULUS | UI menampilkan toast `Undangan berhasil dihapus`; verifikasi DB menunjukkan undangan `INV-MMOIPK5L-VGA2Z7` sudah tidak ada lagi di `employee_invitations` | - | Skenario hapus aman untuk membersihkan undangan usang |
| UAT-13 | Admin Organisasi | Admin dapat memicu kirim link reset password dari daftar pegawai aktif | LULUS | Dialog konfirmasi menargetkan `debug-hr-10625339@example.com`, lalu UI menampilkan toast `Link reset password telah dikirim ke debug-hr-10625339@example.com` | - | Jalur reset password admin-side merespons normal; penerimaan email inbox nyata belum diverifikasi pada batch ini |
| UAT-14 | Undangan Pegawai | Admin dapat mengirim ulang email undangan individual dari dialog sukses | LULUS | Buat undangan baru `INV-MMYLWGA0-D3TADU` untuk `uat.resend.1773993400@example.com`, lalu klik `Kirim via Email`; UI menampilkan toast `Email undangan berhasil dikirim`, dan audit remote menunjukkan `INVITATION_SEND_EMAIL` untuk invitation tersebut tercatat `2` kali | - | Jalur resend email operator-side merespons normal dan meninggalkan jejak audit yang cukup |
| UAT-15 | Keamanan Absensi | Penyimpanan pengaturan keamanan absensi tidak menghapus `native_app_code` | LULUS | Playwright membuka `/admin/attendance-security` sebagai super admin, klik `Simpan Pengaturan` tanpa mengubah policy, UI menampilkan toast `Pengaturan keamanan berhasil disimpan`; verifikasi remote DB setelah save menunjukkan `system_settings.key = attendance_security` masih menyimpan `native_app_code = AKN1` dan `updated_at = 2026-03-20 15:02:22 Asia/Jakarta` | - | Skenario ini menutup guardrail penting untuk compat APK/native auth; save penuh JSON setting tidak menghapus field `native_app_code` |

## Risiko tersisa
- Flow revoke/hapus undangan belum diuji.
- Penerimaan email reset password di inbox nyata belum diverifikasi, baru terkonfirmasi sampai request sukses dan toast UI.
- Penerimaan email undangan di inbox nyata belum diverifikasi, baru terkonfirmasi sampai toast sukses dan audit remote `INVITATION_SEND_EMAIL`.
- Ada error console organisasi yang muncul saat memuat beberapa modul:
  - `ERR-20260320071724-G4OKM6`
  - `ERR-20260320071724-KMZO1Z`
  - `ERR-20260320071800-HFO0SA`
  - `ERR-20260320071800-56EBO2`

## Tindak lanjut
- Verifikasi ulang bahwa jalur resmi onboarding undangan adalah WebView Android atau Safari iPhone, lalu tambahkan runsheet UAT khusus device/browser yang diizinkan.
- Query undangan di `EmployeeLogin` dan policy RLS publik sudah diperbaiki agar undangan `verified` yang belum dipakai tetap bisa divalidasi.
- Flow registrasi undangan sekarang memakai edge function `complete-employee-invitation-registration`, sehingga undangan `verified` bisa langsung ditutup sampai `used` tanpa rate limit `signUp` publik.
- UX recovery `Daftar via Email` tetap dipertahankan untuk kasus `EMAIL_EXISTS`, lalu kode undangan disimpan sementara untuk dipakai di kartu `Bergabung ke Organisasi` setelah login.
- Verifikasi penerimaan email undangan dan reset password pada inbox nyata jika environment email gateway siap.
- Tambahkan skenario `revoke` terpisah jika produk nantinya membedakan `hapus` dan `batalkan` undangan.
- Tinjau error console organisasi yang muncul saat load modul agar tidak menyamarkan issue UAT lain.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
