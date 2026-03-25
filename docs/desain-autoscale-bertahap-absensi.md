# Desain Autoscale Bertahap Absensi

Dokumen ini merumuskan desain autoscale bertahap untuk AbsensiKu agar perilaku sistem bisa naik kelas seiring pertambahan user tanpa langsung memaksa semua jalur berjalan seperti mode enterprise sejak awal.

Dokumen ini melanjutkan:
- [keputusan operasional peak-hour buffering](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/keputusan-operasional-peak-hour-buffering.md)
- [audit menu skalabilitas](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/audit-menu-skalabilitas.md)

## Tujuan

- membuat skala sistem naik secara bertahap, bukan lompat ekstrem
- mencegah perubahan tier naik-turun terlalu sering
- memastikan tier mengubah policy nyata, bukan hanya angka di UI
- menyatukan policy yang dibaca frontend dan backend

## Prinsip Desain

### 1. Jangan hanya pakai jumlah user terdaftar

Keputusan tier tidak boleh hanya bergantung pada total user di database.

Gunakan kombinasi:
- `active_employees`
- `peak_concurrent_attendance_users`
- `queue_depth`
- `p95_lag_seconds`
- `max_pending_age_seconds`
- `failed_count`
- `dead_count`

### 2. Naik satu tingkat per langkah

Urutan tier:
- `small`
- `medium`
- `large`
- `enterprise`

Aturan:
- sistem hanya naik satu tier dalam satu evaluasi
- sistem hanya turun satu tier dalam satu evaluasi
- tidak ada lompatan 2 tingkat kecuali operator melakukan override manual

### 3. Gunakan hysteresis

Naik tier dan turun tier harus memakai ambang yang berbeda.

Tujuannya:
- mencegah tier bolak-balik
- membuat autoscale lebih stabil di kondisi borderline

## Metrik Yang Dipakai

### Metrik kapasitas dasar

- `active_employees`
- `measured_at`

### Metrik kesehatan antrean

- `queue_depth`
- `processing_count`
- `processed_last_5m`
- `avg_lag_seconds`
- `p95_lag_seconds`
- `max_pending_age_seconds`
- `failed_count`
- `dead_count`

### Metrik tambahan yang disarankan

- `peak_concurrent_attendance_users_15m`
- `checkin_requests_last_15m`
- `checkout_requests_last_15m`
- `sync_success_rate_15m`

## Aturan Tier Bertahap

### Small

Dipakai jika:
- `active_employees <= 5.000`
- queue sehat
- lag rendah

Policy:
- sync boleh `immediate` di luar jam sibuk
- saat jam sibuk tetap ikut `deferred`
- queue message opsional

### Medium

Naik dari `small` jika salah satu:
- `active_employees > 5.000` selama minimal 15 menit
- `queue_depth` >= warning threshold selama 3 kali sampling
- `p95_lag_seconds` >= warning threshold selama 3 kali sampling

Turun ke `small` jika semua:
- `active_employees < 4.000` selama 24 jam
- queue sehat
- lag sehat

Policy:
- `deferred` sebagai default
- jitter moderat
- queue message aktif
- sync tetap user-driven, tetapi lebih konservatif

### Large

Naik dari `medium` jika salah satu:
- `active_employees > 20.000` selama minimal 30 menit
- `queue_depth` >= critical threshold selama 3 kali sampling
- `p95_lag_seconds` >= critical threshold selama 3 kali sampling
- `max_pending_age_seconds` menunjukkan backlog serius

Turun ke `medium` jika semua:
- `active_employees < 16.000` selama 48 jam
- queue dan lag kembali sehat

Policy:
- `peak-hour hold` aktif
- ingest request user berubah ke `queue-only`
- pelepasan sync utama dilakukan di luar jam sibuk
- worker/background mulai menjadi jalur utama drain backlog
- queue message wajib aktif

### Enterprise

