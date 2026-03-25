# Audit Gap HR: Panduan vs Implementasi

## Tanggal: 2026-03-12

### Ringkasan Eksekutif

Audit ini membandingkan **panduan membangun HR** (`docs/panduan_membangun_hr.md`) dengan **implementasi saat ini** di repo ABSENSIKU.

**Status Keseluruhan: 75% Matang**

- ✅ **9 fitur PRODUCTION** - Siap pakai
- ⚠️ **5 fitur SCAFFOLD/BRIDGE** - Butuh pengembangan
- ⏸️ **15+ fitur TUNDA** - Sesuai panduan belum prioritas
- ❌ **10+ fitur BELUM ADA** - Route ada tapi file tidak ada

---

## 1. INVENTARIS ROUTE HR (/org/hr)

### **A. Fitur Production (Matang)**

| Route | File | Capability | Role Minimum | Keterangan |
|-------|------|-----------|--------------|------------|
| `/org/hr` | OrgHRHome.tsx | Dashboard KPI, quick actions | admin_instansi | Widget: pegawai, kontrak, tiket, struktur |
| `/org/hr/employees` | OrgHREmployees.tsx | Read, filter, search | admin_instansi | Active/inactive, kategori, golongan |
| `/org/hr/structure` | OrgHRStructure.tsx | Read | admin_instansi | OPD, work_units, offices |
| `/org/hr/position-grade` | OrgHRPositionGrade.tsx | Read | admin_instansi | Positions, kategori, golongan |
| `/org/hr/contracts` | OrgHRContracts.tsx | Full CRUD, export CSV | admin_instansi | Validasi overlap, duplicate check |
| `/org/hr/documents` | OrgHRDocuments.tsx | Read, filter | admin_instansi | Arsip kontrak & administrasi |
| `/org/hr/reports` | OrgHRReports.tsx | Analytics, drill-down | admin_instansi | Headcount, contract status |
| `/org/hr/help/tickets` | OrgHRTickets.tsx | Full CRUD, SLA, comments | atasan | Assignment, status audit trail |
| `/org/hr/help/faq` | OrgHRFAQ.tsx | Read | atasan | 6 FAQ items |
| `/org/hr/settings` | OrgHRSettings.tsx | Configure modules | admin_instansi | Toggle workspace modules |

**Total: 10 fitur production**

### **B. Fitur Internal (Read-Only/Monitoring)**

| Route | File | Status | Keterangan |
|-------|------|--------|------------|
| `/org/hr/attendance-insights` | OrgHRAttendanceInsights.tsx | Internal | Analitik kehadiran, top late, anomali |
| `/org/hr/help/error-logs` | OrgHRErrorLogs.tsx | Internal | Log error HR, alert realtime, export |

**Total: 2 fitur internal**

### **C. Fitur Tunda/Bridge (Monitoring Transisi)**

| Route | File | Status | Kekurangan |
|-------|------|--------|------------|
| `/org/hr/onboarding` | OrgHRPriorityWorkspace.tsx | Bridge | Monitoring transisi, bukan eksekusi workflow |
| `/org/hr/offboarding` | - | Belum ada file | Hanya disebut di priority workspace |
| `/org/hr/late-settings` | OrgHRPriorityWorkspace.tsx | Bridge | UI belum implementasi |
| `/org/hr/leave-types` | OrgHRPriorityWorkspace.tsx | Bridge | UI belum implementasi |
| `/org/hr/leave-quota` | OrgHRPriorityWorkspace.tsx | Bridge | UI belum implementasi |

**Total: 5 fitur tunda/bridge**

### **D. Fitur Scaffold (ATS - Recruitment)**

| Route | File | Status | Kekurangan |
|-------|------|--------|------------|
| `/org/hr/recruitment/jobs` | OrgHRRecruitmentJobs.tsx | Scaffold | CRUD dasar, tanpa workflow publishing |
| `/org/hr/recruitment/candidates` | OrgHRRecruitmentCandidates.tsx | Scaffold | CRUD kandidat, konversi onboarding ada |
| `/org/hr/recruitment/interviews` | OrgHRRecruitmentInterviews.tsx | Scaffold | CRUD interview, tanpa scheduling automation |
| `/org/hr/recruitment/offers` | OrgHRRecruitmentOffers.tsx | Scaffold | CRUD offers, tanpa approval workflow |

