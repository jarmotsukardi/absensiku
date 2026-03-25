# Analisis Menu Baru Berdasarkan Panduan

## Tanggal: 2026-03-12

### Ringkasan Eksekutif

Berdasarkan `docs/panduan_membangun_hr.md` (section 21, 29, 32), dokumen ini mengidentifikasi **menu baru yang disarankan** dan membandingkannya dengan **implementasi saat ini**.

**Kesimpulan Utama:**
- ✅ **Sidebar inti sudah sesuai** (8 group utama)
- ⚠️ **Beberapa menu disarankan ada di panduan, tapi belum/tidak ada di implementasi**
- 🔴 **Banyak menu yang "disembunyikan" di panduan, sudah ada di kode tapi internal**

---

## 1. MENU YANG DISARANKAN DI PANDUAN

### **A. Sidebar Inti HR (Section 21.1, 29.2, 32.2)**

**Yang Sudah Ada:**
```
✅ Ringkasan HR          → /org/hr
✅ Pegawai               → /org/hr/employees
✅ Organisasi            → /org/hr/structure
✅ Hubungan Kerja        → /org/hr/position-grade, /org/hr/contracts
✅ Dokumen               → /org/hr/documents
✅ Laporan               → /org/hr/reports
✅ Bantuan               → /org/hr/help/faq, /org/hr/help/tickets
✅ Pengaturan            → /org/hr/settings
```

**Yang Disarankan Tapi Belum Ada:**

| Menu | Route | Section Panduan | Status |
|------|-------|-----------------|--------|
| **Status Kepegawaian** | `/org/hr/employee-status` | 21.2, 29.3 | ⚠️ Redirect ke employees |
| **Riwayat Jabatan** | `/org/hr/job-history` | 21.2, 29.3 | ⚠️ Redirect ke employees |
| **Template Dokumen** | `/org/hr/document-templates` | 21.2, 29.3 | ⚠️ Redirect ke documents |
| **Approval Hierarchy** | `/org/hr/approval-hierarchy` | 29.3 | ⚠️ Redirect ke settings |

---

### **B. Submenu yang Disarankan per Group (Section 21.2, 29.3)**

#### **Group: Pegawai**

| Menu | Route | Status Panduan | Status Implementasi | Gap |
|------|-------|----------------|---------------------|-----|
| Data Pegawai | `/org/hr/employees` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Status Kepegawaian | `/org/hr/employee-status` | ✅ Tampil | ⚠️ Redirect | Seharusnya halaman terpisah |
| Riwayat Jabatan | `/org/hr/job-history` | ✅ Tampil | ⚠️ Redirect | Seharusnya halaman terpisah |

**Rekomendasi:**
- Buat halaman terpisah untuk `Status Kepegawaian` (filter by status: aktif, kontrak, magang, nonaktif)
- Buat halaman terpisah untuk `Riwayat Jabatan` (mutation history per pegawai)

---

#### **Group: Organisasi**

| Menu | Route | Status Panduan | Status Implementasi | Gap |
|------|-------|----------------|---------------------|-----|
| Struktur Organisasi | `/org/hr/structure` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Departemen | `/org/hr/departments` | ✅ Submenu | ⚠️ Redirect ke structure | Seharusnya tab/subsection |
| Divisi | `/org/hr/divisions` | ✅ Submenu | ⚠️ Redirect ke structure | Seharusnya tab/subsection |
| Lokasi Kerja | `/org/hr/work-locations` | ✅ Submenu | ⚠️ Redirect ke structure | Seharusnya tab/subsection |

**Rekomendasi:**
- Tidak perlu halaman terpisah
- Cukup tambah tab di `Struktur Organisasi` untuk masing-masing

---

#### **Group: Hubungan Kerja**

| Menu | Route | Status Panduan | Status Implementasi | Gap |
|------|-------|----------------|---------------------|-----|
| Jabatan dan Grade | `/org/hr/position-grade` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Kontrak Kerja | `/org/hr/contracts` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Approval Hierarchy | `/org/hr/approval-hierarchy` | ✅ Tampil | ⚠️ Redirect ke settings | **BELUM ADA HALAMAN** |

**Rekomendasi:**
- **PRIORITAS:** Buat halaman `Approval Hierarchy` untuk konfigurasi approver (cuti, WFH, lembur)

---

#### **Group: Dokumen**

