# UAT Notifikasi Lokal vs Final Server

- Tanggal: 2026-03-20
- Domain: Absensi
- Batch: Notifikasi absensi lokal vs final server
- Env: `http://127.0.0.1:5173`
- Akun uji: `susibangka78@gmail.com`

## Ringkasan

- Status akhir: `2/2` lulus
- Keputusan: `siap dengan catatan`
- Catatan: ditemukan wording yang masih terlalu final pada kartu status utama setelah check-in lokal. Sudah diperbaiki dan diretetest pada batch yang sama.

## Temuan dan Perbaikan

1. Temuan awal
- Toast sukses sudah jelas menyebut data tersimpan di perangkat.
- Namun kartu `Status Hari Ini`, tombol aksi utama, dan `Catatan Absen Hari Ini` masih memberi kesan absensi final karena langsung menampilkan `Sudah Absen` dan `Hadir`.

2. Perbaikan
- Ubah toast sukses menjadi `Absen Masuk Tersimpan di Perangkat`.
- Tambahkan label `Tersimpan Lokal` pada kartu status utama untuk record buffer lokal.
- Tambahkan keterangan `Data belum final sampai server mengonfirmasi.`
- Ubah `Catatan Absen Hari Ini` untuk record buffer lokal menjadi `Tersimpan Lokal` dengan penjelasan bahwa status final menunggu sinkronisasi server.
- Ubah tombol aksi disabled dari `Sudah Absen` menjadi `Tersimpan Lokal` saat record masih buffer lokal.

## Hasil Uji

1. Toast sukses local-only tidak terdengar final
- Langkah:
  - Login sebagai pegawai `Susi`.
  - Override tanggal browser ke `2026-03-17 08:15 WIB`.
  - Set geolocation tepat di kantor `BKPSDM JAKARTA`.
  - Set runtime sync ke `worker_only`.
  - Klik `Absen Masuk`.
- Hasil:
  - Toast sukses muncul dengan judul `Absen Masuk Tersimpan di Perangkat`.
  - Deskripsi toast: `Absen masuk tersimpan di perangkat dan akan disinkronkan otomatis.`
- Status: `LULUS`

2. UI utama membedakan status lokal vs final server
- Langkah:
  - Gunakan state hasil check-in lokal pada skenario sebelumnya.
  - Verifikasi kartu `Status Hari Ini`, tombol aksi utama, dan `Catatan Absen Hari Ini`.
- Hasil:
  - Kartu utama menampilkan `Tersimpan Lokal`.
  - Ada keterangan `Data belum final sampai server mengonfirmasi.`
  - Tombol aksi utama disabled bertuliskan `Tersimpan Lokal`.
  - `Catatan Absen Hari Ini` menampilkan `Tersimpan Lokal` dengan pesan `Status final menunggu sinkronisasi server.`
- Status: `LULUS`

## Bukti

- Toast sukses: `Absen Masuk Tersimpan di Perangkat`
- Kartu status: `Tersimpan Lokal`
- Catatan absensi: `Absen masuk pukul 08:15 baru tersimpan di perangkat. Status final menunggu sinkronisasi server.`