**Total: 4 fitur scaffold ATS**

---

## 2. INVENTARIS ROUTE ADMIN HR (/admin/hr)

### **A. Fitur Production (Matang)**

| Route | File | Status | Keterangan |
|-------|------|--------|------------|
| `/admin/hr` | AdminHRDashboard.tsx | Production | Dashboard KPI lintas tenant |
| `/admin/hr/policies` | AdminHRPolicies.tsx | Production | Kebijakan HR platform |
| `/admin/hr/tenants` | AdminHRTenants.tsx | Production | Manajemen tenant HR |
| `/admin/hr/audit` | AdminHRAudit.tsx | Production | Audit log aktivitas HR |
| `/admin/hr/error-logs` | AdminHRErrorLogs.tsx | Production | Error logs global HR |
| `/admin/hr/settings` | AdminHRSettings.tsx | Production | Pengaturan HR platform |
| `/admin/hr/profile` | AdminHRProfile.tsx | Production | Profil admin HR |
| `/admin/hr/support` | AdminHRSupport.tsx | Production | Dukungan HR |
| `/admin/hr/faq` | AdminHRFAQ.tsx | Production | FAQ admin HR |
| `/admin/hr/tickets` | AdminHRTickets.tsx | Production | Tiket HR level platform |
| `/admin/hr/help` | AdminHRHelp.tsx | Production | Bantuan HR |

**Total: 11 fitur production**

### **B. Bridge Admin**

| Route | File | Status | Keterangan |
|-------|------|--------|------------|
| `/admin/hr/section-bridge/*` | AdminHRSectionBridge.tsx | Bridge | Playbook operasional untuk berbagai domain |
| `/admin/hr/page-shell` | AdminHRPageShell.tsx | Shell | Layout shell admin HR |

**Total: 2 bridge**

---

## 3. MENU SIDEBAR HR (Aktif)

### **Struktur Sidebar HR Tenant (/org/hr)**

```
HRIS → Workspace HR
│
├── Beranda
│   └── Ringkasan HR ✅
│
├── Fondasi Organisasi
│   ├── Struktur Organisasi ✅
│   └── Jabatan dan Grade ✅
│
├── Operasional SDM
│   ├── Data Pegawai ✅
│   ├── Kontrak Kerja ✅
│   └── Dokumen HR ✅
│
├── Layanan Pegawai
│   ├── Proses Masuk Pegawai ⚠️ [TUNDA]
│   ├── Proses Keluar Pegawai ⚠️ [TUNDA]
│   ├── Pengaturan Keterlambatan ⚠️ [TUNDA]
│   ├── Jenis Cuti ⚠️ [TUNDA]
│   └── Kuota Cuti ⚠️ [TUNDA]
│
├── Monitoring
│   ├── Laporan HR ✅
│   ├── Analitik Kehadiran HR ⚠️ [INTERNAL]
│   └── Log Error HR ⚠️ [INTERNAL]
│
├── Dukungan
│   ├── FAQ HR ✅
│   └── Tiket HR ✅
│
└── Konfigurasi
    └── Pengaturan HR ✅
```

**Legend:**
- ✅ = Production ready
- ⚠️ [TUNDA] = Route ada, UI belum matang
- ⚠️ [INTERNAL] = Internal monitoring, bukan menu utama

### **Menu yang Hidden (Tidak Tampil di Sidebar)**

| Domain | Route | Status | Alasan Hidden |
|--------|-------|--------|---------------|
| **ATS** | `/org/hr/recruitment/*` | Scaffold | Belum prioritas (section 32.34) |
| **Performance** | `/org/hr/kpi`, `/org/hr/performance-*` | Belum ada | Ditunda (section 32.34) |
| **Training** | `/org/hr/training-*` | Belum ada | Ditunda (section 32.34) |
| **ESS** | `/org/hr/ess/*` | Belum ada | Ditunda (section 32.34) |
| **Shift** | `/org/hr/shifts` | Belum ada | Boundary dengan absensi (audit 32.37) |
| **Leave Approval** | `/org/hr/leave-approval` | Belum ada | Workflow masih di domain leave (audit 32.39) |

