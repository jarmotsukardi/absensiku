# Rekomendasi Migrasi Auth Tanpa MAU (Tahap Development)

Dokumen ini ditujukan untuk kondisi aplikasi **belum digunakan publik**. Target utamanya adalah menghentikan ketergantungan pada Supabase Auth agar tidak terkena biaya MAU Auth, sambil menjaga keamanan dan meminimalkan risiko regressi.

## Tujuan

- Menghapus penggunaan `supabase.auth.*` pada jalur login aplikasi.
- Menggunakan tabel dan sesi autentikasi milik aplikasi sendiri.
- Menjaga isolasi tenant/role tetap aman selama masa migrasi.

## Prinsip Keamanan

- Jangan migrasi big-bang; gunakan fase bertahap.
- Semua perubahan schema penting diawali backup:
  - `npm run db:backup:supabase`
- Password hanya disimpan dalam bentuk hash (`argon2id` direkomendasikan).
- Session token disimpan sebagai cookie `HttpOnly`, `Secure`, `SameSite=Lax` (atau `Strict` jika memungkinkan).
- Refresh token wajib rotate + revoke saat logout.
- Semua event auth dicatat ke audit log dengan `trace_id`.

## Arsitektur Target (Ringkas)

- Tabel baru:
  - `app_users` (identitas user internal)
  - `app_credentials` (hash password + metadata security)
  - `app_sessions` (session aktif)
  - `app_refresh_tokens` (rotasi refresh)
  - `app_auth_audit_logs` (jejak keamanan)
- API auth internal:
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `POST /api/auth/logout-all`
  - `POST /api/auth/forgot-password` dan `POST /api/auth/reset-password`
- Middleware backend:
  - Validasi session internal.
  - Inject context `user_id`, `tenant_id`, `roles` untuk authorization.

## Strategi Migrasi Paling Aman (Pre-Public)

Karena belum publik, jalur paling aman dan cepat adalah:

1. Build auth baru sampai lengkap.
2. Uji end-to-end di staging/internal.
3. Switch penuh ke auth baru.
4. Baru setelah stabil, matikan flow Supabase Auth.

Tidak perlu dual-run panjang seperti aplikasi yang sudah live, tapi tetap sediakan rollback cepat selama masa validasi internal.

## Status Dokumen

- Status: `READY EXECUTE` (internal development, belum public launch).
- Tanggal finalisasi: `2026-03-08 WIB`.
- Scope eksekusi saat dokumen ini dibuat: migrasi auth aplikasi absensi; HR/Payroll tidak menjadi fokus eksekusi utama.

## Input Keputusan Final (Sudah Disetujui)

| No | Area Keputusan | Status | Keputusan Final |
| --- | --- | --- | --- |
| 1 | Target cutover | disetujui | `full-cutover`: seluruh alur login user pindah ke auth internal; tidak ada jalur produksi yang bergantung `supabase.auth.*`. |
| 2 | Lokasi backend auth | disetujui | Gunakan `Vercel /api` (same-domain) untuk auth gateway, cookie `HttpOnly + Secure + SameSite=Lax`. |
| 3 | Kebijakan sesi | disetujui | Access session idle timeout `30 menit`; session absolute max age `12 jam`; refresh TTL `14 hari`; mode remember-me memperpanjang refresh TTL ke `30 hari`. |
| 4 | Kebijakan password | disetujui | Minimum `10` karakter, wajib huruf+angka; lockout `5` gagal dalam `15 menit`; lockout berulang 3x dalam 24 jam naik menjadi `30 menit`. |
| 5 | Recovery akun | disetujui | Gunakan email gateway existing; reset token TTL `20 menit`; OTP TTL `10 menit`; token sekali pakai. |
| 6 | Strategi mapping user lama | disetujui | Migrasi akun aktif dulu (`employees.is_active = true`), sisanya bertahap; mapping utama dari `employees.user_id` dan `user_roles.user_id`. |
| 7 | Strategi authorization | disetujui | `backend-first`: endpoint private wajib lewat middleware auth internal; review & penyesuaian RLS dilakukan bertahap sesuai modul yang dicutover. |
| 8 | Kriteria sukses + rollback | disetujui | Sukses jika login success rate >= `98%` selama 72 jam internal dan tidak ada kebocoran lintas tenant. Rollback jika login success rate < `95%` (10 menit), ada cross-tenant leak tervalidasi, atau 401/403 spike > `2x` baseline selama 15 menit. |

### Gate Eksekusi

- [x] 8 keputusan final berstatus `disetujui`.
- [x] Trigger rollback terdefinisi dengan angka operasional.
- [x] Scope cutover modul ditetapkan (Employee -> Org -> Superadmin).

## Prerequisite Operasional Tambahan (Siap Eksekusi)

