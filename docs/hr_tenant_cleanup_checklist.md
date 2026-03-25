# Checklist Cleanup Data Tenant HR

Tujuan checklist ini: memastikan data tenant aktif cukup bersih untuk operasi HR harian dan cukup aman menjadi sumber payroll dasar ketika gate HR sudah lulus.

Prinsip pakai:
- fokus ke data tenant aktif, bukan backlog fitur
- selesaikan per tenant atau per OPD, jangan campur semua sekaligus
- utamakan field yang memengaruhi lifecycle, laporan, dan payroll dasar
- jika menemukan gap massal, perbaiki sumber datanya lebih dulu sebelum edit manual satu per satu

## 1. Master Pegawai Aktif

- [ ] Tidak ada pegawai aktif tanpa `nama lengkap`.
- [ ] Tidak ada pegawai aktif tanpa `kategori` yang dipakai tenant.
- [ ] Tidak ada pegawai aktif tanpa `status kerja`.
- [ ] Tidak ada pegawai aktif tanpa `joined_date` bila pegawai sudah efektif bekerja.
- [ ] `NIP` dan `NIK` yang diwajibkan tenant tidak kosong pada pegawai aktif.
- [ ] Tidak ada duplikasi identitas utama yang jelas pada pegawai aktif.

## 2. Relasi Organisasi

- [ ] Setiap pegawai aktif punya `OPD` yang benar.
- [ ] Setiap pegawai aktif punya `unit kerja` bila struktur tenant memakainya.
- [ ] Setiap pegawai aktif punya `lokasi kerja/kantor` bila tenant memakai multi-lokasi.
- [ ] `Jabatan` tidak nyangkut ke OPD lama atau unit lama.
- [ ] Tidak ada kombinasi `OPD -> unit -> jabatan` yang tidak konsisten.

## 3. Lifecycle dan Status

- [ ] Pegawai aktif tidak punya status lifecycle yang bertabrakan.
- [ ] Pegawai nonaktif memiliki alasan/status akhir yang jelas.
- [ ] Pegawai offboarding yang selesai tidak masih terbaca aktif.
- [ ] Mutasi/status penting yang sudah efektif tercermin di master pegawai.
- [ ] Kontrak aktif selaras dengan status kerja pegawai.

## 4. Dokumen dan Arsip Fisik

- [ ] Dokumen pegawai penting punya `nomor dokumen`.
- [ ] Dokumen pegawai penting punya `referensi arsip fisik`.
- [ ] Kategori dokumen dipakai konsisten antar admin tenant.
- [ ] Tidak ada dokumen aktif yang owner pegawainya kosong.
- [ ] Dokumen yang sudah tidak aktif ditandai arsip/nonaktif dengan benar.

## 5. Laporan dan Review Operasional

- [ ] Kartu ringkasan HR cocok dengan daftar sumber saat difilter.
- [ ] Daftar `pegawai butuh review` tinggal berisi kasus nyata, bukan noise massal.
- [ ] Daftar `kontrak risiko tinggi` masuk akal terhadap data kontrak aktual.
- [ ] Audit operasional yang dipakai HR cukup bisa ditelusuri untuk perubahan penting.

## 6. Kesiapan Minimum Sebelum Payroll

- [ ] Pegawai yang akan masuk payroll punya kategori dan status kerja yang valid.
- [ ] Pegawai yang akan masuk payroll punya relasi organisasi minimum yang valid.
- [ ] Kontrak atau dasar status kerja tersedia untuk pegawai yang membutuhkannya.
- [ ] Tidak ada pegawai aktif prioritas tinggi yang masih masuk `gap berat (3+)`.
- [ ] Tidak ada pegawai payroll-impact yang masih belum punya akun bila akun diperlukan flow tenant.

## Urutan Kerja Disarankan

1. Bersihkan `kategori` dan `status kerja`.
2. Bersihkan relasi `OPD/unit/lokasi/jabatan`.
3. Cocokkan `kontrak` dan `status`.
4. Rapikan `dokumen` dan `arsip fisik`.
5. Review ulang `laporan` dan daftar `butuh review`.
6. Tandai tenant sebagai `cukup bersih` hanya jika item payroll-impact sudah lulus.

## Catatan Eksekusi

- Gunakan halaman `Data Pegawai` sebagai pusat review gap master.
- Gunakan `Dokumen HR` untuk memastikan nomor dokumen dan referensi arsip fisik konsisten.
- Gunakan `Laporan HR` untuk validasi silang angka ringkasan setelah cleanup.
- Jika cleanup butuh perubahan schema atau logic massal, masukkan kembali ke backlog fitur; jangan paksa lewat edit manual data satu per satu.
