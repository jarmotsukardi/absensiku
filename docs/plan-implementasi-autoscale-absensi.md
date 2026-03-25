# Plan Implementasi Autoscale Absensi

Dokumen ini memecah desain autoscale menjadi batch implementasi konkret agar bisa dikerjakan bertahap tanpa kehilangan arah.

## Batch 1: Samakan Policy dan Schema

### Tujuan

- menyamakan dokumen, UI, dan runtime
- memperluas object `attendance_scalability`

### File utama

- [scalabilityConfig.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/scalabilityConfig.ts)
- [attendanceResilience.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/attendanceResilience.ts)
- [ScalabilitySettings.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/settings/ScalabilitySettings.tsx)
- migration baru untuk default `system_settings.attendance_scalability`

### Deliverable

- peak-hour windows sama di dokumen, UI, dan runtime
- parser object `attendance_scalability` versi baru
- fallback kompatibel untuk object lama

## Batch 2: Backend Shared Policy

### Tujuan

- backend membaca policy yang sama dengan frontend

### File utama

- [batch-attendance/index.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/functions/batch-attendance/index.ts)
- migration SQL untuk helper config
- worker/cron attendance queue

### Deliverable

- `queue_only_ingest` dihormati
- `peak_hour_hold_sync` dihormati
- `offpeak_release_strategy` dihormati

## Batch 3: Autoscale Evaluator

### Tujuan

- hitung `suggested_tier` dan `effective_tier` server-side

### Area utama

- RPC evaluator atau edge function evaluator
- cron terjadwal
- helper hysteresis

### Deliverable

- evaluasi berkala
- auto-promote dan auto-demote bertahap
- alasan transisi tercatat

## Batch 4: UI Admin Naik Kelas

### Tujuan

- menu `Skalabilitas` menjadi control plane operasional yang jujur

### File utama

- [ScalabilitySettings.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/settings/ScalabilitySettings.tsx)

### Deliverable

- tampil `mode`, `suggested_tier`, `effective_tier`
- tampil status `peak-hour hold`, `queue-only`, `release strategy`
- tampil backlog risk dan transition reason

## Batch 5: Frontend Attendance Runtime

### Tujuan

- frontend mengikuti policy final dari server, bukan local-only heuristik

### File utama

- [useAttendance.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/hooks/useAttendance.ts)
- [useAttendanceSync.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/hooks/useAttendanceSync.ts)
- [attendanceSyncPolicy.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/attendanceSyncPolicy.ts)
- [AttendanceCard.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/employee/AttendanceCard.tsx)

### Deliverable

- peak-hour hold nyata
- release sync sesuai policy
- UX badge lokal vs final konsisten
- logout pending mengikuti policy

## Batch 6: Observability dan UAT

### Tujuan

- operator dan QA bisa memverifikasi autoscale bekerja

### Deliverable

- checklist UAT autoscale
- log `transition_reason`
- indikator backlog
- skenario uji peak-hour hold vs off-peak release

## Urutan Yang Disarankan

1. Batch 1
2. Batch 2
3. Batch 4
4. Batch 5
5. Batch 3
6. Batch 6

Catatan:
- jika evaluator autoscale server-side belum siap, Batch 3 bisa ditunda
- Batch 2 dan Batch 5 adalah inti perubahan perilaku sistem

