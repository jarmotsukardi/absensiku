# UAT Auth Web Umum

## Metadata
- Tanggal: 2026-03-20
- Scope: Batch 1 UAT absensi tahap berikutnya, fokus auth web umum dan publik/download
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser: Playwright Chromium desktop
- Build / Versi: Web dev server 2026-03-20
- Penguji: Codex

## Data uji
- Tenant: Pengajian Al-Akbar
- Admin: `aikuisfa@gmail.com`
- Pegawai: `lisfa82328729@gmail.com`
- Email gateway: tidak diverifikasi pada batch ini
- Catatan data:
  - akun pegawai default dari `ops/test-accounts.local.json`
  - jalur web yang aktif untuk login umum adalah `/auth`
  - jalur `/employee/login` pada desktop menampilkan policy penolakan browser biasa

## Ringkasan hasil
- Total skenario diuji: 14
- Lulus: 14
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-01 | Auth Web | Login web umum dengan akun valid melalui `/auth` berhasil dan redirect ke `/dashboard` | LULUS | Playwright 2026-03-20, URL akhir `/dashboard` | - | Akun pegawai `lisfa82328729@gmail.com` berhasil masuk |
| UAT-02 | Auth Web | Login web gagal dengan password salah menampilkan pesan jelas | LULUS | Toast `Login Gagal` dengan teks `Email atau password salah. Sisa percobaan: 4` | - | Perilaku sesuai ekspektasi |
| UAT-03 | Auth Web | Rate limit auth mengunci akses setelah percobaan gagal berulang | LULUS | Toast `Akses diblokir selama 5 menit karena terlalu banyak percobaan gagal` | - | Terbukti aktif di browser |
| UAT-04 | Auth Web | Logout web mengakhiri sesi dan kembali ke halaman login | LULUS | Playwright 2026-03-20, URL akhir `/auth` setelah klik `Keluar` | - | Form login pegawai tampil lagi |
| UAT-05 | Auth Web | Tombol `Lupa password?` membuka alur reset/password action | LULUS | Dialog `Pilih Aksi` muncul dengan opsi `Lupa Password` dan `Ganti Password` | - | Baru sampai verifikasi entry point, belum sampai reset selesai |
| UAT-06 | Publik dan Landing | Halaman `/download` tampil normal dan versi terbaru berada di urutan paling atas | LULUS | Judul `Download APK AbsensiKu`, kartu `v1.0.7` tampil sebagai `Versi terbaru` | - | Tiga versi yang terlihat: `v1.0.7`, `v1.0.6`, `v1.0.5` |
| UAT-07 | Publik dan Landing | File Android terbaru `/downloads/AbsensiKu-Android-1.0.7.apk` merespons `200` | LULUS | `curl -I` menghasilkan `HTTP/1.1 200 OK` | - | File tersedia |
| UAT-08 | Publik dan Landing | File Android lama yang seharusnya dibuang tidak lagi bisa diunduh | LULUS | Setelah middleware dev download diterapkan, `curl -I http://127.0.0.1:4173/downloads/AbsensiKu-Android-1.0.4.apk` menghasilkan `HTTP/1.1 404 Not Found` | - | File terbaru `1.0.7` tetap `200 OK`, sehingga gap localhost SPA fallback sudah tertutup |
| UAT-09 | Reset Password | Halaman `/auth/forgot-password` berhasil mengirim permintaan link reset untuk email valid | LULUS | Toast `Email Terkirim` dan state sukses `Kami telah mengirimkan link reset password ke lisfa82328729@gmail.com` | - | Entry point reset via browser umum berjalan |
| UAT-10 | Reset Password | Deep link reset dengan status expired/invalid menampilkan halaman error yang jelas, bukan blank/loop | LULUS | Buka `/auth/reset-password?error=access_denied&error_description=Link%20reset%20sudah%20kadaluarsa` menampilkan judul `Link Tidak Valid` | - | Pesan error terbaca jelas |
| UAT-11 | Reset Password | Hash recovery palsu tidak membuat blank page dan menampilkan kegagalan verifikasi token | LULUS | Buka `/auth/reset-password#access_token=fake-token&refresh_token=fake-refresh&type=recovery` menampilkan `Gagal memverifikasi token` | - | Deep link bermasalah ditangani aman |
| UAT-12 | Auth Web | Session expired di dashboard desktop kembali ke `/auth` yang benar, bukan loop atau redirect ke jalur native pegawai | LULUS | Setelah login ke `/auth` lalu token sesi Supabase dihapus dan halaman `/dashboard` direload, URL akhir kembali ke `/auth` | - | Guard sesi web umum bekerja sesuai ekspektasi |
| UAT-13 | Publik dan Landing | Artefak APK publik hanya menyisakan 3 versi terbaru | LULUS | Verifikasi folder `public/downloads` menunjukkan hanya `AbsensiKu-Android-1.0.5.apk`, `AbsensiKu-Android-1.0.6.apk`, dan `AbsensiKu-Android-1.0.7.apk`; file lama `1.0.4` merespons `404 Not Found` | - | Retensi artefak publik sesuai batas maksimal 3 versi |
| UAT-14 | Publik dan Landing | File Android publik sinkron dengan versi dan checksum di halaman download | LULUS | Halaman `/download` menampilkan urutan `v1.0.7 -> v1.0.6 -> v1.0.5`; `curl -I` untuk tiga file aktif merespons `200`; `shasum -a 256` file lokal cocok dengan checksum yang tampil di kartu download | - | Sinkronisasi manifest rilis publik dan file fisik terbukti konsisten |

## Risiko tersisa
- Alur `Lupa password` belum diuji sampai reset benar-benar selesai dari inbox nyata.
- Deep link reset sukses dengan token valid belum diverifikasi.
- Jalur `/employee/login` di desktop diblokir policy, sehingga perlu dipastikan apakah checklist `Auth Web Umum` secara resmi menggunakan `/auth` sebagai jalur browser umum.

## Tindak lanjut
- Lanjutkan verifikasi `Lupa password` sampai selesai dari inbox nyata, termasuk deep link reset valid dan set password baru.
- Tambahkan invalidation sesi lintas web vs mobile jika ada perubahan arsitektur auth lintas platform.
- Klarifikasi di checklist bahwa login web desktop pegawai memakai `/auth`, sedangkan `/employee/login` adalah jalur yang dibatasi policy tertentu.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