| No | Prasyarat | Owner | Target Tanggal | Deliverable | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Inventaris refactor `supabase.auth.*` | Frontend Lead | 2026-03-09 | Daftar file + urutan batch migrasi | siap |
| 2 | Skema mapping identitas `auth.users` ke `app_users` | Backend Lead | 2026-03-09 | Dokumen mapping + rule deduplikasi | siap |
| 3 | Rencana secrets dev/staging/prod + rotasi | DevOps | 2026-03-09 | Daftar env var + SOP rotasi | siap |
| 4 | Kontrak API auth (`/api/auth/login|refresh|logout|me`) | Backend Lead | 2026-03-10 | Spesifikasi request/response/error code | siap |
| 5 | Matriks test per role + negative test tenant | QA Lead | 2026-03-10 | Test matrix + acceptance checklist | siap |
| 6 | Threshold monitoring dan channel alert | DevOps + QA | 2026-03-10 | Rule alert + channel notifikasi | siap |
| 7 | Runbook insiden auth + rollback | Tech Lead | 2026-03-10 | Dokumen triase + langkah rollback | siap |
| 8 | Rencana cleanup legacy `supabase.auth` dan `auth.uid()` | Backend Lead | 2026-03-11 | Checklist cleanup bertahap | siap |
| 9 | Window eksekusi freeze/cutover/cleanup | Tech Lead + Product | 2026-03-09 | Kalender eksekusi final | siap |
| 10 | Kriteria sign-off Security/QA/Product | Product + QA | 2026-03-10 | Form sign-off release internal | siap |

## Window Eksekusi (Tanggal Konkret)

| Tahap | Tanggal | Output |
| --- | --- | --- |
| Freeze perubahan auth lama | 2026-03-09 | Tidak ada fitur auth baru di jalur lama selama migrasi |
| Fase 1 (fondasi auth internal) | 2026-03-10 s.d. 2026-03-11 | Tabel auth internal + API `/api/auth/*` |
| Fase 2 (integrasi Employee) | 2026-03-12 | Employee login/session pakai auth internal |
| Fase 3 (integrasi Org + Superadmin) | 2026-03-13 s.d. 2026-03-14 | Org/Superadmin login pindah ke auth internal |
| Fase 4 (stabilisasi + rollback drill) | 2026-03-15 s.d. 2026-03-16 | Monitoring 72 jam + simulasi rollback |
| Hard cleanup legacy auth | 2026-03-17 | Penonaktifan jalur `supabase.auth.*` produksi |

## Addendum Keamanan Wajib (Hasil Audit Ulang)

Eksekusi hanya dianggap aman jika enam item ini ikut dikerjakan.

1. Workstream `data-access` wajib eksplisit:
   - Selain login/session, migrasi juga harus menutup query langsung `supabase.from(...)` pada jalur yang dicutover.
   - Jalur private dipindah ke backend API internal dengan tenant guard.
2. Workstream `edge-function-auth-admin` wajib:
   - Semua edge function yang memakai `supabase.auth.admin.*` atau `getUser(token)` harus dipetakan ulang.
   - OTP/reset/join flow tidak boleh putus saat `full-cutover`.
3. Feature flag rollback harus benar-benar ada di code/env:
   - Tambah `AUTH_PROVIDER=internal|supabase` ke env.
   - Implementasi switch provider wajib sebelum fase cutover.
4. Routing backend `/api/*` harus aman:
   - Pastikan route `/api/*` tidak tertimpa rewrite SPA ke `index.html`.
   - Uji endpoint `/api/auth/me` dan `/api/auth/login` langsung di deployment preview.
5. CSRF hardening wajib untuk cookie auth:
   - Terapkan anti-CSRF token (double-submit atau synchronizer token).
   - Validasi `Origin/Referer` untuk request state-changing.
6. Security dependency checklist:
   - Tambah library hash password (`argon2id` atau setara), token/session signing (`jose`/setara), dan cookie helper server.
   - Lock versi dependency dan audit ulang sebelum cutover.

## Mekanisme Memory Optimal (File Memory + MCP Memory)

Tujuan memory adalah menjaga konsistensi keputusan lintas sesi dan mempercepat handover.

### Peran File Memory Lokal (`ops/memory/*`)

- `ops/memory/current-state.local.md`:
  - Snapshot status eksekusi per hari.
  - Isi fokus aktif, phase saat ini, dan metrik baseline terbaru.
- `ops/memory/decisions.local.md`:
  - Catat keputusan permanen migrasi (mis. TTL session, rollback threshold, strategy authorization).
  - Satu keputusan = satu entri dengan tanggal + alasan.
- `ops/memory/open-issues.local.md`:
  - Catat blocker aktif (bug auth, mismatch role, error trace penting).
  - Set severity dan owner.
- `ops/memory/next-actions.local.md`:
  - Daftar aksi berikutnya yang executable (maks 5 prioritas).
- `ops/memory/task-log.local.jsonl`:
  - Log historis run per task untuk audit jejak perubahan.

### Peran MCP Memory (Knowledge Graph)

- Simpan entitas stabil lintas sesi:
  - `project:ABSENSIKU`
  - `migration_phase:F0..F4`
  - `decision:*`
  - `risk:*`
  - `owner:*`
