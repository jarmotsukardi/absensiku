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
- Jangan melakukan `git push`, membuat PR, atau deploy ke Vercel secara otomatis.
- Push ke GitHub dan deploy ke Vercel hanya boleh dilakukan jika user memberi perintah eksplisit pada turn tersebut.

## Standar Logging
- Saat terjadi error, selalu sertakan id referensi error:
  - frontend: log id lokal
  - backend: trace_id
- Error message ke user harus menyertakan referensi ini agar mudah ditelusuri.

## Protokol Eksekusi
- Mulai dengan scan cepat konteks secara paralel.
- Lanjut implementasi bertahap, lalu validasi paralel.
- Jika ditemukan error yang fixable otomatis, jalankan `npm run autofix` terlebih dahulu sebelum perbaikan manual.
- Untuk setiap perubahan/penambahan fitur, wajib tawarkan update FAQ:
  - jalankan `npm run faq:offer` untuk menghasilkan saran FAQ.
  - setelah FAQ benar-benar diperbarui, jalankan `npm run faq:ack`.
  - gunakan `npm run faq:check` pada quality gate bila perlu mode ketat.
- Tutup dengan ringkasan:
  - apa yang diubah
  - hasil validasi
  - risiko tersisa

## Mekanisme Tetap Kecepatan (Lovable-like)
- Gunakan mode kerja cepat sebagai default di setiap task:
  - eksekusi langsung (bukan proposal panjang), kecuali user meminta brainstorming.
  - pecah pekerjaan menjadi batch kecil yang independen (1-5 file per batch).
  - jalankan pembacaan konteks dan validasi secara paralel jika aman.
- Prioritas workflow:
  1. scan konteks paralel (`rg`, baca file relevan, cek log, cek git status)
  2. implementasi bertahap per batch
  3. validasi paralel (`autofix` -> lint -> test -> build sesuai relevansi)
  4. laporkan hasil + risiko tersisa secara ringkas
- Waktu respons teknis:
  - hindari blocking yang tidak perlu; lanjutkan eksekusi selama tidak melanggar aturan keamanan.
  - jika ada error, sertakan referensi (`log id`/`trace_id`) agar triase cepat.
