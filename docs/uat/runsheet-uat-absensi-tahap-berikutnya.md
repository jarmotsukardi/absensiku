# Run Sheet UAT Absensi Tahap Berikutnya

Dokumen ini memecah sisa UAT absensi menjadi batch eksekusi yang realistis. Fokusnya adalah menutup gap `P0` lebih dulu, lalu lanjut ke hardening `P1` dan validasi device nyata.

Referensi utama:
- [Checklist uji aplikasi](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-uji-aplikasi.md)
- [README UAT](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/README.md)
- [Template UAT aplikasi](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/template-uat-aplikasi.md)
- [Run Sheet Device Nyata Android](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/runsheet-device-nyata-android.md)
- [UAT Android runtime 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-android-runtime.md)

## Tujuan batch lanjutan
- menutup sisa skenario `P0` yang belum diuji pada domain absensi
- memisahkan mana yang cukup diuji di browser, emulator, dan device nyata
- membuat urutan kerja harian yang lebih ringkas daripada checklist utama
- memastikan setiap batch punya output bukti dan file UAT yang jelas

## Prinsip eksekusi
1. Kerjakan `browser` lebih dulu untuk menutup auth web, admin organisasi, dan artefak publik.
2. Lanjut ke `emulator Android` untuk flow native login, WebView, dan absensi edge case.
3. Sisakan `device nyata` hanya untuk skenario yang memang tidak valid jika diuji di emulator.
4. Setelah satu batch selesai, langsung tulis hasil ke file `uat-YYYY-MM-DD-<scope>.md`.
5. Jika ada blocker, catat `Ref ID` atau `trace_id` dan hentikan batch terkait.

## Ringkasan prioritas saat ini

### Wajib ditutup lebih dulu
- `Auth Web Umum`
- `Absensi dan Sinkronisasi` edge case
- `Keamanan Dasar`
- `Dashboard Pegawai dan WebView`

### Menyusul setelah blocker inti aman
- `Daftar Pegawai`
- `Admin Organisasi`
- `Publik dan Landing`
- `Observability`

### Khusus device nyata
- perpindahan jaringan Wi-Fi ke seluler
- pending sync setelah force close atau ganti jaringan
- fake GPS / mock location
- layout pendek, rotasi, dan sentuhan vendor/device

## Batch 1: Browser Web P0
Metode: `Manual, Remote production`

### Scope
- `Auth Web Umum`
- `Publik dan Landing` inti

### Skenario wajib
1. Login web dengan akun valid.
2. Login web dengan password salah.
3. Rate limit auth menampilkan pesan jelas.
4. Logout web mengakhiri sesi.
5. Lupa password sampai reset selesai.
6. Deep link reset tidak loop atau blank.
7. Session expired kembali ke login yang benar.
8. Halaman download tampil normal.
9. Versi Android terbaru muncul paling atas.
10. File Android terbaru merespons `200`.

### Bukti minimum
- screenshot login sukses
- screenshot login gagal
- screenshot rate limit
- screenshot reset password / deep link
- screenshot halaman download
- URL unduhan + hasil verifikasi `200`

### Kriteria lulus
- auth web tidak loop
- reset password konsisten
- artefak publik sinkron dengan halaman download

## Batch 2: Browser Admin Organisasi dan Onboarding
Metode: `Manual, Remote production`

### Scope
- `Daftar Pegawai`
- `Admin Organisasi`

### Skenario wajib
1. Admin organisasi login normal.
2. Admin membuat undangan pegawai baru.
3. Admin kirim ulang undangan.
4. Status undangan tampil `pending`, `verified`, atau `used`.
5. Pengaturan email gateway tersimpan.
6. Daftar via undangan memverifikasi kode dengan benar.
7. OTP salah atau expired ditolak.
8. Kode undangan invalid atau expired ditolak.
9. Email undangan tercatat di audit log.
10. Pengaturan keamanan absensi tidak menghapus `native_app_code`.

### Bukti minimum
- screenshot halaman undangan
- screenshot email / preview undangan
- screenshot status undangan
- screenshot audit log
- query / log bukti email gateway jika ada

### Kriteria lulus
- undangan end-to-end berhasil
- audit log cukup untuk telusur operator
- konfigurasi keamanan tenant tidak rusak

## Batch 3: Emulator Android P0
Metode: `Manual, Emulator, Remote production`

### Scope
- `Native Login Android`
- `Dashboard Pegawai dan WebView`

### Skenario wajib
1. Error `429` auth Android menampilkan cooldown jelas.
2. Session expired saat app terbuka kembali ke login native tanpa loop.
3. Refresh halaman tetap kembali ke dashboard, bukan homepage.
4. Host di luar allowlist diblokir.
5. Session expired pada WebView tetap kembali ke login native.
6. Forced update atau minimum version menampilkan blokir/pengingat benar jika diaktifkan.

### Bukti minimum
- screenshot 429 + pesan cooldown
- screenshot setelah session expired
- screenshot refresh ke dashboard
- screenshot host blocked / allowlist rejection
- screenshot forced update bila fitur aktif

### Kriteria lulus
- tidak ada loop login
- native dan WebView konsisten
- proteksi allowlist benar-benar aktif

## Batch 4: Emulator Android Absensi Edge Case
Metode: `Manual, Emulator, Remote production`

### Scope
- `Absensi dan Sinkronisasi`
- sebagian `Keamanan Dasar`

