# Audit Menu Skalabilitas

Dokumen ini memetakan status aktual menu `Skalabilitas` di `/admin/settings`, termasuk:
- apa yang benar-benar berubah saat setting dipakai
- apa yang masih pseudo-setting
- apa yang perlu diangkat menjadi control plane operasional sungguhan

## Ringkasan

Verdict saat ini:
- menu `Skalabilitas` **berguna dan perlu dipertahankan**
- fungsinya sekarang sudah cukup baik sebagai **panel kebijakan client-side** dan **observability queue**
- tetapi **belum cukup** untuk dianggap sebagai kontrol backend penuh untuk skenario `100.000 user` pada jam sibuk

## Yang Sudah Benar-Benar Aktif

### 1. Menentukan tier aktif

Menu ini menyimpan tier aktif `small`, `medium`, `large`, atau `enterprise` ke `system_settings.attendance_scalability`, lalu client memakainya untuk menentukan profil runtime.

Efek nyata:
- `syncMode`
- `deferredSyncDelayMs`
- `jitterPeakMaxMs`
- `jitterOffpeakMaxMs`
- `backoff`
- `circuit breaker`
- `rpc timeout`
- `batchSize`
- `sync interval`
- `bufferExpiryDays`
- `maxSyncAttempts`

Anchor utama:
- [scalabilityConfig.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/scalabilityConfig.ts)
- [ScalabilitySettings.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/settings/ScalabilitySettings.tsx)

### 2. Auto mode berdasarkan jumlah pegawai aktif

Mode `auto` sudah menghitung jumlah pegawai aktif dari tabel `employees`, lalu memilih tier rekomendasi.

Artinya:
- menu ini sudah punya peran operasional nyata
- bukan sekadar tampilan statis

### 3. Health panel antrean

Menu ini sudah membaca `get_attendance_ingest_health()` dan menampilkan:
- queue depth
- processing count
- failed/dead queue
- processed last 5m
- avg lag
- p95 lag
- max pending age

Ini sangat berguna untuk operator.

## Yang Masih Pseudo-Setting

### 1. Belum mengontrol backend secara penuh

Saat admin mengganti tier, yang terutama berubah masih perilaku client:
- kapan request ditunda
- berapa jitter
- seberapa agresif retry
- berapa batch size sync

Yang **belum otomatis berubah**:
- request user menjadi `queue-only`
- worker queue aktif atau tidak
- throughput backend nyata
- pembatasan read-after-write
- prioritas pemrosesan setelah jam sibuk

### 2. `Large` atau `Enterprise` belum berarti backend siap 100 ribu user

Memilih tier tinggi sekarang lebih dekat ke:
- mode operasional lebih konservatif
- distribusi load lebih baik
- UX antrean lebih jujur

Bukan berarti:
- Postgres sudah siap burst 100 ribu
- Edge Function sudah workerized
- request user sudah benar-benar tipis

### 3. Enforcement tier masih best-effort

Client memuat tier dari `system_settings`, lalu menyimpannya lokal.
Itu cukup untuk sinkronisasi konfigurasi dasar, tetapi belum kuat sebagai control plane besar yang fail-closed.

## Gap Penting

### 1. Peak-hour policy belum sinkron penuh

UI `Skalabilitas` masih menyebut jam sibuk:
- `06-09`
- `15-18`

Runtime fallback `isPeakHours()` juga masih memakai:
- `06:00-09:00`
- `15:00-18:00`

Ini belum selaras dengan keputusan operasional baru:
- `06:30-09:00`
- `16:00-18:30`

### 2. Belum ada `peak-hour hold`

Saat ini tier `deferred` masih berarti:
- tunda beberapa detik
- lalu tetap coba sync

Belum berarti:
- tahan sync user sampai window sibuk selesai

### 3. Belum ada `queue-only ingest` yang dipaksa dari menu

Menu `Skalabilitas` belum punya kontrol yang benar-benar memaksa:
- request user hanya enqueue
- pemrosesan utama dipindahkan ke worker/background

### 4. Belum mengatur policy dashboard final vs pending

Menu ini belum mengontrol:
- apakah data pending lokal boleh terlihat sebagai indikator operasional
- apakah admin hanya melihat data server final
- bagaimana backlog sinkronisasi dipresentasikan per tenant

## Arah Menjadi Control Plane Operasional

Supaya menu ini naik kelas, perubahan berikut paling masuk akal:

### 1. Tambah policy operasional eksplisit

Bukan hanya tier, tetapi juga field seperti:
- `peak_hour_enabled`
- `peak_hour_windows`
- `peak_hour_hold_sync`
- `queue_only_ingest`
- `offpeak_release_strategy`

### 2. Pisahkan `policy` dari `observability`

Tab `Konfigurasi`:
- tier
- peak-hour policy
- hold/release policy
- queue-only toggle

Tab `Kesehatan Kapasitas`:
- queue depth
- lag
- dead queue
- processed rate
- backlog risk

### 3. Jadikan backend membaca policy yang sama

Bukan hanya client yang membaca `attendance_scalability`.
Edge function / worker / RPC juga harus membaca policy yang sama agar perilaku benar-benar konsisten.

### 4. Tampilkan status operasional yang lebih jujur

Contoh:
- `Mode aktif: Peak-hour hold`
- `Ingest: Queue-only`
- `Release sync: Setelah 18:30 + jitter`
- `Dashboard admin: final-server only`

## Prioritas Perubahan Konkret

1. Samakan definisi jam sibuk antara dokumen, UI, dan runtime.
2. Tambahkan field policy operasional baru pada `attendance_scalability`.
3. Pindahkan keputusan `hold/release` dari client-only menjadi shared policy.
4. Ubah `batch-attendance` agar bisa menghormati `queue-only ingest`.
5. Tambah indikator status policy aktif di halaman admin agar operator tidak salah paham.

## Kesimpulan

Menu `Skalabilitas` saat ini:
- **sudah berguna**
- **sudah mengubah perilaku nyata**
- **sudah punya nilai operasional**

Tetapi:
- masih dominan sebagai **panel kebijakan client-side**
- belum menjadi **control plane backend** untuk skenario lonjakan ekstrem

Jadi langkah terbaik bukan mengganti menu ini, tetapi:
- mempertahankannya
- memperjelas perannya
- lalu menaikkan kemampuannya menjadi pusat kebijakan operasional yang dibaca client dan backend sekaligus