---

## 4. GAP ANALYSIS: Panduan vs Implementasi

### **A. Checklist Minimum (Section 10)**

| Item | Status Panduan | Status Implementasi | Gap |
|------|----------------|---------------------|-----|
| Master pegawai | ✅ Wajib | ✅ Ada (Data Pegawai) | Tidak ada gap |
| Struktur organisasi | ✅ Wajib | ✅ Ada (Struktur Organisasi) | Tidak ada gap |
| Jabatan dan grade | ✅ Wajib | ✅ Ada (Jabatan dan Grade) | Tidak ada gap |
| Kontrak kerja | ✅ Wajib | ✅ Ada (Kontrak Kerja) | Tidak ada gap |
| Status kepegawaian | ✅ Wajib | ⚠️ Alias ke employees | Bisa dipisah jadi halaman sendiri |
| Kebijakan kerja dasar | ⚠️ Tunda | ⚠️ Tunda (late-settings, shifts) | Sesuai panduan |
| Leave/permission baseline | ⚠️ Tunda | ⚠️ Tunda (leave-types, quota, approval) | Sesuai panduan |
| Audit log | ✅ Wajib | ✅ Ada (error-logs, tickets audit) | Tidak ada gap |
| Role/permission dasar | ✅ Wajib | ✅ Ada (hrRouteAccess) | Tidak ada gap |
| Error handling | ✅ Wajib | ✅ Ada (reference error) | Tidak ada gap |

**Kesesuaian: 8/10 (80%)**

### **B. Sidebar Final HR (Section 15.0)**

| Group Menu | Status Panduan | Status Implementasi | Gap |
|------------|----------------|---------------------|-----|
| Ringkasan | ✅ Aktif | ✅ Ada (Ringkasan HR) | Tidak ada gap |
| Pegawai | ✅ Aktif | ✅ Ada (Data Pegawai) | Tidak ada gap |
| Organisasi | ✅ Aktif | ✅ Ada (Struktur Organisasi) | Tidak ada gap |
| Hubungan Kerja | ✅ Aktif | ✅ Ada (Jabatan, Grade, Kontrak) | Tidak ada gap |
| Dokumen | ✅ Aktif | ✅ Ada (Dokumen HR) | Tidak ada gap |
| Laporan | ✅ Aktif | ✅ Ada (Laporan HR) | Tidak ada gap |
| Bantuan | ✅ Aktif | ✅ Ada (FAQ, Tiket) | Tidak ada gap |
| Pengaturan | ✅ Aktif | ✅ Ada (Pengaturan HR) | Tidak ada gap |

**Kesesuaian: 8/8 (100%)**

### **C. Fitur yang Disebut di Panduan Tapi Belum Implementasi**

| Fitur | Section Panduan | Status | Prioritas |
|-------|-----------------|--------|-----------|
| Histori jabatan terpisah | 13.4, 15.2 | ⚠️ Alias ke employees | 🟡 Sedang |
| Employee lifecycle tracking | 4, 13.1 | ⚠️ Monitoring only | 🟡 Sedang |
| Approval hierarchy config | 14.2.H | ❌ Belum ada | 🟢 Rendah |
| Document templates | 14.2.F | ❌ Belum ada | 🟢 Rendah |
| Training & certification | 3.6, 14.2 | ❌ Belum ada | 🔴 Tunda |
| Performance management | 3.6, 14.2 | ❌ Belum ada | 🔴 Tunda |
| ESS portal lengkap | 14.2 | ❌ Belum ada | 🔴 Tunda |
| Shift management | 14.2.C | ❌ Belum ada | 🔴 Tunda |
| Leave approval workflow | 14.2.E | ❌ Belum ada | 🔴 Tunda |
| Leave validity | 14.2.E | ❌ Belum ada | 🔴 Tunda |

---

## 5. DETAIL GAP PER DOMAIN

### **A. Domain yang Sudah Matang (No Gap)**