- Simpan relasi penting:
  - `decision` memengaruhi `migration_phase`
  - `risk` menghambat `migration_phase`
  - `owner` bertanggung_jawab `next_action`
- Simpan observasi ringkas, bukan dump panjang log.

### Aturan Sinkronisasi Dua Arah

1. Setelah perubahan task:
   - wajib jalankan `npm run ops:memory:task -- --title ... --summary ...`.
2. Setelah keputusan penting:
   - update `decisions.local.md` dan mirror ke MCP Memory sebagai entity/observation.
3. Saat blocker ditemukan:
   - update `open-issues.local.md` dan mirror ke MCP Memory relation `risk -> phase`.
4. Saat phase berpindah:
   - update `current-state.local.md`, `next-actions.local.md`, dan status entity phase di MCP Memory.

### Trigger Operasional Wajib

- Trigger `task selesai`: update file memory + MCP Memory.
- Trigger `keputusan berubah`: update decisions + graph decision node.
- Trigger `incident`: update open-issues + graph risk node + trace_id referensi.
- Trigger `handover sesi`: pastikan next-actions <= 5 item, jelas owner dan target tanggal.

## Rencana Implementasi Bertahap

## Fase 0 - Persiapan

Owner: Tech Lead + Backend Lead + QA Lead

Langkah eksekusi:

1. Freeze perubahan auth lama dan tetapkan branch kerja migrasi.
2. Jalankan backup database remote:
   - `npm run db:backup:supabase`
3. Rekam baseline login sebelum cutover:
   - `npm run smoke:login:employee`
   - `npm run smoke:login:org`
   - `npm run smoke:login:superadmin`
4. Simpan baseline metrik:
   - login success rate
   - average login latency
   - 401/403 rate
   - error auth rate

Kriteria selesai fase:

- Backup SQL terbaru tersedia.
- Baseline metrik tersimpan dan dipakai sebagai pembanding rollback.

## Fase 1 - Bangun Fondasi Auth Internal

Owner: Backend Lead

Langkah eksekusi:

1. Buat migration tabel auth internal:
   - `app_users`
   - `app_credentials`
   - `app_sessions`
   - `app_refresh_tokens`
   - `app_auth_audit_logs`
2. Tambah index penting:
   - `app_users(email)` unique case-insensitive
   - `app_sessions(user_id, expires_at)`
   - `app_refresh_tokens(session_id, revoked_at)`
3. Implement endpoint `Vercel /api`:
   - `POST /api/auth/login`
   - `POST /api/auth/refresh`
   - `POST /api/auth/logout`
   - `GET /api/auth/me`
4. Implement rate limit login + lockout sesuai keputusan final.
5. Tambah audit logging auth dengan `trace_id` pada success/failure.

Kriteria selesai fase:

- Endpoint auth internal bisa dipanggil end-to-end di environment dev.
- Session cookie `HttpOnly` terbentuk saat login berhasil.

## Fase 2 - Integrasi Aplikasi

Owner: Frontend Lead + Backend Lead

Langkah eksekusi:

1. Tambah client auth internal di frontend (`authClient`).
2. Refactor alur `EmployeeLogin` dan hook session global dari `supabase.auth.*` ke `/api/auth/*`.
3. Refactor logout dan refresh flow untuk role pegawai.
4. Pastikan route guard membaca session internal.

Kriteria selesai fase:

- Login/logout pegawai berjalan tanpa `supabase.auth.*`.
- Smoke test login pegawai lulus.

## Fase 3 - Authorization & Data Access

Owner: Backend Lead + QA Lead

Langkah eksekusi:

1. Refactor `OrgLogin` dan `SuperAdminLogin` ke auth internal.
2. Pindahkan validasi tenant/role ke middleware backend untuk endpoint private.
3. Putus ketergantungan `auth.uid()` pada jalur yang sudah cutover.
4. Uji negative case lintas tenant untuk endpoint private.

Kriteria selesai fase:

- Login org dan superadmin tidak lagi tergantung Supabase Auth.
- Tidak ada akses lintas tenant pada test matrix.

## Fase 4 - Cutover dan Pembersihan

Owner: Tech Lead + QA Lead + DevOps

Langkah eksekusi:

1. Aktifkan auth internal sebagai default.
2. Jalankan quality gate kritikal auth:
   - `npm run autofix`
   - `npm run lint`
   - `npm run test`
   - `npm run build`
3. Jalankan smoke test auth + absensi + billing.
4. Monitor internal minimal 72 jam.
5. Jika stabil, nonaktifkan jalur login Supabase Auth yang tersisa dan bersihkan dead code.

Kriteria selesai fase:

- SLO auth terpenuhi selama 72 jam.
- Rollback drill pernah dijalankan minimal 1 kali.
- Tidak ada dependency produksi pada `supabase.auth.*`.

## Strategi Lint/Test/Build Optimal (Khusus Migrasi Auth)

