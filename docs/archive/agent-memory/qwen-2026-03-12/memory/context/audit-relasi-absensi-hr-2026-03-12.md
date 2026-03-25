# Audit Relasi Absensi ↔ HR

## Tanggal: 2026-03-12

### Ringkasan Eksekutif

Audit ini memetakan **domain Absensi** (`/org` dan `/admin`) dan mengidentifikasi **data apa yang bisa direlasikan ke HR** (`/org/hr` dan `/admin/hr`) dengan prinsip:
- **HR membaca, tidak mengubah** (read-only)
- **Absensi = sumber kebenaran event operasional**
- **HR = policy, lifecycle, reporting, governance**

---

## 1. PETA DOMAIN ABSENSI

### **A. Workspace Tenant (`/org`)**

#### **Core Absensi** (✅ Matang)
```
/org                          → Dashboard utama (statistik absensi)
/org/master/*                 → Master Data (OPD, work_units, offices, positions)
/org/schedule/*               → Jadwal Kerja (work_hours, holidays, absence_limits)
/org/employees/*              → Data Pegawai (active, inactive, mutations)
/org/leave/*                  → Permohonan (cuti, WFH, lembur, flexible)
/org/reports/*                → Laporan (attendance, recap, leave, overtime)
```

#### **HR Workspace** (`/org/hr/*`) - Guarded
```
/org/hr                       → Ringkasan HR (dashboard)
/org/hr/employees             → Data Pegawai HR
/org/hr/structure             → Struktur Organisasi
/org/hr/position-grade        → Jabatan dan Grade
/org/hr/contracts             → Kontrak Kerja
/org/hr/documents             → Dokumen HR
/org/hr/reports               → Laporan HR
/org/hr/settings              → Pengaturan HR
/org/hr/help/*                → Bantuan HR (FAQ, Tickets, Error Logs)

⚠️ Internal/Tunda:
/org/hr/onboarding            → Proses Masuk (masih scaffold)
/org/hr/offboarding           → Proses Keluar (masih scaffold)
/org/hr/late-settings         → Pengaturan Keterlambatan (tunda)
/org/hr/leave-types           → Jenis Cuti (tunda)
/org/hr/leave-quota           → Kuota Cuti (tunda)
/org/hr/attendance-insights   → Analitik Kehadiran (internal)
```

#### **Payroll Workspace** (`/org/payroll/*`) - Guarded
```
/org/payroll                 → Dashboard Payroll
/org/payroll/employees       → Master Karyawan
/org/payroll/org-grade       → Struktur & Grade
/org/payroll/income-components → Komponen Penghasilan
... (25 routes total)
```

### **B. Workspace Super Admin (`/admin`)**

#### **Core Absensi** (✅ Matang)
```
/admin                        → Dashboard super admin
/admin/organizations          → Daftar tenant
/admin/master/*               → Master Data global
/admin/schedule/*             → Jadwal Kerja global
/admin/reports/*              → Laporan platform
/admin/leave-approvals        → Approval cuti lintas tenant
/admin/log-errors             → Error logs platform
/admin/streak-monitoring      → Monitoring streak
/admin/partition-monitoring   → Monitoring partisi DB
```

#### **HR Admin Workspace** (`/admin/hr/*`) - Guarded
```
/admin/hr                     → Ringkasan Platform HR
/admin/hr/tenants             → Tenant HR
/admin/hr/policies            → Policies HR
/admin/hr/audit               → Audit HR
/admin/hr/error-logs          → Error Logs HR
/admin/hr/settings            → Pengaturan HR
```

---

## 2. TABEL DATABASE ABSENSI

### **Tabel Inti Absensi** (HR boleh BACA)
| Tabel | Deskripsi | Relasi HR |
|-------|-----------|-----------|
| `employees` | Data pegawai | ✅ Master data HR (sumber kebenaran) |
| `attendance_records` | Catatan absensi | ✅ Reporting & analytics HR |
| `work_hours` | Jam kerja | ✅ Policy reference HR |
| `work_holidays` | Hari libur | ✅ Reference kalender HR |
| `work_shifts` | Shift kerja | ⚠️ HR baca untuk konteks |
| `absence_limits` | Batas toleransi | ✅ Policy reference HR |
| `wfh_schedules` | Jadwal WFH | ⚠️ HR baca untuk konteks |