Naik dari `large` jika salah satu:
- `active_employees > 100.000` selama minimal 60 menit
- `queue_depth`, `lag`, dan `pending age` terus berada di zona kritis walau policy `large` sudah aktif
- operator memilih override manual

Turun ke `large` jika semua:
- `active_employees < 85.000` selama 72 jam
- backlog stabil
- worker drain sehat

Policy:
- `peak-hour hold` wajib
- ingest wajib `queue-only`
- worker/background drain wajib aktif
- release sync memakai jitter yang lebih lebar
- observability admin lebih agresif
- indikator backlog dan pending age menjadi prioritas operasional

## Cadence Evaluasi

### Evaluasi cepat

Setiap `2-5 menit`:
- refresh health queue
- hitung status kapasitas
- jangan langsung ganti tier kecuali rule persist sudah terpenuhi

### Evaluasi keputusan tier

Setiap `15 menit`:
- hitung `suggested_tier`
- cek apakah syarat persist untuk naik/turun tier terpenuhi
- jika ya, ubah `effective_tier`

### Evaluasi drift harian

Setiap `24 jam`:
- audit apakah tier aktif terlalu tinggi atau terlalu rendah
- sarankan koreksi manual jika diperlukan

## Hysteresis Yang Disarankan

Contoh awal:

- naik `small -> medium`:
  - `> 5.000` aktif selama 15 menit
- turun `medium -> small`:
  - `< 4.000` aktif selama 24 jam

- naik `medium -> large`:
  - `> 20.000` aktif selama 30 menit
- turun `large -> medium`:
  - `< 16.000` aktif selama 48 jam

- naik `large -> enterprise`:
  - `> 100.000` aktif selama 60 menit
- turun `enterprise -> large`:
  - `< 85.000` aktif selama 72 jam

## Field `attendance_scalability` Yang Disarankan

Selain field yang sudah ada, tambahkan:
- `mode`
- `tier`
- `effective_tier`
- `suggested_tier`
- `measured_active_employees`
- `measured_at`
- `last_transition_at`
- `transition_reason`
- `peak_hour_enabled`
- `peak_hour_windows`
- `peak_hour_hold_sync`
- `queue_only_ingest`
- `offpeak_release_strategy`
- `release_jitter_min_ms`
- `release_jitter_max_ms`
- `admin_visibility_mode`
- `logout_pending_policy`

## Perilaku Yang Harus Berubah Per Tier

### Policy frontend

- jitter
- retry
- timeout
- buffer retention
- queue message
- pending warning

### Policy backend

- enqueue-only vs enqueue+process
- peak-hour hold
- worker drain
- off-peak release
- observability severity

## Sumber Kebenaran

Target akhir:
- backend menghitung `effective_tier`
- frontend membaca `effective_tier`
- backend juga membaca policy yang sama

Artinya:
- client tidak lagi menjadi pengambil keputusan final untuk tier
- client hanya mengikuti policy final dari server

## Override Manual

Operator tetap harus bisa:
- memaksa tier tertentu
- menonaktifkan autoscale
- memaksa `queue-only ingest`
- memaksa `peak-hour hold`

Tetapi override manual harus tercatat:
- `last_transition_at`
- `transition_reason`
- mode `manual`

## Prioritas Implementasi

1. samakan definisi jam sibuk antara dokumen, UI, dan runtime
2. perluas schema `attendance_scalability`
3. hitung `effective_tier` server-side
4. ubah menu `Skalabilitas` agar menampilkan `suggested_tier` vs `effective_tier`
5. jadikan tier `large` dan `enterprise` mengaktifkan policy backend nyata

## Kesimpulan

Autoscale bertahap yang baik untuk AbsensiKu berarti:
- naik satu tingkat per langkah
- memakai hysteresis
- menghitung tier dari user + health
- mengubah policy nyata di frontend dan backend

Dengan model ini, sistem tidak perlu “enterprise sejak hari pertama”, tetapi fondasinya tetap siap tumbuh sampai traffic besar.

