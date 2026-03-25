# AGENTS.md

Instruksi tetap untuk agent coding di repo ini.

## Scope Produk Aktif (Per 3 Maret 2026)
- Fokus repo ini: **aplikasi absensi**.
- Modul **HR** dan **Payroll** tetap berada di folder/repo `ABSENSIKU` sebagai domain lanjutan.
- Status saat ini: **HR aktif** sebagai domain kerja di repo ini bersama absensi.
- Status saat ini: **Payroll tetap on-hold sementara** dan tidak dikerjakan kecuali user memberi perintah eksplisit pada turn aktif.

## Kebijakan Database (Wajib)
- Database sumber kebenaran adalah **Supabase remote** (`*.supabase.co`), bukan DB localhost.
- Jangan menjalankan workflow migrasi/seed ke localhost sebagai default.
- Sebelum perubahan penting pada schema/data (migration, cleanup besar, perubahan billing/auth), lakukan backup SQL lokal:
  - `npm run db:backup:supabase`

## Tujuan Utama
- Prioritaskan kecepatan produksi tanpa menurunkan kualitas.
- Gunakan eksekusi paralel untuk pekerjaan yang independen.

## Bahasa Penjelasan (Tetap)
- Semua penjelasan, ringkasan, dan laporan kepada user **wajib** menggunakan bahasa Indonesia.

## Aturan Paralel (Wajib)
- Selalu pecah task menjadi unit independen dan jalankan paralel jika aman.
- Untuk setiap task, Codex wajib mengevaluasi apakah sub-agent (`spawn_agent`) bisa dipakai untuk mempercepat eksplorasi, verifikasi, atau implementasi batch paralel.
- Untuk task non-trivial, default kerja adalah `Codex + sub-agent`, bukan Codex sendirian.
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

## Mekanisme Kolaborasi Sub-Agent (Wajib)
- Codex tetap memegang critical path, keputusan teknis akhir, integrasi, dan validasi final.
- Sub-agent dipakai untuk pekerjaan sidecar yang independen agar reasoning dan throughput naik:
  - eksplorasi konteks codebase
  - implementasi batch file yang terpisah
  - verifikasi/test yang tidak memblokir langkah lokal berikutnya
  - triase bug atau temuan UAT secara paralel
- Setiap delegasi harus punya scope yang jelas:
  - tujuan konkret
  - file atau area yang menjadi tanggung jawab
  - larangan duplikasi kerja dengan rollout utama
- Jangan edit file yang sama secara paralel antara Codex dan sub-agent.
- Jika limit sub-agent sedang penuh atau delegasi tidak memberi keuntungan nyata, lanjutkan eksekusi lokal dan catat kendalanya secara ringkas.
- Pola default untuk task menengah/besar:
  1. Codex scan konteks awal dan tentukan critical path.
  2. Sub-agent A eksplorasi/bukti atau verifikasi paralel.
  3. Sub-agent B mengerjakan batch implementasi lain jika write scope terpisah.
  4. Codex integrasikan hasil, lakukan validasi akhir, dan simpulkan risiko.
- Untuk review, UAT, dan bugfix:
  - minimal gunakan satu jalur paralel untuk verifikasi, reproduksi, atau audit bukti jika aman.

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
- Setelah menyelesaikan task, update memory proyek:
  - jalankan `npm run ops:memory:task -- --title "<judul_task>" --summary "<ringkasan>"`.
  - isi `--changes`, `--validation`, `--risks`, `--next` bila relevan agar handover antar sesi tetap kuat.
- Setelah setiap batch UAT yang dicatat di `docs/checklist-uji-aplikasi.md` atau `docs/uat/*.md`, wajib sinkronkan ke `Monitoring UAT`:
  - perbarui dulu status item checklist yang terdampak menjadi `Sudah diuji`, `Perlu retest`, atau `Khusus device nyata` agar summary monitoring akurat
  - jika UAT menemukan temuan, wajib jalankan `npm run autofix` lebih dulu bila relevan, lanjutkan perbaikan manual bila masih perlu, lalu catat `Ref ID` atau `trace_id`
  - item yang belum bersih harus ditandai `Perlu retest` sampai diverifikasi ulang setelah perbaikan
  - ringkasan batch di log wajib menyebut `perlu tindak lanjut`, `gagal`, atau wording setara bila temuan belum tertutup agar status monitoring terbaca benar
  - jalankan `npm run uat:sync-monitoring -- --domain=absensi` untuk absensi
  - gunakan `--domain=hr` atau `--domain=payroll` jika sumber checklist domain itu sudah ada
  - pastikan output sync menunjukkan insert/update berhasil sebelum menutup task UAT
  - setelah retest bersih, wajib catat batch retest baru dan sync ulang agar ada jejak `lolos` yang terpisah dari batch gagal
  - task UAT tidak boleh dianggap selesai sebelum monitoring sudah ter-update ke status terakhir batch
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

## Quality Gate Berbasis Risiko (Tetap)
- Jangan jalankan full `lint + test + build` untuk setiap perubahan kecil.
- Terapkan validasi sesuai level risiko perubahan:
  - Perubahan ringan (copywriting/UI minor): lint file terkait saja.
  - Perubahan menengah (logic komponen/API non-kritis): lint file terkait + test terdampak.
  - Perubahan kritikal (billing/auth/role-permission/DB-migration): lint + test terdampak + build penuh.
- Sebelum push/release, wajib full quality gate:
  - `npm run autofix` -> lint full -> test -> build.

## Rule Rilis (Tetap)
- Sebelum push/release:
  - wajib full gate `npm run autofix` -> lint full -> test -> build
- Jangan `git push`/deploy otomatis tanpa perintah eksplisit user pada turn aktif.

## Mekanisme Tetap Localhost Anti-Block (Sandbox)
- Untuk task yang butuh localhost runtime (Playwright/dev server `127.0.0.1`), jalankan preflight ini terlebih dahulu:
  - `npm run ops:sandbox:doctor:strict`
- Jika doctor gagal dengan Ref sandbox (contoh: `SBX-LOCAL-PLAYWRIGHT-1100`), jangan lanjut eksekusi test:
  - pindahkan eksekusi ke mode full-access (tanpa sandbox restriction), atau
  - whitelist prefix command localhost sesuai kebutuhan.
- Setelah environment siap, ulangi doctor lalu baru jalankan test.
