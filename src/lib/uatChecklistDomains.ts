export type UatDomain = "absensi" | "hr" | "payroll";

export const UAT_DOMAIN_LABELS: Record<UatDomain, string> = {
  absensi: "Absensi",
  hr: "HR",
  payroll: "Payroll",
};

export const UAT_DOMAIN_SUBDOMAIN_SUGGESTIONS: Record<UatDomain, string[]> = {
  absensi: [
    "Platform Publik & Auth",
    "Operasional Tenant",
    "Mobile & Attendance Core",
    "Release & Observability",
  ],
  hr: [
    "Tata Kelola Tenant",
    "Manajemen Karyawan",
    "Manajemen Kehadiran",
    "Cuti & Izin",
    "Manajemen Kinerja",
    "ESS",
    "Training / Skill / Sertifikasi",
    "ATS",
    "Helpdesk / Audit",
  ],
  payroll: [
    "Gate & Readiness",
    "Policy & Period",
    "Komponen Payroll",
    "Variable Input",
    "Run Engine",
    "Approval",
    "Slip & Payment",
    "Tax & Report",
    "Roles & Audit",
  ],
};

export const UAT_DOMAIN_DEFAULT_MARKDOWN: Record<UatDomain, string> = {
  absensi: "",
  hr: `# Checklist UAT Domain HR AbsensiKu

Dokumen runtime ini dipakai sebagai baseline UAT khusus domain HR.

## Log Update yang Sudah Diuji
Gunakan format ringkas ini setiap kali ada update yang benar-benar sudah diuji:

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|

## 1. Tata Kelola Tenant HR
Status seksi: \`Belum diuji\` | Prioritas default: \`P0\` | Metode umum: \`Manual, Otomatis, Remote production\`
- [ ] Workspace HR tenant termuat normal sesuai mode akses. \`Status: Belum diuji | Prioritas: P0\`
- [ ] Read only vs editable mengikuti policy tenant HR. \`Status: Belum diuji | Prioritas: P0\`

## 2. Manajemen Karyawan HR
Status seksi: \`Belum diuji\` | Prioritas default: \`P0\` | Metode umum: \`Manual, Otomatis, Remote production\`
- [ ] Daftar karyawan HR menampilkan data inti tanpa error. \`Status: Belum diuji | Prioritas: P0\`
- [ ] Aksi create/edit karyawan mengikuti guard dan validasi yang benar. \`Status: Belum diuji | Prioritas: P0\`

## 3. Kehadiran dan Cuti HR
Status seksi: \`Belum diuji\` | Prioritas default: \`P1\` | Metode umum: \`Manual, Otomatis\`
- [ ] Halaman kehadiran HR menampilkan insight dan filter yang benar. \`Status: Belum diuji | Prioritas: P1\`
- [ ] Cuti dan izin HR mengikuti rule persetujuan yang aktif. \`Status: Belum diuji | Prioritas: P1\`

## 4. Kinerja, ESS, dan ATS
Status seksi: \`Belum diuji\` | Prioritas default: \`P1\` | Metode umum: \`Manual, Otomatis\`
- [ ] Modul kinerja dan ESS HR dapat diakses sesuai mode tenant. \`Status: Belum diuji | Prioritas: P1\`
- [ ] ATS HR menampilkan data dan guard route sesuai policy. \`Status: Belum diuji | Prioritas: P1\`

## 5. Audit, Helpdesk, dan Observability HR
Status seksi: \`Belum diuji\` | Prioritas default: \`P0\` | Metode umum: \`Manual, Otomatis, Remote Supabase\`
- [ ] Audit HR mencatat aksi penting lintas tenant. \`Status: Belum diuji | Prioritas: P0\`
- [ ] Error log HR menyertakan referensi yang dapat ditelusuri. \`Status: Belum diuji | Prioritas: P0\`
`,
  payroll: `# Checklist UAT Domain Payroll AbsensiKu

Dokumen runtime ini dipakai sebagai baseline UAT khusus domain Payroll.

## Log Update yang Sudah Diuji
Gunakan format ringkas ini setiap kali ada update yang benar-benar sudah diuji:

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|

## 1. Gate dan Readiness Payroll
Status seksi: \`Belum diuji\` | Prioritas default: \`P0\` | Metode umum: \`Manual, Otomatis, Remote production\`
- [ ] Tenant yang belum memenuhi readiness tidak bisa membuka Payroll penuh. \`Status: Belum diuji | Prioritas: P0\`
- [ ] Banner mode akses Payroll menampilkan CTA yang benar. \`Status: Belum diuji | Prioritas: P0\`

## 2. Policy, Period, dan Komponen Payroll
Status seksi: \`Belum diuji\` | Prioritas default: \`P0\` | Metode umum: \`Manual, Otomatis, Remote Supabase\`
- [ ] Policy dan period Payroll termuat tanpa error schema. \`Status: Belum diuji | Prioritas: P0\`
- [ ] Komponen penghasilan dan potongan dapat dibaca sesuai mode akses. \`Status: Belum diuji | Prioritas: P0\`

## 3. Run Engine, Approval, dan Slip
Status seksi: \`Belum diuji\` | Prioritas default: \`P0\` | Metode umum: \`Manual, Otomatis, Remote production\`
- [ ] Variable input dan run engine dapat dibuka sesuai guard. \`Status: Belum diuji | Prioritas: P0\`
- [ ] Approval, slip, dan payment Payroll mengikuti status langganan tenant. \`Status: Belum diuji | Prioritas: P0\`

## 4. Tax, Report, dan Audit Payroll
Status seksi: \`Belum diuji\` | Prioritas default: \`P1\` | Metode umum: \`Manual, Otomatis, Remote Supabase\`
- [ ] Tax compliance dan report Payroll menampilkan data yang konsisten. \`Status: Belum diuji | Prioritas: P1\`
- [ ] Audit dan error log Payroll menyertakan trace yang bisa ditindaklanjuti. \`Status: Belum diuji | Prioritas: P0\`
`,
};
