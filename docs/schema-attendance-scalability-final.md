# Schema Final `attendance_scalability`

Dokumen ini mendefinisikan bentuk final yang disarankan untuk `system_settings.key = attendance_scalability` agar pengaturan skalabilitas tidak lagi hanya menjadi panel client-side, tetapi menjadi sumber policy bersama untuk frontend dan backend.

## Tujuan

- menjadikan `attendance_scalability` sebagai policy object yang lengkap
- membedakan `requested tier`, `suggested tier`, dan `effective tier`
- memberi tempat untuk policy peak-hour, ingest, dan release sync
- memungkinkan autoscale dan override manual hidup berdampingan

## Bentuk Objek Yang Disarankan

```json
{
  "version": 2,
  "mode": "auto",
  "tier": "large",
  "suggested_tier": "large",
  "effective_tier": "large",
  "measured_active_employees": 24500,
  "measured_at": "2026-03-19T09:00:00.000Z",
  "last_transition_at": "2026-03-19T09:00:00.000Z",
  "transition_reason": "auto_promote_queue_depth",
  "peak_hour_enabled": true,
  "peak_hour_windows": [
    { "name": "check_in", "start": "06:30", "end": "09:00" },
    { "name": "check_out", "start": "16:00", "end": "18:30" }
  ],
  "peak_hour_hold_sync": true,
  "queue_only_ingest": true,
  "offpeak_release_strategy": "worker_preferred",
  "release_jitter_min_ms": 15000,
  "release_jitter_max_ms": 120000,
  "admin_visibility_mode": "final_only_with_backlog",
  "logout_pending_policy": "keep_local_pending",
  "autoscale": {
    "evaluation_interval_minutes": 15,
    "fast_health_refresh_minutes": 2,
    "allow_auto_demote": true,
    "hysteresis": {
      "small_to_medium_up_minutes": 15,
      "medium_to_small_down_minutes": 1440,
      "medium_to_large_up_minutes": 30,
      "large_to_medium_down_minutes": 2880,
      "large_to_enterprise_up_minutes": 60,
      "enterprise_to_large_down_minutes": 4320
    }
  }
}
```

## Arti Field

### Field utama

- `version`
  versi schema object agar migrasi key lebih aman

- `mode`
  `manual` atau `auto`

- `tier`
  tier yang dipilih operator atau basis konfigurasi utama

- `suggested_tier`
  tier rekomendasi terbaru hasil evaluator

- `effective_tier`
  tier final yang benar-benar dipakai sistem saat ini

### Field pengukuran

- `measured_active_employees`
- `measured_at`
- `last_transition_at`
- `transition_reason`

### Field peak-hour

- `peak_hour_enabled`
- `peak_hour_windows`
- `peak_hour_hold_sync`

### Field ingest dan release

- `queue_only_ingest`
- `offpeak_release_strategy`
  nilai awal yang disarankan:
  - `client_after_window`
  - `worker_preferred`
  - `worker_only`

- `release_jitter_min_ms`
- `release_jitter_max_ms`

### Field operasional UX/admin

- `admin_visibility_mode`
  nilai awal:
  - `final_only`
  - `final_only_with_backlog`
  - `final_and_pending_summary`

- `logout_pending_policy`
  nilai awal:
  - `keep_local_pending`
  - `warn_then_logout`
  - `block_logout`

### Field autoscale

- `evaluation_interval_minutes`
- `fast_health_refresh_minutes`
- `allow_auto_demote`
- `hysteresis`

## Aturan Validasi

- `effective_tier` harus salah satu dari `small | medium | large | enterprise`
- `suggested_tier` harus valid jika ada
- `peak_hour_windows` harus berisi waktu `HH:mm`
- `release_jitter_min_ms <= release_jitter_max_ms`
- `mode = manual` berarti `effective_tier` tidak diubah otomatis
- `mode = auto` berarti evaluator boleh mengubah `effective_tier`

## Aturan Kompatibilitas

Jika object lama belum punya field baru:
- fallback default tetap aman
- backend dan frontend harus bisa membaca object `version: 1`
- writer baru harus menulis `version: 2`

## Default Yang Disarankan

### Fase awal development

```json
{
  "version": 2,
  "mode": "manual",
  "tier": "large",
  "suggested_tier": "large",
  "effective_tier": "large",
  "peak_hour_enabled": true,
  "peak_hour_hold_sync": true,
  "queue_only_ingest": false,
  "offpeak_release_strategy": "client_after_window",
  "admin_visibility_mode": "final_only_with_backlog",
  "logout_pending_policy": "keep_local_pending"
}
```

Catatan:
- `queue_only_ingest` bisa tetap `false` di fase awal bila worker belum siap
- tapi target akhirnya sebaiknya `true` untuk tier `large+`

## Sumber Kebenaran

Target akhir:
- object ini dibaca frontend
- object ini dibaca edge function / worker / RPC
- admin settings hanya menjadi editor policy, bukan satu-satunya tempat logika hidup