### **Tabel Permohonan** (HR boleh BACA)
| Tabel | Deskripsi | Relasi HR |
|-------|-----------|-----------|
| `leave_requests` | Permohonan cuti | ✅ Leave analytics HR |
| `wfh_requests` | Permohonan WFH | ⚠️ HR baca untuk konteks |
| `overtime_requests` | Permohonan lembur | ⚠️ HR baca untuk konteks |
| `flexible_attendance_requests` | Absensi fleksibel | ⚠️ HR baca untuk konteks |
| `mutation_requests` | Permohonan mutasi | ✅ HR lifecycle tracking |
| `attendance_corrections` | Koreksi absensi | ⚠️ HR baca untuk konteks |

### **Tabel Master Data** (HR pakai LANGSUNG)
| Tabel | Deskripsi | Relasi HR |
|-------|-----------|-----------|
| `opd` | OPD/Departemen | ✅ Struktur organisasi HR |
| `opd_admins` | Admin OPD | ✅ HR role mapping |
| `work_units` | Satuan kerja | ✅ Struktur organisasi HR |
| `offices` | Lokasi kerja | ✅ Struktur organisasi HR |
| `positions` | Jabatan | ✅ Jabatan & grade HR |
| `employee_categories` | Kategori pegawai | ✅ HR classification |
| `employee_golongan` | Golongan pegawai | ✅ HR grade system |
| `institution_types` | Jenis instansi | ✅ HR classification |

### **Tabel HR & Payroll** (HR WRITE)
| Tabel | Deskripsi | Relasi HR |
|-------|-----------|-----------|
| `hr_contracts` | Kontrak kerja | ✅ HR core (WRITE) |
| `payroll_*` | Tabel Payroll | ⚠️ HR baca untuk konteks |

### **Tabel Sistem** (HR baca untuk monitoring)
| Tabel | Deskripsi | Relasi HR |
|-------|-----------|-----------|
| `audit_logs` | Log aktivitas | ✅ HR audit trail |
| `feedback_reports` | Feedback & tiket | ✅ HR ticket system |
| `notifications` | Notifikasi | ⚠️ HR baca untuk konteks |

---

## 3. RELASI DATA: ABSENSI → HR

### **A. Dashboard HR (`/org/hr`) - Widget yang Bisa Ditambah**

| Widget | Data Absensi | Output HR | Query Pattern |
|--------|--------------|-----------|---------------|
| **Kehadiran Hari Ini** | `attendance_records` (today) | % hadir, terlambat, izin | `COUNT(*) FILTER (WHERE DATE(attendance_date) = TODAY)` |
| **Rekap Mingguan** | `attendance_records` (7 hari) | Trend per hari | `GROUP BY DATE(attendance_date)` |
| **Pegawai Terlambat** | `attendance_records` + `employees` | Top 10 per bulan | `ORDER BY late_count DESC LIMIT 10` |
| **Cuti Pending** | `leave_requests` (pending) | Butuh approval | `WHERE status = 'pending'` |
| **Mutasi Aktif** | `mutation_requests` | Dalam proses | `WHERE status IN ('pending', 'approved')` |

### **B. Data Pegawai HR (`/org/hr/employees`) - Tab yang Bisa Ditambah**

| Tab | Data Absensi | Output HR |
|-----|--------------|-----------|
| **Profil** | `employees` (master) | Data dasar pegawai |
| **History Kehadiran** | `attendance_records` per employee | Rekap bulanan, detail harian |
| **History Cuti** | `leave_requests` per employee | Saldo, riwayat pengajuan |
| **Kinerja Kehadiran** | Aggregate `attendance_records` | % hadir, terlambat, izin per tahun |
| **History Mutasi** | `mutation_requests` + `positions` | Riwayat jabatan |

### **C. Laporan HR (`/org/hr/reports`) - Laporan yang Bisa Ditambah**