### Skenario wajib
1. Check-out sebelum check-in ditolak.
2. Double tap tombol absen tidak membuat data ganda.
3. Retry setelah timeout tidak membuat duplikasi.
4. Pending sync terlalu lama menampilkan warning.
5. Logout saat ada pending attendance mengikuti policy.
6. Check-in tanpa lokasi valid ditolak jelas.
7. `app_code` tervalidasi pada mobile auth.
8. `app_code` tervalidasi pada jalur absensi.
9. Request native tanpa `app_code` yang benar ditolak.
10. Notifikasi absensi membedakan status lokal vs final server.

### Bukti minimum
- screenshot penolakan check-out sebelum check-in
- screenshot / query tidak ada duplikasi row
- screenshot pending warning
- screenshot logout saat pending
- log request / response validasi `app_code`
- query server untuk verifikasi row final

### Query minimum
```sql
select id, date, check_in_time, check_out_time, status, created_at
from public.attendance_records_partitioned
where employee_id = '<employee_id>'
order by date desc, created_at desc
limit 10;
```

```sql
select id, status, entry_type, created_at, processed_at, retry_count
from public.attendance_ingest_queue
where employee_id = '<employee_id>'
order by created_at desc
limit 20;
```

### Kriteria lulus
- tidak ada duplikasi absensi
- status lokal vs final server terbaca jelas
- proteksi `app_code` dapat dibuktikan

## Batch 5: Device Nyata Android
Metode: `Manual, Device nyata`

### Scope
- `Koneksi dan Reliability`
- `Absensi dan Sinkronisasi`
- `Keamanan Dasar`
- `Aksesibilitas dan UI`
- gap runtime Android yang belum sah ditutup tanpa HP fisik

### Skenario wajib
1. Perpindahan Wi-Fi ke seluler tidak membuat app macet.
2. Pending sync tetap konsisten setelah force close atau ganti jaringan.
3. Fake GPS / mock location diblokir sesuai policy tenant.
4. Session expired saat app terbuka kembali ke login native tanpa loop.
5. Host di luar allowlist diblokir.
6. Permission geolocation hanya diberikan untuk host yang diizinkan.
7. Minimum version / forced update tampil benar bila policy diaktifkan.
8. Layout tetap muat di layar Android pendek.
9. Nama tenant panjang tetap terbaca layak.
10. Font size besar tidak merusak CTA utama.
11. Dialog penting tetap bisa ditutup dan CTA tetap terlihat.
12. Rotasi layar ditangani sesuai policy app.

### Bukti minimum
- screenshot sebelum dan sesudah ganti jaringan
- screenshot status pending lalu final
- screenshot blok fake GPS
- screenshot session expired kembali ke login native
- screenshot host blocked / origin geolocation blocked
- screenshot forced update / minimum version jika aktif
- screenshot layout layar pendek
- screenshot font besar
- video pendek bila bug UI sulit ditangkap screenshot

### Kriteria lulus
- device fisik tidak memunculkan regresi yang lolos dari emulator
- pending sync aman
- proteksi session, host allowlist, dan geolocation allowlist terbukti
- UI tetap usable pada kondisi device nyata

## Batch 6: Observability dan Quality Gate
Metode: `Otomatis, Manual, Remote Supabase`

### Scope
- `Observability`
- `Operasional Admin dan Data`
- `Quality Gate Rilis`

### Skenario wajib
1. Error backend atau edge function menghasilkan `trace_id`.
2. Log dan audit cukup untuk auth, undangan, dan absensi gagal.
3. Backup Supabase tersedia sebelum perubahan kritis.
4. Migration / function baru hidup di remote Supabase.
5. `npm run autofix`
6. `npm run lint`
7. `npm run test`
8. `npm run build`
9. `./gradlew --no-daemon assembleDebug -Pkotlin.incremental=false`
10. Verifikasi live endpoint utama setelah deploy.

### Bukti minimum
- log error dengan `trace_id`
- backup ref
- output quality gate
- hasil verifikasi endpoint live

### Kriteria lulus
- jalur observability cukup untuk triase
- quality gate rilis bersih
- build Android dan web sama-sama aman

## Urutan harian yang disarankan
1. Jalankan `Batch 1` dan `Batch 2` pada sesi browser.
2. Jika lolos, lanjut `Batch 3` dan `Batch 4` di emulator.
3. Jika emulator aman, lakukan `Batch 5` di device nyata.
4. Tutup dengan `Batch 6` sebelum keputusan rilis.

## Output minimum setiap batch
- 1 file UAT baru dengan format `uat-YYYY-MM-DD-<scope>.md`
- screenshot utama
- query / log verifikasi jika relevan
- verdict `siap`, `siap dengan catatan`, atau `belum siap`
- daftar risiko tersisa

## Saran nama file UAT
- `uat-2026-03-20-auth-web-umum.md`
- `uat-2026-03-20-admin-organisasi-dan-undangan.md`
- `uat-2026-03-20-android-webview-dan-session.md`
- `uat-2026-03-20-absensi-edge-case.md`
- `uat-2026-03-20-device-nyata-lanjutan.md`
- `uat-2026-03-20-quality-gate-rilis.md`

## Catatan keputusan
- Jika waktu sempit, jangan mulai dari `device nyata`.
- Tutup semua `P0` browser + emulator lebih dulu karena itu paling cepat memberi sinyal siap/tidak siap.
- `device nyata` dipakai sebagai validasi akhir, bukan pengganti UAT inti.