#### **1. Ringkasan HR**
- ✅ Dashboard KPI (pegawai, kontrak, tiket, struktur)
- ✅ Quick actions (Data Pegawai, Kontrak, Laporan, Tiket)
- ✅ Widget notifikasi dan aktivitas

#### **2. Data Pegawai**
- ✅ List pegawai aktif/nonaktif
- ✅ Filter kategori dan golongan
- ✅ Search functionality
- ✅ Read dari `employees` table

#### **3. Struktur Organisasi**
- ✅ OPD management
- ✅ Work units (satuan kerja)
- ✅ Offices (lokasi kerja)
- ✅ Read dari `opd`, `work_units`, `offices`

#### **4. Jabatan dan Grade**
- ✅ Positions (jabatan)
- ✅ Employee categories
- ✅ Employee golongan
- ✅ Read dari `positions`, `employee_categories`, `employee_golongan`

#### **5. Kontrak Kerja**
- ✅ Full CRUD (Create, Read, Update, Delete)
- ✅ Validasi overlap kontrak
- ✅ Duplicate check (contract_number)
- ✅ Export CSV
- ✅ Filter status dan search

#### **6. Dokumen HR**
- ✅ Read arsip kontrak
- ✅ Filter by status kontrak
- ✅ Employee detail view

#### **7. Laporan HR**
- ✅ Headcount report
- ✅ Contract status analytics
- ✅ Drill-down by kategori
- ✅ Visualisasi chart

#### **8. Tiket HR**
- ✅ Full CRUD tiket
- ✅ SLA tracking
- ✅ Assignment system
- ✅ Comments dan audit trail
- ✅ Status management

#### **9. Pengaturan HR**
- ✅ Toggle workspace modules
- ✅ Konfigurasi HR tenant
- ✅ Read/write HR settings

---

### **B. Domain yang Masih Gap (Butuh Pengembangan)**

#### **1. Proses Masuk Pegawai (Onboarding)**
**Status:** Bridge/Monitoring
**Gap:**
- ❌ Bukan workflow eksekusi
- ❌ Hanya monitoring transisi
- ❌ Eksekusi masih di kandidat ATS dan employee_invitations

**Yang Perlu Dibangun:**
- ✅ Daftar onboarding aktif
- ✅ Checklist onboarding per pegawai
- ✅ Status progres (undangan → aktivasi)
- ✅ Integrasi dengan kandidat hired
- ✅ Notifikasi onboarding pending

**File Baru:** `OrgHROnboarding.tsx` (ganti OrgHRPriorityWorkspace.tsx)

---

#### **2. Proses Keluar Pegawai (Offboarding)**
**Status:** Belum Ada File
**Gap:**
- ❌ Tidak ada halaman offboarding
- ❌ Hanya disebut di priority workspace
- ❌ Monitoring dari pegawai nonaktif

**Yang Perlu Dibangun:**
- ✅ Daftar offboarding aktif
- ✅ Checklist serah terima aset
- ✅ Penonaktifan akses
- ✅ Dokumen akhir (terminasi)
- ✅ Last attendance info

**File Baru:** `OrgHROffboarding.tsx`

---

#### **3. Pengaturan Keterlambatan**
**Status:** Bridge (OrgHRPriorityWorkspace.tsx)
**Gap:**
- ❌ UI belum implementasi
- ❌ Data `absence_limits` belum dikelola HR
- ❌ Ownership masih di domain absensi

**Yang Perlu Dibangun:**
- ✅ Read `absence_limits`
- ✅ Config toleransi keterlambatan
- ✅ Eskalasi violation
- ✅ Policy per unit kerja

**File Baru:** `OrgHRLateSettings.tsx` (atau ambil dari `/org/schedule/absence-limits`)

---

#### **4. Jenis Cuti**
**Status:** Bridge (OrgHRPriorityWorkspace.tsx)
**Gap:**
- ❌ UI belum implementasi
- ❌ Tabel `leave_types` belum dikelola HR
- ❌ Ownership masih di domain leave

**Yang Perlu Dibangun:**
- ✅ CRUD leave types
- ✅ Persyaratan dokumen per jenis
- ✅ Integrasi ke quota
- ✅ Policy mapping