Perubahan auth dikategorikan **kritikal**, jadi validasi harus ketat namun tetap efisien.

### Mode Validasi per Tahap

| Tahap Kerja | Tujuan | Perintah Utama | Mode |
| --- | --- | --- | --- |
| Iterasi batch kecil (1-5 file) | Deteksi error cepat saat coding | `npm run autofix` lalu lint file terkait dan test terdampak | cepat |
| Selesai 1 fase (F1/F2/F3) | Pastikan fase stabil sebelum lanjut | `npm run lint` + `npm run test` + smoke login role terdampak | menengah |
| Menjelang cutover/release internal | Gate final kritikal auth | `npm run autofix` -> `npm run lint` -> `npm run test` -> `npm run build` | penuh |

### Aturan Paralel yang Aman

1. Operasi baca konteks dan inspeksi log dijalankan paralel.
2. Setelah `autofix` selesai, `lint`, `test`, dan `build` boleh dijalankan paralel untuk cek cepat lokal bila tidak saling bergantung.
3. Untuk keputusan go/no-go cutover, gunakan hasil gate penuh berurutan:
   - `npm run autofix`
   - `npm run lint`
   - `npm run test`
   - `npm run build`
4. Smoke test login lintas role (`employee`, `org`, `superadmin`) dijalankan setelah gate penuh.

### Paket Validasi Wajib per Fase

1. Fase 1 (fondasi auth internal):
   - Lint file backend/API auth baru.
   - Unit/integration test endpoint `/api/auth/*`.
2. Fase 2 (employee cutover):
   - Lint file login/session employee.
   - Test session refresh, logout, idle timeout.
   - `npm run smoke:login:employee`.
3. Fase 3 (org + superadmin):
   - Lint file login org/superadmin.
   - Test authorization role + tenant guard.
   - `npm run smoke:login:org` dan `npm run smoke:login:superadmin`.
4. Fase 4 (cutover):
   - Full gate wajib.
   - Monitoring 72 jam + rollback drill.

### Kriteria Gagal Validasi (Hard Stop)

- `lint` gagal pada file auth/session/authorization.
- `test` gagal pada alur login, refresh, logout, atau tenant isolation.
- `build` gagal atau ada runtime error blocking di jalur login.
- Smoke login salah satu role gagal.

## Strategi Eksekusi Paralel (Acceleration Plan)

Tujuan section ini: mempercepat delivery migrasi auth dengan workstream independen yang berjalan bersamaan tanpa konflik file.

### Pembagian Lane Paralel

| Lane | Scope | Tim/Owner | Batasan |
| --- | --- | --- | --- |
| Lane A | Backend auth core (`/api/auth/*`, middleware, cookie, CSRF) | Backend Lead | Tidak mengedit file UI/login |
| Lane B | Frontend cutover login/session (`Employee`, `Org`, `SuperAdmin`) | Frontend Lead | Tidak mengedit file backend auth core |
| Lane C | Data-access migration (`supabase.from` -> API private) | Backend + Frontend | Prioritas endpoint kritikal dulu |
| Lane D | QA & observability (test matrix, smoke, alert) | QA + DevOps | Hanya konsumsi artifact dari lane lain |

### Matriks Unit Kerja Paralel

| Lane | Unit kerja cepat | Bisa jalan paralel dengan | Output harian minimum |
| --- | --- | --- | --- |
| Lane A | migration auth core, `/api/auth/login`, `/api/auth/refresh`, middleware session, CSRF | Lane B, Lane D | 1 endpoint/auth component selesai atau 1 migration siap review |
| Lane B | adapter auth client, cutover `EmployeeLogin`, cutover `OrgLogin`, cutover `SuperAdminLogin` | Lane A, Lane D | 1 flow login UI selesai atau 1 hook session selesai |
| Lane C | endpoint private pengganti `supabase.from`, bridge data-access, refactor RPC/fetch private | Lane A, Lane D | 1 endpoint private siap + 1 caller utama dipindah |
| Lane D | test harness auth, smoke login, role matrix, observability checklist | Semua lane | 1 paket test/smoke siap atau 1 dashboard alert tervalidasi |

### Aturan Paralel Wajib

1. Jangan edit file yang sama secara paralel.
2. Setiap lane kerja per batch kecil (1-5 file), lalu rebase/merge internal sebelum batch berikutnya.
3. Sinkronisasi lintas lane dilakukan pada checkpoint harian, bukan menunggu akhir fase.
4. Jika ada konflik desain API, freeze coding lane terkait sampai kontrak API diputuskan.

### Yang Wajib Serial, Bukan Paralel

1. Penetapan kontrak `/api/auth/*` final.
2. Apply migration DB yang saling bergantung.
3. Gate go/no-go cutover.
4. Perubahan `vercel.json` final untuk routing `/api/*`.
5. Aktivasi `AUTH_PROVIDER=internal` di environment target.

### Checkpoint Sinkronisasi Cepat