| Laporan | Data Absensi | Output HR | Filter |
|---------|--------------|-----------|--------|
| **Rekap Kehadiran Bulanan** | `attendance_records` + `employees` + `opd` | Per OPD, per bulan | Date range, OPD |
| **Analisis Keterlambatan** | `attendance_records` + `work_hours` + `absence_limits` | Ranking per unit | Bulan, OPD |
| **Trend Kehadiran** | `attendance_records` (aggregate) | Chart trend per bulan | Year, OPD |
| **Cuti vs Kehadiran** | `leave_requests` + `attendance_records` | Korelasi cuti dengan absensi | Year, employee |
| **Pegawai Berprestasi** | `attendance_records` (streak) | Pegawai dengan streak tertinggi | Bulan, OPD |

### **D. Kontrak Kerja (`/org/hr/contracts`) - Validasi yang Bisa Ditambah**

| Validasi | Data Absensi | Output HR |
|----------|--------------|-----------|
| **Kontrak Aktif tapi Tidak Absen** | `hr_contracts` + `attendance_records` | Warning: kontrak aktif tapi 30 hari tidak absen |
| **Kontrak Habis + Masih Absen** | `hr_contracts` + `attendance_records` | Warning: kontrak habis tapi masih ada absensi |
| **Overlap Detection** | `hr_contracts` (self-join) | Error: kontrak overlap |

### **E. Onboarding (`/org/hr/onboarding`) - Workflow yang Bisa Dibangun**

| Step | Data Absensi | Output HR |
|------|--------------|-----------|
| **Aktivasi Pegawai** | `employees.is_active` | Cek apakah sudah aktif |
| **First Attendance** | `attendance_records` (first) | Cek apakah sudah mulai absen |
| **Onboarding Checklist** | N/A | Checklist manual HR |

### **F. Offboarding (`/org/hr/offboarding`) - Workflow yang Bisa Dibangun**

| Step | Data Absensi | Output HR |
|------|--------------|-----------|
| **Last Attendance** | `attendance_records` (last) | Kapan pegawai terakhir absen |
| **Pending Leave** | `leave_requests` (pending) | Cuti belum diambil |
| **Access Review** | `audit_logs` | Last system access |

### **G. Analitik Kehadiran HR (`/org/hr/attendance-insights`) - Dashboard yang Bisa Dibangun**

| Insight | Data Absensi | Output HR |
|---------|--------------|-----------|
| **Keterlambatan per OPD** | `attendance_records` + `opd` | Ranking OPD |
| **Keterlambatan per Individu** | `attendance_records` + `employees` | Top 50 terlambat |
| **Trend per Bulan** | `attendance_records` (monthly) | Line chart trend |
| **Alpha Pattern** | `attendance_records` (absent) | Pola alpha per pegawai |
| **WFH vs WFO** | `wfh_schedules` + `attendance_records` | Ratio WFH/WFO |

---

## 4. RELASI DATA: ABSENSI → ADMIN HR

### **A. Dashboard Admin HR (`/admin/hr`) - Widget Lintas Tenant**

| Widget | Data Absensi | Output HR |
|--------|--------------|-----------|
| **Tenant Aktif** | `tenants` + `employees` | Jumlah tenant aktif |
| **Total Pegawai** | `employees` (aggregate) | Total lintas tenant |
| **Kehadiran Global** | `attendance_records` (aggregate) | % hadir lintas tenant |
| **Tenant dengan Error** | `audit_logs` + `tenants` | Tenant bermasalah |

### **B. Tenant HR (`/admin/hr/tenants`) - Monitoring per Tenant**

| Metric | Data Absensi | Output HR |
|--------|--------------|-----------|
| **Kesiapan HR** | `employees` + `hr_contracts` | % data lengkap |
| **Aktivitas HR** | `audit_logs` (HR actions) | Last HR activity |
| **Error Rate** | `error_logs` (HR errors) | Count per tenant |

---

## 5. REKOMENDASI IMPLEMENTASI

### **Prioritas 1: Dashboard HR v2** (60 menit)
```
File: /src/pages/org/hr/OrgHRHome.tsx
Data Absensi: attendance_records (hari ini), leave_requests (pending)
Output: Widget kehadiran real-time
```

