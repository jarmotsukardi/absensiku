# Run Sheet Device Nyata Android AbsensiKu

Dokumen ini adalah panduan eksekusi cepat saat HP Android fisik sudah terhubung ke `adb`. Tujuannya agar verifikasi terakhir fokus ke gap yang memang belum bisa ditutup sempurna di emulator.

Referensi utama:
- [checklist-device-nyata-android.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/checklist-device-nyata-android.md)
- [uat-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-android-runtime.md)
- [sign-off-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/sign-off-2026-03-20-android-runtime.md)
- [uat-template-device-nyata-android.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-template-device-nyata-android.md)

## Tujuan batch
- mengonfirmasi bahwa hasil emulator `15/15` tetap konsisten di device fisik
- memvalidasi GPS native tanpa override
- memvalidasi jaringan nyata Wi-Fi/seluler
- memvalidasi sentuhan manual penuh di area profil/logout
- menutup sisa gap runtime yang belum sah ditutup tanpa HP fisik

## Gap runtime yang harus ditutup di device nyata
- `session expired` saat app sedang terbuka harus kembali ke login native tanpa loop
- host di luar allowlist harus diblokir dengan perilaku yang aman
- permission geolocation hanya boleh diberikan untuk host yang diizinkan
- `minimum version` atau `forced update` harus tampil benar saat policy diaktifkan
- fake GPS atau mock location harus mengikuti policy tenant
- pending sync harus tetap konsisten setelah force-close atau perpindahan jaringan

## Prasyarat cepat
1. Pastikan `adb devices` menampilkan serial HP fisik.
2. Pastikan APK publik terbaru sudah terpasang.
3. Pastikan akun pegawai uji aktif dan punya jadwal kerja hari itu.
4. Pastikan lokasi kerja tenant sudah benar dan dapat dijangkau.
5. Pastikan izin lokasi `Allow while using app` aktif.

## Urutan eksekusi yang disarankan

### Batch A: Login dan sesi
1. Login native dengan akun valid.
2. Verifikasi bootstrap ke dashboard tenant yang benar.
3. Uji password salah sekali untuk memastikan pesan error + `Ref` tetap muncul.
4. Uji `remember off` dengan `force-close -> relaunch`.
5. Uji `remember on` dengan `force-close -> relaunch`.
6. Paksa `session expired` dari server atau dengan revoke session aktif, lalu verifikasi app kembali ke login native tanpa loop.
7. Jika policy `minimum version` tersedia di tenant/staging, aktifkan lalu verifikasi blokir atau peringatan tampil sesuai desain.

### Batch B: Profil dan logout
1. Buka tab `Profil` manual dari bottom navigation.
2. Jalankan logout manual dari halaman profil.
3. Login ulang dan pastikan tenant yang terbuka tetap benar.

### Batch C: Jaringan nyata
1. Saat dashboard aktif, matikan Wi-Fi/data sesuai skenario.
2. Verifikasi kartu koneksi tampil tanpa error URL mentah.
3. Nyalakan koneksi kembali.
4. Verifikasi `Coba lagi` atau `pull-to-refresh` memulihkan dashboard.
5. Ulangi sekali untuk perpindahan Wi-Fi -> seluler.
6. Saat ada data absensi yang masih pending, force-close app lalu buka lagi setelah jaringan pulih.
7. Verifikasi status pending tidak hilang dan akhirnya berubah final di server.

### Batch D: GPS native
1. Di luar radius kantor:
   - coba `Absen Masuk`
   - pastikan ditolak dengan pesan yang benar
2. Di dalam radius kantor:
   - jalankan `Absen Masuk`
   - simpan screenshot koordinat/status di dashboard
3. Jika policy tenant mengaktifkan blok fake GPS:
   - aktifkan mock/fake GPS di device
   - pastikan aplikasi mengikuti policy blokir yang benar
4. Buka halaman yang memicu geolocation dan verifikasi permission hanya diberikan pada host yang memang diizinkan.
5. Coba trigger origin/host di luar allowlist dan pastikan akses lokasi tidak diberikan.

### Batch E: Sinkronisasi final
1. Setelah check-in, verifikasi apakah status awal tampil sebagai lokal/pending atau langsung final.
2. Tunggu sampai sinkronisasi selesai.
3. Verifikasi row final server.
4. Jalankan `Absen Pulang`.
5. Verifikasi row final server berubah memiliki `check_out_time` dan status yang sesuai.
6. Relaunch sekali lagi untuk memastikan status hari itu konsisten.

### Batch F: Allowlist dan update policy
1. Uji tautan atau redirect ke host yang tidak ada di allowlist.
2. Pastikan WebView tidak melanjutkan ke host tersebut dan tampil fallback yang aman.
3. Jika policy `minimum version` atau `forced update` aktif:
   - buka ulang app
   - verifikasi CTA update menuju artefak APK yang benar
   - verifikasi user tidak bisa lanjut ke dashboard jika policy memang blokir keras

## Bukti minimum per batch
- Batch A:
  - screenshot login native
  - screenshot dashboard awal
  - screenshot error login salah-password bila diuji
  - screenshot session expired kembali ke login native
  - screenshot minimum version / forced update bila aktif
- Batch B:
  - screenshot halaman profil
  - screenshot setelah logout kembali ke login native
- Batch C:
  - screenshot kartu koneksi
  - screenshot recovery dashboard
  - screenshot status pending sebelum dan sesudah relaunch
- Batch D:
  - screenshot penolakan di luar radius
  - screenshot keberhasilan di dalam radius
  - screenshot koordinat yang tercatat
  - screenshot prompt izin lokasi pada host yang diizinkan
  - screenshot blokir host/origin di luar allowlist
- Batch E:
  - screenshot status pending/final
  - query server untuk row final
  - screenshot setelah `Absen Pulang`
- Batch F:
  - screenshot host blocked
  - screenshot CTA update APK jika policy aktif

## Query server yang disiapkan
Gunakan employee uji yang aktif pada batch device nyata.

```sql
select id, date, check_in_time, check_out_time, status
from public.attendance_records_partitioned
where employee_id = '<employee_id>'
order by date desc, created_at desc
limit 5;
```

```sql
select id, status, entry_type, created_at, processed_at
from public.attendance_ingest_queue
where employee_id = '<employee_id>'
order by created_at desc
limit 10;
```

## Kriteria lulus cepat
- login/sesi konsisten
- session expired tidak loop
- logout manual benar-benar kembali ke login native
- koneksi putus/pulih tidak melempar ke URL error mentah
- GPS native bisa membedakan luar radius vs dalam radius
- allowlist host dan geolocation benar-benar aktif
- minimum version / forced update bekerja sesuai policy
- check-in dan check-out benar-benar menjadi row final server

## Kriteria berhenti dan catat blocker
- login native loop atau macet
- session expired masuk loop atau tetap tinggal di WebView
- logout manual tidak kembali ke login native
- GPS tidak memberi koordinat nyata
- host luar allowlist masih bisa dibuka
- geolocation diberikan ke origin yang tidak diizinkan
- policy minimum version aktif tetapi app tetap lolos ke dashboard
- check-in/check-out sukses di UI tetapi tidak tercatat di server
- error tanpa `Ref ID` atau tanpa jejak yang bisa ditelusuri

## Output akhir batch
- file UAT baru berbasis [uat-template-device-nyata-android.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-template-device-nyata-android.md)
- screenshot utama tersimpan
- query server tersimpan
- verdict akhir: `GO`, `GO dengan catatan`, atau `NO-GO`