**File Baru:** `OrgHRLeaveTypes.tsx`

---

#### **5. Kuota Cuti**
**Status:** Bridge (OrgHRPriorityWorkspace.tsx)
**Gap:**
- ❌ UI belum implementasi
- ❌ Tabel `leave_quotas` belum dikelola HR
- ❌ Ownership masih di domain leave

**Yang Perlu Dibangun:**
- ✅ CRUD quotas per pegawai/kelompok
- ✅ Carry-over configuration
- ✅ Kadaluarsa quota
- ✅ Validasi pemotongan saldo

**File Baru:** `OrgHRLeaveQuota.tsx`

---

#### **6. Histori Jabatan (Mutation History)**
**Status:** Alias ke employees
**Gap:**
- ⚠️ Data ada di `mutation_requests`
- ⚠️ Belum ada halaman dedicated

**Yang Perlu Dibangun:**
- ✅ List mutasi per pegawai
- ✅ Timeline jabatan
- ✅ Filter periode dan unit
- ✅ Export history

**File Baru:** `OrgHRJobHistory.tsx` atau tab di `OrgHREmployees.tsx`

---

#### **7. Approval Hierarchy**
**Status:** Belum Ada
**Gap:**
- ❌ Konfigurasi approver belum ada
- ❌ Escalation path belum ada
- ❌ SLA approval belum configurable

**Yang Perlu Dibangun:**
- ✅ Hierarki approver (level 1, 2, 3)
- ✅ Mapping approval type (cuti, WFH, lembur)
- ✅ SLA per level
- ✅ Backup approver

**File Baru:** `OrgHRApprovalHierarchy.tsx`

---

#### **8. Document Templates**
**Status:** Belum Ada
**Gap:**
- ❌ Template kontrak belum ada
- ❌ Template surat peringatan belum ada
- ❌ Template HR letters belum ada

**Yang Perlu Dibangun:**
- ✅ CRUD template
- ✅ Variable substitution
- ✅ Preview template
- ✅ Version control

**File Baru:** `OrgHRDocumentTemplates.tsx`

---

### **C. Domain yang Ditunda (Sesuai Panduan)**

**Tidak perlu dikerjakan sekarang** (section 32.34):

| Domain | Fitur | Alasan Tunda |
|--------|-------|--------------|
| **ATS** | Publishing lowongan, interview scheduling, offer workflow | Belum prioritas, route ada tapi scaffold |
| **Performance** | KPI, 360 review, evaluation | Ditunda sampai fondasi HR stabil |
| **Training** | Training data, certifications, skill matrix | Ditunda sampai fondasi HR stabil |
| **ESS** | ESS portal lengkap | Ditunda sampai HR tenant matang |
| **Shift** | Shift management | Boundary dengan absensi belum jelas |
| **Leave Approval** | Approval workflow cuti | Masih di domain leave, belum pindah ke HR |

---

## 6. REKOMENDASI PRIORITAS

### **Prioritas 1 - Selesaikan Fitur Tunda yang Sudah Ada Route**
**(Estimasi: 4-6 jam total)**

| Task | File | Estimasi | Output |
|------|------|----------|--------|
| **Offboarding** | `OrgHROffboarding.tsx` | 90 menit | Workflow keluar pegawai lengkap |
| **Onboarding** | `OrgHROnboarding.tsx` | 90 menit | Workflow masuk pegawai lengkap |
| **Histori Jabatan** | `OrgHRJobHistory.tsx` | 45 menit | Tab/halaman mutation history |

---

### **Prioritas 2 - Implementasi Leave Management**
**(Estimasi: 3-4 jam total)**

| Task | File | Estimasi | Output |
|------|------|----------|--------|
| **Jenis Cuti** | `OrgHRLeaveTypes.tsx` | 60 menit | CRUD leave types |
| **Kuota Cuti** | `OrgHRLeaveQuota.tsx` | 90 menit | CRUD quotas + carry-over |
| **Approval Hierarchy** | `OrgHRApprovalHierarchy.tsx` | 60 menit | Konfigurasi approver |

---

### **Prioritas 3 - Perbaiki Scaffold ATS**
**(Estimasi: 3-4 jam total)**

