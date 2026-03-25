# Keputusan Operasional Peak-Hour Buffering

Dokumen ini menetapkan keputusan operasional singkat untuk mode absensi saat lonjakan besar, terutama ketika target sistem harus menahan spike tinggi pada jam masuk dan jam pulang.

## Tujuan

- menjaga pengalaman user tetap cepat saat jam sibuk
- menahan lonjakan request serentak ke Vercel dan Supabase
- membedakan tegas antara data absensi lokal di perangkat dan data final yang sudah tercatat di server

## Keputusan Inti

### 1. Definisi Jam Sibuk

Policy awal yang disepakati:
- jam masuk sibuk: `06:30-09:00`
- jam pulang sibuk: `16:00-18:30`

Catatan:
- policy ini boleh menjadi default global lebih dulu
- tenant-specific window bisa ditambahkan nanti jika kebutuhan operasional memang berbeda

### 2. Perilaku Saat Jam Sibuk

Saat request absensi terjadi di dalam window jam sibuk:
- data absensi wajib disimpan ke local device terlebih dulu
- dashboard tetap langsung menampilkan catatan absensi sebagai optimistic record
- request user-facing tidak boleh menganggap data sudah final di server
- jalur ingest request user harus menuju `queue-only`, bukan enqueue lalu memproses penuh pada request yang sama

### 3. Kapan Sinkronisasi Dilepas

Policy target:
- sinkronisasi utama dilepas setelah window sibuk selesai
- pelepasan sync tetap memakai jitter agar tidak memunculkan herd baru setelah jam sibuk
- jika worker/background tersedia, pemrosesan utama sebaiknya dijalankan oleh worker terpisah, bukan request user

### 4. Aturan UX User

Setelah user menekan tombol absen:
- catatan absensi langsung muncul di dashboard
- badge/status wajib membedakan:
  - `tersimpan di perangkat`
  - `menunggu sinkronisasi`
  - `sudah tercatat di server`

Wording penting:
- notifikasi tidak boleh memberi kesan final jika data baru tersimpan lokal
- status lokal harus dianggap valid untuk feedback user, tetapi belum final untuk catatan server

### 5. Policy Jika Pending Terlalu Lama

Jika absensi terlalu lama belum tercatat final:
- tampilkan warning yang lebih tegas ke user
- sertakan `Ref ID` atau `trace_id` jika ada
- operator harus bisa membedakan `pending lokal` vs `final server`

### 6. Policy Logout Saat Masih Pending

Policy awal:
- logout tidak boleh menghapus data absensi pending yang masih ada di local device
- user boleh keluar dari sesi, tetapi pending buffer harus tetap aman sampai sinkronisasi selesai atau expired sesuai policy retention
- jika produk nanti ingin menahan logout, itu harus menjadi keputusan operasional terpisah

### 7. Policy Dashboard Admin

Policy awal:
- dashboard admin/operator tetap menganggap data server sebagai sumber final
- data pending lokal di device user tidak otomatis dianggap final di dashboard admin
- jika perlu observability, backlog sinkronisasi ditampilkan sebagai indikator operasional terpisah, bukan dicampur ke laporan final

## Gap Implementasi Saat Ini

Status sekarang:
- sistem sudah `store-first` dan `deferred`
- tetapi belum sepenuhnya `peak-hour hold + off-peak sync`

Gap utama:
- sync saat peak masih bisa dilepas dalam hitungan detik
- periodic sync masih bisa mengirim saat jam sibuk
- ingest belum benar-benar `queue-only`
- read-after-write masih terlalu berat setelah sync sukses

## Prioritas Implementasi Berikutnya

1. ubah mode peak menjadi `peak-hour hold`, bukan `deferred singkat`
2. ubah `batch-attendance` menjadi `queue-only` untuk request user
3. lepaskan pemrosesan utama ke worker/background setelah window sibuk
4. samakan badge, banner, toast, dan dashboard dengan status `lokal` vs `final server`
5. audit ulang refetch dan read amplification setelah sync sukses

