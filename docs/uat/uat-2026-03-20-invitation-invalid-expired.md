# UAT Kode Undangan Invalid atau Expired

- Tanggal uji: 2026-03-20
- Domain: Absensi
- Area: Daftar Pegawai
- Environment: localhost UI + remote Supabase
- Metode: Playwright browser + data undangan dummy terkontrol

## Tujuan
Memastikan kode undangan yang invalid atau sudah kedaluwarsa ditolak dengan pesan yang jelas pada flow registrasi pegawai.

## Catatan Metode
- Flow UI diuji dari halaman [EmployeeLogin](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/employee/EmployeeLogin.tsx#L1) dengan query `?invite=...`.
- Sebelum retest final, ditemukan defect: policy publik `employee_invitations` menyembunyikan row expired sehingga UI tidak bisa membedakan `invalid` vs `expired`.
- Defect ditutup dengan memindahkan validasi ke RPC `validate_invitation_code`, yang sekarang mengembalikan `validation_status` dari function `SECURITY DEFINER`.
- Migration perbaikannya ada di [20260320170848_validate_invitation_code_statuses.sql](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/migrations/20260320170848_validate_invitation_code_statuses.sql#L1).
- Undangan expired dummy dibuat khusus untuk batch ini, diverifikasi, lalu dibersihkan kembali setelah test selesai.

## Hasil

| ID | Skenario | Hasil | Bukti | Catatan |
|---|---|---|---|---|
| UAT-INV-01 | Kode undangan invalid ditolak | LULUS | Halaman `/employee/login?invite=INV-INVALID-...` menampilkan toast `Kode Undangan Tidak Valid` dengan deskripsi `Kode undangan tidak ditemukan atau sudah digunakan.` | Diuji lewat Playwright browser end-to-end |
| UAT-INV-02 | Kode undangan expired ditolak | LULUS | Halaman `/employee/login?invite=INV-EXPIRED-...` menampilkan toast `Kode Undangan Kedaluwarsa` dengan deskripsi `Masa berlaku undangan sudah habis. Minta admin mengirim ulang undangan.` | Retest final memakai RPC `validate_invitation_code` yang mengembalikan `validation_status = expired` |

## Ringkasan
- `2/2` lulus.
- Pesan invalid dan expired sekarang terpisah dengan jelas di UI.
- Row undangan dummy expired dibersihkan kembali setelah pengujian.