| Task | File | Estimasi | Output |
|------|------|----------|--------|
| **Workflow Publishing** | Update `OrgHRRecruitmentJobs.tsx` | 45 menit | Approval + career page |
| **Interview Scheduling** | Update `OrgHRRecruitmentInterviews.tsx` | 60 menit | Calendar + feedback forms |
| **Offer Templates** | Update `OrgHRRecruitmentOffers.tsx` | 60 menit | Template generator |

---

### **Prioritas 4 - Maintenance & Cleanup**
**(Estimasi: 1-2 jam total)**

| Task | File | Estimasi | Output |
|------|------|----------|--------|
| **Sinkronisasi Naming** | Multiple files | 30 menit | Heading = menu sidebar |
| **Konsolidasi Route Alias** | Router config | 30 menit | Redirect departments → structure |
| **FAQ Expansion** | `OrgHRFAQ.tsx` | 30 menit | 6 → 12 FAQ items |

---

### **Prioritas 0 - JANGAN DISENTUH (Masih Tunda)**

| Domain | Alasan |
|--------|--------|
| Performance/KPI | Sesuai section 32.34, ditunda |
| Training & Certification | Sesuai section 32.34, ditunda |
| ESS Portal | Sesuai section 32.34, ditunda |
| Shift Management | Boundary dengan absensi (audit 32.37) |
| Leave Approval Workflow | Masih di domain leave (audit 32.39) |

---

## 7. CHECKLIST IMPLEMENTASI

### **Sebelum Mulai Prioritas 1**
- [ ] Backup database (`npm run db:backup:supabase`)
- [ ] Review RLS policy untuk tabel terkait
- [ ] Pastikan tenant_id context tersedia
- [ ] Baca section 32.35 (Checklist Promosi Menu Internal)

### **Setiap Fitur Baru**
- [ ] Query read-only (tidak ada INSERT/UPDATE/DELETE ke absensi)
- [ ] Error handling dengan reference ID
- [ ] Loading state
- [ ] Empty state
- [ ] Filter yang relevan
- [ ] Export functionality (jika laporan)
- [ ] Test dengan data nyata

### **Setelah Selesai**
- [ ] Lint check (`npm run lint`)
- [ ] Type check (`npm run typecheck`)
- [ ] Build check (`npm run build`)
- [ ] Simpan ke memory file (`.qwen/memory/tasks/`)
- [ ] Update FAQ (jika fitur baru)
- [ ] Update dokumen ini

---

## 8. RIWAYAT AUDIT

| Tanggal | Audit | Status |
|---------|-------|--------|
| 2026-03-12 | Audit domain HR lengkap | ✅ Selesai |
| 2026-03-12 | Gap analysis panduan vs implementasi | ✅ Selesai |
| 2026-03-12 | Rekomendasi prioritas | ✅ Selesai |

---

## 9. CATATAN PENTING

### **Untuk AI Model Lain**

Jika melanjutkan pekerjaan ini:

1. **Baca file ini** + `panduan_membangun_hr.md` + `hr-menu-language-preference.md`
2. **Ikuti prioritas** yang sudah ditetapkan (Prioritas 1 → 2 → 3 → 4)
3. **Jaga boundary** HR read-only vs absensi
4. **Semua menu Bahasa Indonesia**
5. **Catat setiap perubahan** ke memory file
6. **Jangan sentuh** domain yang masih ditunda (section 32.34)

### **Prinsip Desain**

```
1. Fokus HR tenant dulu, baru admin HR
2. Matangkan production existing, baru tambah fitur baru
3. Tunda ATS, ESS, Performance, Training sampai fondasi stabil
4. Jaga boundary dengan domain absensi (HR baca, tidak ubah)
5. Sidebar tetap sempit dan fokus (8 group utama)
```

---

**File Terkait:**
- `.qwen/memory/context/hr-menu-language-preference.md`
- `.qwen/memory/context/audit-relasi-absensi-hr-2026-03-12.md`
- `docs/panduan_membangun_hr.md`

**Next Steps:**
Pilih satu task dari Prioritas 1 untuk mulai dikerjakan.
