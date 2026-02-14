# AGENTS.md

Instruksi tetap untuk agent coding di repo ini.

## Tujuan Utama
- Prioritaskan kecepatan produksi tanpa menurunkan kualitas.
- Gunakan eksekusi paralel untuk pekerjaan yang independen.

## Aturan Paralel (Wajib)
- Selalu pecah task menjadi unit independen dan jalankan paralel jika aman.
- Operasi baca konteks harus paralel:
  - pencarian file
  - pembacaan file
  - inspeksi log
  - inspeksi status git
- Operasi validasi harus paralel jika tidak saling bergantung:
  - lint
  - typecheck
  - test
  - build check
- Untuk backend endpoint/edge function, pengujian endpoint berbeda dijalankan paralel.

## Aturan Keamanan Edit
- Jangan edit file yang sama secara paralel.
- Jangan menjalankan perintah destruktif tanpa izin eksplisit user.
- Saat ada konflik hasil paralel, utamakan konsistensi data dan deterministik output.

## Standar Logging
- Saat terjadi error, selalu sertakan id referensi error:
  - frontend: log id lokal
  - backend: trace_id
- Error message ke user harus menyertakan referensi ini agar mudah ditelusuri.

## Protokol Eksekusi
- Mulai dengan scan cepat konteks secara paralel.
- Lanjut implementasi bertahap, lalu validasi paralel.
- Jika ditemukan error yang fixable otomatis, jalankan `npm run autofix` terlebih dahulu sebelum perbaikan manual.
- Tutup dengan ringkasan:
  - apa yang diubah
  - hasil validasi
  - risiko tersisa