| Checkpoint | Frekuensi | Output Wajib |
| --- | --- | --- |
| Daily morning sync | 1x/hari | prioritas batch + risiko blocker |
| Midday API contract check | 1x/hari | status kompatibilitas FE/BE |
| End-of-day gate | 1x/hari | lint/test batch + update memory |

### Target Kecepatan per Hari

| Hari fase aktif | Target minimum |
| --- | --- |
| Hari backend-heavy | 2 endpoint auth + 1 migration/review |
| Hari frontend-heavy | 2 flow login/session atau 1 flow + 1 guard route |
| Hari data-access | 2 caller utama pindah ke endpoint private |
| Hari QA/stabilisasi | 1 smoke pack + 1 role matrix pass report |

### Urutan Kerja Paralel per Fase

1. Fase 1:
   - Lane A aktif penuh.
   - Lane D siapkan harness test endpoint auth.
2. Fase 2:
   - Lane A maintenance API.
   - Lane B cutover employee.
   - Lane D jalankan smoke employee.
3. Fase 3:
   - Lane B cutover org + superadmin.
   - Lane C migrasi data-access endpoint kritikal.
   - Lane D jalankan role matrix + tenant isolation test.
4. Fase 4:
   - Semua lane fokus stabilisasi, full gate, dan rollback drill.

### Definisi Done Paralel Harian

- Semua lane menutup update di `ops/memory` pada hari yang sama.
- Tidak ada blocker kritikal yang tidak punya owner.
- Tidak ada conflict file lintas lane yang belum diselesaikan.

## Lampiran 1 - RACI dan PIC Aktual

| Area | R (Responsible) | A (Accountable) | C (Consulted) | I (Informed) | Backup PIC |
| --- | --- | --- | --- | --- | --- |
| Lane A Backend Auth Core | Backend Lead | Tech Lead | Security Engineer | Product Owner | Backend Engineer 2 |
| Lane B Frontend Cutover | Frontend Lead | Tech Lead | Backend Lead | Product Owner | Frontend Engineer 2 |
| Lane C Data-Access Migration | Backend Lead | Tech Lead | Frontend Lead | QA Lead | DB Engineer |
| Lane D QA & Observability | QA Lead | QA Lead | DevOps Lead | Product Owner | QA Engineer 2 |
| Cutover Commander | Tech Lead | Tech Lead | QA Lead | Product Owner | Backend Lead |
| Rollback Commander | DevOps Lead | Tech Lead | Backend Lead | Product Owner | QA Lead |

## Lampiran 2 - Tracker Scope Refactor

Status: `todo` | `in_progress` | `blocked` | `done`

| ID | Lane | Modul/File | Scope Refactor | Status | Owner | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| SR-001 | A | `api/auth/login` | endpoint login internal | in_progress | Backend Lead | kickoff fase 1 |
| SR-002 | A | `api/auth/refresh` | refresh token flow | in_progress | Backend Lead | kickoff fase 1 |
| SR-003 | A | `api/auth/logout` | revoke session/token | in_progress | Backend Lead | kickoff fase 1 |
| SR-004 | B | `src/pages/employee/EmployeeLogin.tsx` | cutover auth employee | todo | Frontend Lead | menunggu API stabil |
| SR-005 | B | `src/pages/org/OrgLogin.tsx` | cutover auth org | todo | Frontend Lead | menunggu fase 2 |
| SR-006 | B | `src/pages/admin/SuperAdminLogin.tsx` | cutover auth superadmin | todo | Frontend Lead | menunggu fase 3 |
| SR-007 | C | `supabase/functions/*otp*` | lepas ketergantungan `auth.users` | in_progress | Backend Lead | mapping ulang OTP/reset |
| SR-008 | D | `tests/*` | test matrix auth baru | in_progress | QA Lead | siapkan harness paralel |

## Lampiran 3 - Kontrak API Auth Internal

Semua error auth wajib menyertakan `trace_id`.

| Endpoint | Request (ringkas) | Response sukses | Error code minimum |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `{ email, password, remember_me? }` | `{ success: true, user, session_meta }` + set cookie session | `AUTH_INVALID_CREDENTIALS`, `AUTH_LOCKED`, `AUTH_RATE_LIMIT`, `AUTH_INTERNAL` |
| `POST /api/auth/refresh` | cookie refresh + csrf header | `{ success: true, session_meta }` + rotate cookie | `AUTH_SESSION_EXPIRED`, `AUTH_REFRESH_REVOKED`, `AUTH_INTERNAL` |
| `POST /api/auth/logout` | cookie session + csrf header | `{ success: true }` | `AUTH_NOT_AUTHENTICATED`, `AUTH_INTERNAL` |
| `POST /api/auth/logout-all` | cookie session + csrf header | `{ success: true, revoked_sessions: n }` | `AUTH_NOT_AUTHENTICATED`, `AUTH_INTERNAL` |
| `GET /api/auth/me` | cookie session | `{ authenticated: true, user, roles, tenant_id }` | `AUTH_NOT_AUTHENTICATED`, `AUTH_INTERNAL` |
| `POST /api/auth/forgot-password` | `{ email }` | `{ success: true }` | `AUTH_RATE_LIMIT`, `AUTH_INTERNAL` |
| `POST /api/auth/reset-password` | `{ token_or_otp, new_password }` | `{ success: true }` | `AUTH_RESET_INVALID`, `AUTH_RESET_EXPIRED`, `AUTH_INTERNAL` |

