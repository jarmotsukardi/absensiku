# Shortlist FAQ MCP dan Workflow Agent

Dokumen ini menyiapkan shortlist FAQ draft yang relevan setelah penambahan panduan MCP.

Status:
- ini belum otomatis mengubah FAQ publik atau FAQ internal di aplikasi
- gunakan shortlist ini sebagai bahan review sebelum menjalankan `npm run faq:ack`

## Draft FAQ yang Direkomendasikan

### 1. MCP apa saja yang wajib aktif untuk workflow ABSENSIKU?

Jawaban draft:
Aktifkan minimal `filesystem`, `playwright`, dan `memory`. Untuk workflow yang lebih lengkap, tambahkan `context7` dan akses `Supabase/Postgres remote` dalam mode `read-only` agar inspeksi schema dan data tetap aman.

### 2. Kenapa akses Supabase remote sebaiknya read-only secara default?

Jawaban draft:
Karena `Supabase remote` adalah source of truth untuk repo ini. Aksi tulis seperti migration, cleanup data, atau perubahan auth dan billing bisa langsung berdampak ke environment aktif, sehingga harus dilakukan hanya untuk task yang eksplisit dan didahului backup.

### 3. Kapan harus menjalankan backup sebelum memakai akses DB remote?

Jawaban draft:
Jalankan `npm run db:backup:supabase` sebelum perubahan penting pada schema, cleanup data besar, billing, auth, role-permission, trigger, policy, atau function di Supabase remote.

### 4. Kapan agent boleh memakai GitHub write action?

Jawaban draft:
Hanya saat user meminta secara eksplisit, misalnya membuat issue, komentar PR, branch, atau pull request. Di luar itu, akses GitHub sebaiknya tetap `read-only`.

### 5. Apa preflight wajib sebelum test browser di localhost?

Jawaban draft:
Jalankan `npm run ops:sandbox:doctor:strict` lebih dulu. Kalau doctor gagal, jangan lanjutkan test browser sampai environment localhost siap kembali.

## Catatan Review

- kandidat FAQ ini lebih cocok untuk dokumentasi internal tim dan SOP agent
- belum tentu semuanya perlu dimasukkan ke FAQ publik produk
- jika ingin diadopsi ke FAQ aplikasi, pilih hanya item yang relevan untuk admin atau operator
