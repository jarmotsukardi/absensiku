# UAT Refresh Dashboard Tetap di Dashboard

- Tanggal uji: 2026-03-20
- Domain: Absensi
- Area: Dashboard Pegawai dan WebView
- Environment: localhost `http://127.0.0.1:5173`
- Metode: Playwright lokal
- Akun uji: `employee` dari `ops/test-accounts.local.json`

## Tujuan
Memastikan refresh halaman pada dashboard pegawai tidak mengembalikan user ke homepage atau login, tetapi tetap berada di route dashboard absensi.

## Langkah Uji
1. Login pegawai melalui `/auth`.
2. Pastikan sesi valid dan arahkan browser ke `/employee/dashboard?tab=home`.
3. Simpan metadata sesi lokal (`web_device_id` dan `absensiku_session_metadata`) agar context dashboard mobile tetap stabil.
4. Lakukan refresh halaman.
5. Bandingkan URL sebelum dan sesudah refresh.

## Hasil

| ID | Skenario | Hasil | Bukti | Catatan |
|---|---|---|---|---|
| UAT-RD-01 | Refresh halaman tetap kembali ke dashboard, bukan homepage | LULUS | Sebelum refresh URL `http://127.0.0.1:5173/employee/dashboard?tab=home`, sesudah refresh tetap `http://127.0.0.1:5173/employee/dashboard?tab=home` | Halaman sempat menampilkan state loading `Menyiapkan dashboard` lalu tetap berada di route dashboard absensi |

## Ringkasan
- `1/1` lulus.
- Route dashboard absensi tetap stabil setelah reload.
- Tidak ada redirect ke homepage pada skenario ini.