## Lampiran 4 - SQL Migration Plan dan Rollback

| Migration File (rencana) | Tujuan | Rollback Plan (ringkas) |
| --- | --- | --- |
| `supabase/migrations/*_custom_auth_core.sql` | buat `app_users`, `app_credentials`, `app_sessions`, `app_refresh_tokens`, `app_auth_audit_logs` | drop table baru berurutan + restore backup SQL |
| `supabase/migrations/*_custom_auth_indexes.sql` | index performa auth/session | drop index terkait |
| `supabase/migrations/*_auth_provider_flag.sql` | konfigurasi provider switch | revert nilai default ke `supabase` |
| `supabase/migrations/*_auth_mapping_bridge.sql` | jembatan mapping `auth.users` ke `app_users` | drop bridge object + restore mapping dari backup |
| `supabase/migrations/*_auth_uid_policy_refactor.sql` | refactor policy untuk jalur cutover | rollback policy ke versi sebelumnya |

Sebelum apply migration kritikal: jalankan `npm run db:backup:supabase`.

## Lampiran 5 - Data Mapping Playbook

| Kasus | Aturan Mapping | Aksi |
| --- | --- | --- |
| `employees.user_id` valid dan unik | map ke `app_users.legacy_auth_user_id` | migrate langsung |
| email duplikat lintas row | pilih row aktif terbaru (`updated_at`), sisanya tandai konflik | buat tiket manual review |
| email kosong/null | buat placeholder non-login (`is_login_enabled=false`) | wajib verifikasi manual sebelum aktivasi |
| user nonaktif | tetap dibuat tapi `is_login_enabled=false` | tidak ikut cutover awal |
| role tanpa employee row | mapping dari `user_roles` + flag anomali | manual reconciliation |

Aturan hard-stop:
- Jangan cutover user dengan konflik mapping belum resolved.
- Semua konflik dicatat di `ops/memory/open-issues.local.md`.

## Lampiran 6 - Test Case ID Matrix

| Test ID | Role | Skenario | Expected Result | Status |
| --- | --- | --- | --- | --- |
| AUTH-EMP-001 | Employee | login valid | 200 + session cookie terbentuk | todo |
| AUTH-EMP-002 | Employee | login password salah 5x | lockout aktif sesuai policy | todo |
| AUTH-EMP-003 | Employee | refresh session | token rotate, session tetap valid | todo |
| AUTH-ORG-001 | Org Admin | login valid | role/tenant context benar | todo |
| AUTH-SA-001 | Superadmin | login valid | akses superadmin aktif | todo |
| AUTH-TNT-001 | Semua | akses tenant lain | ditolak (403) | todo |
| AUTH-RST-001 | Semua | reset password token valid | password berubah, session lama revoke | todo |
| AUTH-RST-002 | Semua | reset token expired | gagal + trace_id ada | todo |
| AUTH-ROLL-001 | Sistem | switch `AUTH_PROVIDER` ke rollback | jalur lama aktif tanpa downtime kritikal | todo |

## Lampiran 7 - Cutover Runbook (Urutan Command)

1. Backup dan baseline:
   - `npm run db:backup:supabase`
   - `npm run smoke:login:employee`
   - `npm run smoke:login:org`
   - `npm run smoke:login:superadmin`
2. Implementasi batch:
   - `npm run autofix`
   - lint/test terdampak per batch
3. Gate fase:
   - `npm run lint`
   - `npm run test`
4. Gate cutover final:
   - `npm run autofix`
   - `npm run lint`
   - `npm run test`
   - `npm run build`
5. Smoke pasca cutover:
   - `npm run smoke:login:employee`
   - `npm run smoke:login:org`
   - `npm run smoke:login:superadmin`
6. Update memory:
   - `npm run ops:memory:task -- --title "<judul>" --summary "<ringkasan>"`

## Lampiran 8 - Template Laporan Rollback Drill

| Field | Isi |
| --- | --- |
| Drill ID | `ROLL-YYYYMMDD-XX` |
| Tanggal/Waktu | `isi` |
| Trigger rollback | `isi` |
| Scope terdampak | `isi` |
| Commander | `isi` |
| Langkah rollback yang dijalankan | `isi` |
| Durasi pemulihan | `isi` |
| Hasil akhir | `sukses/gagal parsial/gagal` |
| `trace_id` referensi | `isi` |
| Tindak lanjut | `isi` |

## Lampiran 9 - Checklist Post-Cutover 7 Hari