**Widget yang ditambah:**
1. Kehadiran Hari Ini (hadir, terlambat, izin, alpha)
2. Rekap Mingguan (trend 7 hari terakhir)
3. Cuti Pending (butuh approval)
4. Pegawai Terlambat Top 5 (bulan ini)

### **Prioritas 2: Laporan Kehadiran HR** (45 menit)
```
File: /src/pages/org/hr/OrgHRReports.tsx
Data Absensi: attendance_records, employees, opd, work_hours
Output: Export CSV/PDF per bulan
```

**Fitur yang ditambah:**
1. Filter date range (bulan/tahun)
2. Filter OPD
3. Export CSV
4. Export PDF
5. Summary: total hadir, terlambat, izin, alpha

### **Prioritas 3: Employee Profile → Tab Kehadiran** (45 menit)
```
File: /src/pages/org/hr/OrgHREmployees.tsx (detail view)
Data Absensi: attendance_records per employee_id
Output: History kehadiran di profil pegawai
```

**Tab yang ditambah:**
1. History Kehadiran (table per bulan)
2. Rekap Bulanan (aggregate per tahun)
3. History Cuti (leave_requests per employee)

### **Prioritas 4: Analisis Keterlambatan** (60 menit)
```
File: /src/pages/org/hr/OrgHRAttendanceInsights.tsx
Data Absensi: attendance_records, work_hours, absence_limits, employees, opd
Output: Ranking keterlambatan per unit
```

**Fitur yang ditambah:**
1. Ranking OPD (terlambat terbanyak)
2. Ranking Individu (top 50)
3. Trend bulanan
4. Filter per bulan/OPD

### **Prioritas 5: Validasi Kontrak** (45 menit)
```
File: /src/pages/org/hr/OrgHRContracts.tsx
Data Absensi: attendance_records
Output: Warning kontrak tidak aktif
```

**Validasi yang ditambah:**
1. Kontrak aktif tapi 30 hari tidak absen
2. Kontrak habis tapi masih ada absensi
3. Overlap detection

### **Prioritas 6: Offboarding → Absensi Terakhir** (30 menit)
```
File: /src/pages/org/hr/OrgHRPriorityWorkspace.tsx (atau halaman offboarding final)
Data Absensi: attendance_records (last per employee)
Output: Info terakhir hadir
```

**Fitur yang ditambah:**
1. Last attendance date per pegawai nonaktif
2. Pending leave balance
3. Access review summary

---

## 6. QUERY CONTOH (Supabase/PostgreSQL)

### **Kehadiran Hari Ini**
```sql
SELECT 
  COUNT(*) FILTER (WHERE ar.status = 'present') as hadir,
  COUNT(*) FILTER (WHERE ar.is_late = true) as terlambat,
  COUNT(*) FILTER (WHERE ar.status = 'absent') as alpha,
  COUNT(*) FILTER (WHERE lr.id IS NOT NULL) as izin
FROM employees e
LEFT JOIN attendance_records ar ON ar.employee_id = e.id 
  AND DATE(ar.attendance_date) = TODAY
LEFT JOIN leave_requests lr ON lr.employee_id = e.id 
  AND DATE(lr.start_date) <= TODAY 
  AND DATE(lr.end_date) >= TODAY
  AND lr.status = 'approved'
WHERE e.is_active = true
  AND e.tenant_id = :tenant_id
```

### **Rekap Mingguan**
```sql
SELECT 
  DATE(ar.attendance_date) as tanggal,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE ar.status = 'present') as hadir,
  COUNT(*) FILTER (WHERE ar.is_late = true) as terlambat,
  COUNT(*) FILTER (WHERE ar.status = 'absent') as alpha
FROM attendance_records ar
JOIN employees e ON e.id = ar.employee_id
WHERE ar.attendance_date >= TODAY - INTERVAL '7 days'
  AND e.tenant_id = :tenant_id
GROUP BY DATE(ar.attendance_date)
ORDER BY tanggal
```