| Menu | Route | Status Panduan | Status Implementasi | Gap |
|------|-------|----------------|---------------------|-----|
| Dokumen HR | `/org/hr/documents` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Template Dokumen | `/org/hr/document-templates` | ✅ Tampil Terbatas | ⚠️ Redirect ke documents | **BELUM ADA HALAMAN** |

**Rekomendasi:**
- Buat halaman `Template Dokumen` untuk template kontrak, surat peringatan, dll

---

#### **Group: Bantuan**

| Menu | Route | Status Panduan | Status Implementasi | Gap |
|------|-------|----------------|---------------------|-----|
| FAQ HR | `/org/hr/help/faq` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Bantuan HR | `/org/hr/help/support` | ✅ Tampil | ⚠️ Redirect ke tickets | Seharusnya subsection |
| Tiket HR | `/org/hr/help/tickets` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Log Error HR | `/org/hr/help/error-logs` | ✅ Tampil | ✅ Internal | Sesuai (internal) |

**Rekomendasi:**
- Tidak perlu halaman baru
- `Bantuan HR` bisa jadi subsection di `Tiket HR`

---

#### **Group: Pengaturan**

| Menu | Route | Status Panduan | Status Implementasi | Gap |
|------|-------|----------------|---------------------|-----|
| Pengaturan HR | `/org/hr/settings` | ✅ Tampil | ✅ Ada | Tidak ada gap |
| Users | `/org/hr/users` | ✅ Submenu | ⚠️ Redirect ke settings | Seharusnya tab |
| Roles | `/org/hr/roles` | ✅ Submenu | ⚠️ Redirect ke settings | Seharusnya tab |
| Permissions | `/org/hr/permissions` | ✅ Submenu | ⚠️ Redirect ke settings | Seharusnya tab |
| Approval Hierarchy | `/org/hr/approval-hierarchy` | ✅ Submenu | ⚠️ Redirect ke settings | **BELUM ADA** |
| Import/Export | `/org/hr/import-export` | ✅ Submenu | ⚠️ Redirect ke settings | Seharusnya tab |
| Backup | `/org/hr/backup` | ✅ Submenu | ⚠️ Redirect ke settings | Seharusnya tab |

**Rekomendasi:**
- **PRIORITAS:** Buat halaman `Approval Hierarchy`
- Tambah tab di `Pengaturan HR` untuk: Users, Roles, Permissions, Import/Export, Backup

---

## 2. MENU YANG DISEMBUNYIKAN (Section 21, 29.4, 29.5, 32.30)

### **A. Menu yang Disarankan "Sembunyikan" tapi Sudah Ada di Kode**

| Menu | Route | Status Panduan | Status Implementasi | Keterangan |
|------|-------|----------------|---------------------|------------|
| Onboarding | `/org/hr/onboarding` | Sembunyikan | ⚠️ Bridge/Internal | Sesuai (tunda) |
| Offboarding | `/org/hr/offboarding` | Sembunyikan | ⚠️ Bridge/Internal | Sesuai (tunda) |
| Shift | `/org/hr/shifts` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| National Holidays | `/org/hr/national-holidays` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Late Settings | `/org/hr/late-settings` | Sembunyikan | ⚠️ Bridge | Sesuai (tunda) |
| Leave Types | `/org/hr/leave-types` | Sembunyikan | ⚠️ Bridge | Sesuai (tunda) |
| Leave Quota | `/org/hr/leave-quota` | Sembunyikan | ⚠️ Bridge | Sesuai (tunda) |
| Leave Approval | `/org/hr/leave-approval` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Leave Validity | `/org/hr/leave-validity` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| KPI | `/org/hr/kpi` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Performance Periods | `/org/hr/performance-periods` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Performance Forms | `/org/hr/performance-forms` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Review 360 | `/org/hr/review-360` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Evaluation Results | `/org/hr/evaluation-results` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Training Data | `/org/hr/training-data` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Certifications | `/org/hr/certifications` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Skill Matrix | `/org/hr/skill-matrix` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| Recruitment Jobs | `/org/hr/recruitment/jobs` | Sembunyikan | ✅ Scaffold | Ada tapi scaffold |
| Recruitment Candidates | `/org/hr/recruitment/candidates` | Sembunyikan | ✅ Scaffold | Ada tapi scaffold |
| Recruitment Interviews | `/org/hr/recruitment/interviews` | Sembunyikan | ✅ Scaffold | Ada tapi scaffold |
| Recruitment Offers | `/org/hr/recruitment/offers` | Sembunyikan | ✅ Scaffold | Ada tapi scaffold |
| ESS Requests | `/org/hr/ess/requests` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| ESS Leave Requests | `/org/hr/ess/leave-requests` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| ESS Attendance | `/org/hr/ess/attendance` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| ESS Documents | `/org/hr/ess/documents` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |
| ESS Profile | `/org/hr/ess/profile` | Sembunyikan | ❌ Belum ada file | Route ada, file tidak |