| Hari | Item wajib | Status | Catatan |
| --- | --- | --- | --- |
| D+1 | cek login success rate, 401/403, error auth | todo | - |
| D+2 | validasi tenant isolation + role matrix | todo | - |
| D+3 | verifikasi refresh/logout dan revocation | todo | - |
| D+4 | review audit log + trace_id anomali | todo | - |
| D+5 | review performa endpoint `/api/auth/*` | todo | - |
| D+6 | cek residual dependency `supabase.auth.*` | todo | - |
| D+7 | keputusan hard cleanup legacy | todo | - |

## Lampiran 10 - Sign-off Eksekusi

| Fungsi | Nama | Tanggal | Status | Catatan |
| --- | --- | --- | --- | --- |
| Security | Security Lead | 2026-03-10 | scheduled | sign-off setelah review CSRF + session |
| QA Lead | QA Lead | 2026-03-10 | scheduled | sign-off setelah role matrix hijau |
| Product Owner | Product Owner | 2026-03-10 | scheduled | sign-off setelah UAT internal |
| Tech Lead | Tech Lead | 2026-03-10 | scheduled | sign-off final go/no-go cutover |

## Kebijakan Vercel Wajib (Selama Migrasi Auth)

Karena hosting utama di Vercel, kebijakan ini wajib dipatuhi untuk mencegah outage auth saat cutover.

### 1) Routing Policy

- Endpoint `/api/auth/*` harus memiliki prioritas di atas rewrite SPA.
- Pastikan fallback `/(.*) -> /index.html` tidak menelan route `/api/*`.
- Validasi langsung di Preview deployment:
  - `GET /api/auth/me`
  - `POST /api/auth/login`

### 2) Environment Policy

- Secret auth internal tidak boleh menggunakan prefix `VITE_`.
- Gunakan pemisahan env Vercel: Development, Preview, Production.
- Tambah flag rollback:
  - `AUTH_PROVIDER=internal|supabase`
- Simpan secret untuk session signing, CSRF key, dan pepper password secara terpisah per environment.

### 3) Deploy Promotion Policy

- Semua perubahan auth wajib lewat Preview terlebih dahulu.
- Promotion ke Production hanya jika:
  - full gate lulus (`autofix -> lint -> test -> build`)
  - smoke login 3 role lulus (`employee`, `org`, `superadmin`)
  - tidak ada blocker severity tinggi di auth.

### 4) Cookie dan Session Security Policy

- Cookie session wajib `HttpOnly`, `Secure`, `SameSite=Lax` (atau `Strict` jika kompatibel).
- Set `Cache-Control: no-store` pada response endpoint auth.
- Session rotation wajib saat refresh, revoke wajib saat logout/logout-all.

### 5) CSRF Policy

- Endpoint state-changing (`POST/PUT/PATCH/DELETE`) wajib anti-CSRF.
- Terapkan validasi `Origin/Referer`.
- Terapkan CSRF token (double-submit cookie atau synchronizer token).

### 6) Runtime Policy

- Endpoint auth dijalankan pada runtime yang mendukung library hash/password dan signing yang dipilih.
- Tetapkan batas waktu (`maxDuration`) yang aman untuk login/refresh/reset.
- Hindari operasi blocking berat di jalur request auth.

### 7) Observability dan Alert Policy

- Semua error auth wajib menyertakan `trace_id`.
- Monitor minimal:
  - login failure rate
  - spike 401/403
  - latency endpoint `/api/auth/*`
- Alert wajib aktif di Preview saat dry run dan di Production saat cutover.

### 8) Rollback Policy di Vercel

- Rollback utama: ubah `AUTH_PROVIDER` ke `supabase`, lalu redeploy cepat.
- Rollback sekunder: rollback deployment Vercel ke build stabil terakhir.
- Setelah rollback:
  - verifikasi smoke login 3 role
  - catat laporan rollback drill dengan `trace_id` referensi.

## Strategi Migrasi User dan Data

Tujuan utama: memindahkan **layer identitas dan sesi** tanpa merusak **data bisnis** yang sudah ada.

### Prinsip Umum

1. Data bisnis utama tidak dipindahkan:
   - `employees`
   - `attendance_records`
   - `leave_requests`
   - `notifications`
   - `audit_logs`
   - tabel tenant/billing/laporan terkait
2. Yang dimigrasi adalah:
   - identitas user ke `app_users`
   - credential ke `app_credentials`
   - session/refresh token ke tabel auth internal
3. Relasi lama ke `auth.users` tidak langsung dihapus:
   - buat bridge terlebih dahulu
   - lakukan backfill dan rekonsiliasi
   - baru cleanup bertahap setelah stabil

### Inventaris Referensi User Lama

Referensi ke `auth.users` minimal harus dipetakan untuk kategori berikut:

- `employees.user_id`
- `user_roles.user_id`
- `audit_logs.user_id`
- kolom actor seperti:
  - `created_by`
  - `reviewed_by`
  - `verified_by`
  - `author_user_id`
  - `actor_user_id`