### **Top 10 Terlambat Bulan Ini**
```sql
SELECT 
  e.id,
  e.name,
  e.nip,
  o.name as opd_name,
  COUNT(*) FILTER (WHERE ar.is_late = true) as late_count
FROM employees e
JOIN opd o ON o.id = e.opd_id
JOIN attendance_records ar ON ar.employee_id = e.id
WHERE ar.attendance_date >= DATE_TRUNC('month', NOW())
  AND e.tenant_id = :tenant_id
GROUP BY e.id, o.name
ORDER BY late_count DESC
LIMIT 10
```

### **History Kehadiran per Pegawai**
```sql
SELECT 
  DATE(ar.attendance_date) as tanggal,
  ar.status,
  ar.is_late,
  ar.late_duration,
  ar.notes
FROM attendance_records ar
WHERE ar.employee_id = :employee_id
  AND ar.attendance_date >= :start_date
  AND ar.attendance_date <= :end_date
ORDER BY tanggal DESC
```

---

## 7. BATASAN KEAMANAN (Security Boundary)

### **HR BOLEH (Read-Only)**
✅ SELECT dari semua tabel absensi
✅ JOIN untuk reporting
✅ Aggregate untuk analytics
✅ Filter dan sort

### **HR TIDAK BOLEH (Write Protection)**
❌ INSERT/UPDATE/DELETE `attendance_records`
❌ INSERT/UPDATE/DELETE `leave_requests`
❌ INSERT/UPDATE/DELETE `work_hours`
❌ INSERT/UPDATE/DELETE `audit_logs`

### **HR BOLEH (Write HR Tables)**
✅ INSERT/UPDATE/DELETE `hr_contracts`
✅ INSERT/UPDATE/DELETE `hr_documents`
✅ INSERT/UPDATE/DELETE `hr_recruitment_*`
✅ INSERT/UPDATE/DELETE `feedback_reports` (HR tickets)

---

## 8. CHECKLIST IMPLEMENTASI

### **Sebelum Mulai**
- [ ] Backup database (`npm run db:backup:supabase`)
- [ ] Review RLS policy untuk tabel absensi
- [ ] Pastikan tenant_id context tersedia

### **Setiap Fitur**
- [ ] Query read-only (tidak ada INSERT/UPDATE/DELETE ke absensi)
- [ ] Error handling dengan reference ID
- [ ] Loading state
- [ ] Empty state
- [ ] Export functionality (jika laporan)
- [ ] Filter yang relevan
- [ ] Test dengan data nyata

### **Setelah Selesai**
- [ ] Lint check
- [ ] Type check
- [ ] Build check
- [ ] Simpan ke memory file
- [ ] Update FAQ (jika fitur baru)

---

## 9. CATATAN PENTING

### **Untuk AI Model Lain**

Jika melanjutkan pekerjaan ini:

1. **Baca file ini** + `hr-menu-language-preference.md`
2. **Jaga boundary** HR read-only vs absensi
3. **Semua menu Bahasa Indonesia**
4. **Catat setiap perubahan** ke memory file
5. **Test query** dengan data production (backup dulu)

### **Prinsip Desain**

```
HR bukan dibangun dari nol.
HR dibangun di atas fondasi data absensi yang sudah ada.

HR menambah:
- Konteks (policy, lifecycle, governance)
- Reporting (agregasi, analytics)
- Workflow (onboarding, offboarding, approval)

HR tidak menduplikasi:
- Event operasional (check-in, check-out)
- Master data pegawai (sumber: employees)
- Struktur organisasi (sumber: opd, work_units)
```

---

## 10. RIWAYAT AUDIT

| Tanggal | Audit | Status |
|---------|-------|--------|
| 2026-03-12 | Audit domain Absensi | ✅ Selesai |
| 2026-03-12 | Identifikasi relasi HR ↔ Absensi | ✅ Selesai |
| 2026-03-12 | Rekomendasi implementasi | ✅ Selesai |

---

**File Terkait:**
- `.qwen/memory/context/hr-menu-language-preference.md`
- `docs/panduan_membangun_hr.md`
- `.qwen/memory/tasks/` (task yang akan dikerjakan)

**Next Steps:**
Pilih satu dari prioritas implementasi di section 5, atau task custom lainnya.