**Total: 25+ route yang "disembunyikan" di panduan**

**Status:**
- ✅ **Sesuai panduan:** Onboarding, Offboarding, Late Settings, Leave Types, Leave Quota (bridge/internal)
- ⚠️ **Route ada di router, tapi file tidak ada:** 15+ route (Shift, KPI, Performance, Training, ESS, dll)
- ✅ **Ada tapi scaffold:** Recruitment (4 files)

---

### **B. Menu yang Disarankan "Gabungkan/Redirect"**

| Menu | Route | Arah Redirect | Status Implementasi |
|------|-------|---------------|---------------------|
| Company | `/org/hr/company` | → structure | ✅ Sudah redirect |
| Work Calendar | `/org/hr/work-calendar` | → structure | ✅ Sudah redirect |
| Attendance Recap | `/org/hr/attendance-recap` | → reports | ✅ Sudah redirect |
| Leave Recap | `/org/hr/leave-recap` | → reports | ✅ Sudah redirect |
| Notifications | `/org/hr/notifications` | → settings | ✅ Sudah redirect |
| Activity Log | `/org/hr/activity-log` | → settings | ✅ Sudah redirect |
| Branding | `/org/hr/branding` | → settings | ✅ Sudah redirect |
| General Settings | `/org/hr/general-settings` | → settings | ✅ Sudah redirect |

**Status: ✅ Semua sudah redirect (sesuai panduan)**

---

## 3. MENU BARU YANG PERLU DIBUAT

Berdasarkan gap analysis, berikut menu baru yang perlu dibuat:

### **Prioritas 1 - Halaman Terpisah (Disarankan di Panduan)**

| Menu | Route | File Baru | Estimasi | Output |
|------|-------|-----------|----------|--------|
| **Status Kepegawaian** | `/org/hr/employee-status` | `OrgHREmployeeStatus.tsx` | 60 menit | Filter by status (aktif, kontrak, magang, nonaktif) |
| **Riwayat Jabatan** | `/org/hr/job-history` | `OrgHRJobHistory.tsx` | 60 menit | Mutation history per pegawai, export |
| **Approval Hierarchy** | `/org/hr/approval-hierarchy` | `OrgHRApprovalHierarchy.tsx` | 90 menit | Konfigurasi approver (cuti, WFH, lembur), SLA |
| **Template Dokumen** | `/org/hr/document-templates` | `OrgHRDocumentTemplates.tsx` | 90 menit | Template kontrak, surat peringatan, HR letters |

---

### **Prioritas 2 - Tab di Halaman Existing**

| Halaman | Tab Baru | File | Estimasi |
|---------|----------|------|----------|
| **Struktur Organisasi** | Tab Departemen | Update `OrgHRStructure.tsx` | 30 menit |
| **Struktur Organisasi** | Tab Divisi | Update `OrgHRStructure.tsx` | 30 menit |
| **Struktur Organisasi** | Tab Lokasi Kerja | Update `OrgHRStructure.tsx` | 30 menit |
| **Pengaturan HR** | Tab Users | Update `OrgHRSettings.tsx` | 30 menit |
| **Pengaturan HR** | Tab Roles | Update `OrgHRSettings.tsx` | 30 menit |
| **Pengaturan HR** | Tab Permissions | Update `OrgHRSettings.tsx` | 30 menit |
| **Pengaturan HR** | Tab Import/Export | Update `OrgHRSettings.tsx` | 30 menit |
| **Pengaturan HR** | Tab Backup | Update `OrgHRSettings.tsx` | 30 menit |

---

### **Prioritas 3 - Menu Internal (Tunda Sesuai Panduan)**

**TIDAK PERLU DIBUAT SEKARANG** (section 32.34):

| Menu | Route | Alasan Tunda |
|------|-------|--------------|
| Shift Management | `/org/hr/shifts` | Boundary dengan absensi |
| Performance (KPI, 360 Review) | `/org/hr/kpi`, `/org/hr/performance-*` | Ditunda sampai fondasi stabil |
| Training & Certification | `/org/hr/training-*`, `/org/hr/certifications` | Ditunda sampai fondasi stabil |
| ESS Portal | `/org/hr/ess/*` | Ditunda sampai HR tenant matang |
| Leave Approval Workflow | `/org/hr/leave-approval` | Masih di domain leave |