Aturan kerja:
- Semua FK/kolom yang saat ini menunjuk `auth.users(id)` harus dicatat ke tracker migration.
- Setiap kolom ditandai sebagai salah satu tipe:
  - `login_identity`
  - `role_binding`
  - `historical_actor`
  - `optional_reference`

### Strategi Bridge dan Backfill

1. Buat `app_users` dengan kolom bridge:
   - `id`
   - `legacy_auth_user_id`
   - `email`
   - `is_login_enabled`
   - metadata lain yang dibutuhkan
2. Backfill awal:
   - buat satu row `app_users` untuk setiap user hasil mapping valid
   - isi `legacy_auth_user_id` dari `auth.users.id`
3. Tambahkan bridge untuk lookup aman:
   - login flow baru baca `app_users`
   - data lama masih bisa dilacak ke `legacy_auth_user_id`
4. Setelah stabil:
   - ganti reference operasional dari `auth.users.id` ke `app_users.id` bila diperlukan
   - historical actor boleh dipertahankan via kolom legacy selama audit trail tetap valid

### Strategi Per Jenis Data

| Jenis Data | Strategi |
| --- | --- |
| `employees.user_id` | bridge dulu ke `app_users.legacy_auth_user_id`, lalu evaluasi kebutuhan `app_user_id` native |
| `user_roles.user_id` | wajib tersedia untuk authorization baru; prioritas backfill tinggi |
| `audit_logs.user_id` | jangan diubah secara destruktif; tambahkan bridge/lookup baru bila perlu |
| `created_by/reviewed_by/verified_by` | perlakukan sebagai jejak historis; migrasi dengan hati-hati agar histori tidak rusak |
| user tanpa employee row | buat entri `app_users` bila masih relevan secara akses, tandai untuk review |

### Query Rekonsiliasi Wajib

Sebelum dan sesudah migrasi, siapkan query verifikasi minimal untuk:

1. Jumlah total user hasil mapping valid.
2. Jumlah employee aktif yang punya identitas login.
3. Jumlah role binding yang berhasil dipetakan.
4. Jumlah konflik:
   - email duplikat
   - user tanpa employee row
   - employee aktif tanpa user mapping
5. Jumlah orphan reference pada kolom actor/history.

Semua hasil rekonsiliasi wajib dicatat ke:
- `ops/memory/current-state.local.md`
- `ops/memory/open-issues.local.md` bila ada anomali

### Lifecycle User Setelah Migrasi

Dokumen implementasi wajib menjaga lifecycle berikut tetap tersedia:

1. Invite user baru
2. Aktivasi akun
3. Login
4. Refresh session
5. Logout / logout all devices
6. Forgot password / reset password
7. Deactivate user
8. Reactivate user
9. Soft delete / restore jika diperlukan secara bisnis

### Hard Stop Data Migration

- Jangan lanjut cutover jika ada employee aktif yang belum punya mapping user valid.
- Jangan lanjut cleanup legacy jika orphan reference actor/history belum direkonsiliasi.
- Jangan drop FK/kolom lama ke `auth.users` sebelum laporan rekonsiliasi post-cutover hijau.

## Checklist Validasi Wajib

- Login berhasil untuk role utama: superadmin, admin instansi, atasan, pegawai.
- Logout menghapus sesi aktif.
- Refresh token berjalan dan rotasi token terjadi.
- Session expired dipaksa login ulang.
- User tenant A tidak bisa akses data tenant B.
- Password reset invalid/expired token ditolak.
- Audit log tersimpan dengan `trace_id` pada error/success.

## Rollback Plan

1. Simpan feature flag auth provider: `AUTH_PROVIDER=internal|supabase`.
2. Jika incident:
   - switch ke `supabase`
   - invalidate session internal yang bermasalah
   - analisa audit log berdasarkan `trace_id`
3. Gunakan backup SQL terakhir jika ada kerusakan data.

## Risiko yang Harus Diawasi

- Salah mapping role/tenant saat migrasi user lama.
- Session fixation atau refresh token replay jika rotasi tidak benar.
- Endpoint lama masih menerima token lama tanpa validasi konsisten.
- Partial refactor: UI sudah internal auth tetapi backend masih asumsi Supabase user context.

## Definisi Selesai (Definition of Done)

- Tidak ada jalur login produksi yang bergantung `supabase.auth.*`.
- Semua auth flow berjalan melalui endpoint internal.
- Authorization tenant/role tervalidasi via test.
- Monitoring auth error + audit log aktif.
- Dokumen operasional rollback sudah diuji minimal 1 kali.

## Catatan Praktis untuk Repo Ini

- Fokus domain aktif tetap absensi; HR/Payroll tidak menjadi fokus default kecuali ada instruksi eksplisit.
- Prioritaskan migrasi auth pada alur:
  1. `EmployeeLogin` dan session hook
  2. `OrgLogin`
  3. `SuperAdminLogin`
- Setelah fase awal stabil, lanjut refactor modul lain bertahap.