---

## 4. REKOMENDASI STRUKTUR SIDEBAR

### **Struktur Ideal (Berdasarkan Panduan Section 29.3)**

```
HRIS → Workspace HR
│
├── Beranda
│   └── Ringkasan HR
│
├── Pegawai
│   ├── Data Pegawai
│   ├── Status Kepegawaian          [BARU]
│   └── Riwayat Jabatan             [BARU]
│
├── Organisasi
│   ├── Struktur Organisasi
│   │   ├── Departemen              [Tab]
│   │   ├── Divisi                  [Tab]
│   │   └── Lokasi Kerja            [Tab]
│
├── Hubungan Kerja
│   ├── Jabatan dan Grade
│   ├── Kontrak Kerja
│   └── Approval Hierarchy          [BARU - PRIORITAS]
│
├── Dokumen
│   ├── Dokumen HR
│   └── Template Dokumen            [BARU]
│
├── Laporan
│   └── Laporan HR
│
├── Bantuan
│   ├── FAQ HR
│   ├── Bantuan HR                  [Tab di Tiket]
│   ├── Tiket HR
│   └── Log Error HR                [Internal]
│
└── Pengaturan
    ├── Pengaturan HR
    │   ├── Users                   [Tab]
    │   ├── Roles                   [Tab]
    │   ├── Permissions             [Tab]
    │   ├── Approval Hierarchy      [Tab atau halaman terpisah]
    │   ├── Import/Export           [Tab]
    │   └── Backup                  [Tab]
```

---

## 5. CHECKLIST IMPLEMENTASI

### **Yang Sudah Sesuai Panduan**

- ✅ 8 group utama sidebar
- ✅ Route produksi minimum (9 routes)
- ✅ Route internal (attendance-insights, error-logs)
- ✅ Redirect route sekunder (departments → structure, dll)
- ✅ Guard route terpusat
- ✅ Capability halaman

### **Yang Perlu Ditambah**

#### **Prioritas 1: Halaman Baru**
- [ ] `OrgHREmployeeStatus.tsx` (Status Kepegawaian)
- [ ] `OrgHRJobHistory.tsx` (Riwayat Jabatan)
- [ ] `OrgHRApprovalHierarchy.tsx` (Approval Hierarchy) - **PRIORITAS**
- [ ] `OrgHRDocumentTemplates.tsx` (Template Dokumen)

#### **Prioritas 2: Tab di Halaman Existing**
- [ ] Struktur Organisasi → Tab Departemen, Divisi, Lokasi
- [ ] Pengaturan HR → Tab Users, Roles, Permissions, Import/Export, Backup

#### **Prioritas 3: Cleanup**
- [ ] Hapus file legacy yang tidak punya route aktif
- [ ] Update router untuk menu baru
- [ ] Update sidebar untuk menu baru

---

## 6. RIWAYAT ANALISIS

| Tanggal | Analisis | Status |
|---------|----------|--------|
| 2026-03-12 | Menu baru berdasarkan panduan | ✅ Selesai |

---

## 7. CATATAN PENTING

### **Untuk AI Model Lain**

Jika melanjutkan pekerjaan ini:

1. **Baca file ini** + `panduan_membangun_hr.md` + audit gap HR
2. **Ikuti prioritas**: Approval Hierarchy → Employee Status → Job History → Document Templates
3. **Jangan buat** menu internal/tunda (Shift, KPI, Performance, Training, ESS)
4. **Semua menu Bahasa Indonesia**
5. **Catat setiap perubahan** ke memory file

### **Prinsip Desain**

```
1. Sidebar tetap sempit (8 group utama)
2. Menu baru hanya jika benar-benar diperlukan
3. Tab lebih baik daripada halaman terpisah untuk submenu kecil
4. Approval Hierarchy adalah prioritas (disebut di banyak section panduan)
5. Template Dokumen penting untuk otomatisasi HR
```

---

**File Terkait:**
- `.qwen/memory/context/hr-menu-language-preference.md`
- `.qwen/memory/context/audit-gap-hr-2026-03-12.md`
- `docs/panduan_membangun_hr.md` (section 21, 29, 32)

**Next Steps:**
Pilih satu dari Prioritas 1 untuk mulai dikerjakan.
