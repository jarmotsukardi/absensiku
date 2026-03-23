import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { getHrRoutePolicy } from "@/lib/hrRouteAccess";
import { getHrRouteStatusBadgeLabel, getHrRouteStatusDescription } from "@/lib/hrRouteStatusPresentation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type PriorityGroup = "lifecycle" | "attendance_policy" | "leave_policy" | "performance_training" | "ess";

type PriorityConfig = {
  title: string;
  domain: string;
  group: PriorityGroup;
  description: string;
  checklist: string[];
  links: Array<{ label: string; path: string }>;
};

type SummaryCounters = {
  employees: number;
  activeEmployees: number;
  invitationsPending: number;
  workHours: number;
  leavePending: number;
  leaveApproved: number;
};

type OperationalBlock = {
  title: string;
  description: string;
  items: Array<{
    label: string;
    value: string;
    note: string;
  }>;
};

type SourceReferenceBlock = {
  title: string;
  description: string;
  items: Array<{
    label: string;
    note: string;
    href?: string;
    hrefLabel?: string;
  }>;
};

type ExecutionNoticeBlock = {
  title: string;
  description: string;
  ctaLabel: string;
  ctaPath: string;
};

type OperationalRouteBlock = {
  title: string;
  description: string;
  items: Array<{
    label: string;
    path: string;
    note: string;
    metric?: string;
    priorityLabel?: string;
    emphasis?: "primary" | "secondary";
  }>;
};

type DecisionGuideBlock = {
  title: string;
  description: string;
  items: Array<{
    condition: string;
    actionLabel: string;
    actionPath: string;
    note: string;
  }>;
};

type RecommendedAction = {
  label: string;
  note: string;
  path: string;
  urgency: "tinggi" | "sedang" | "rendah";
  summary: string;
};

const CHECKLIST_STORAGE_KEY = "org_hr_priority_checklist_v1";
const AUTO_REFRESH_STORAGE_KEY = "org_hr_priority_auto_refresh_v1";
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const ROUTE_CONFIG: Record<string, PriorityConfig> = {
  "/org/hr/employee-status": {
    title: "Status Kepegawaian",
    domain: "Manajemen Karyawan",
    group: "lifecycle",
    description: "Kelola status aktif/nonaktif pegawai sebagai basis lifecycle karyawan.",
    checklist: [
      "Status pegawai terstandar (aktif, nonaktif, masa transisi)",
      "Alur perubahan status terdokumentasi",
      "Relasi status dengan kontrak dan akses sistem",
    ],
    links: [
      { label: "Data Karyawan", path: "/org/hr/employees" },
      { label: "Kontrak Kerja", path: "/org/hr/contracts" },
      { label: "Data Pegawai", path: "/org/hr/employees" },
    ],
  },
  "/org/hr/job-history": {
    title: "Riwayat Jabatan",
    domain: "Manajemen Karyawan",
    group: "lifecycle",
    description: "Lacak mutasi, promosi, dan perubahan jabatan pegawai secara historis.",
    checklist: [
      "Riwayat perubahan jabatan tersimpan per pegawai",
      "Tanggal efektif perubahan tervalidasi",
      "Dokumen pendukung perubahan terlampir",
    ],
    links: [
      { label: "Data Karyawan", path: "/org/hr/employees" },
      { label: "Struktur Organisasi", path: "/org/hr/structure" },
      { label: "Jabatan & Grade", path: "/org/hr/position-grade" },
    ],
  },
  "/org/hr/onboarding": {
    title: "Proses Masuk Pegawai",
    domain: "Manajemen Karyawan",
    group: "lifecycle",
    description: "Kelola pipeline onboarding pegawai baru dari kandidat hingga aktivasi.",
    checklist: [
      "Undangan onboarding terbit otomatis dari status kandidat hired",
      "Checklist onboarding terpantau per pegawai",
      "Aktivasi akses pegawai tervalidasi",
    ],
    links: [
      { label: "Kandidat ATS", path: "/org/hr/recruitment/candidates" },
      { label: "Data Karyawan", path: "/org/hr/employees" },
      { label: "Tiket HR", path: "/org/hr/help/tickets" },
    ],
  },
  "/org/hr/offboarding": {
    title: "Proses Keluar Pegawai",
    domain: "Manajemen Karyawan",
    group: "lifecycle",
    description: "Kelola proses offboarding agar penonaktifan pegawai tetap terdokumentasi.",
    checklist: [
      "Proses serah terima aset tercatat",
      "Akses sistem pegawai dinonaktifkan terkontrol",
      "Dokumen akhir offboarding tersimpan",
    ],
    links: [
      { label: "Data Pegawai", path: "/org/hr/employees" },
      { label: "Dokumen HR", path: "/org/hr/documents" },
      { label: "Pengaturan HR", path: "/org/hr/settings" },
    ],
  },
  "/org/hr/work-hours": {
    title: "Jam Kerja",
    domain: "Absensi & Kehadiran",
    group: "attendance_policy",
    description: "Atur baseline jam kerja untuk perhitungan kehadiran dan keterlambatan.",
    checklist: [
      "Templat jam kerja tersedia sesuai unit",
      "Aturan toleransi keterlambatan ditetapkan",
      "Sinkronisasi jam kerja ke dashboard kehadiran",
    ],
    links: [
      { label: "Pola Shift", path: "/org/hr/shifts" },
      { label: "Laporan HR", path: "/org/hr/reports" },
      { label: "Tiket HR", path: "/org/hr/help/tickets" },
    ],
  },
  "/org/hr/shifts": {
    title: "Pola Shift",
    domain: "Absensi & Kehadiran",
    group: "attendance_policy",
    description: "Kelola pola shift agar distribusi jam kerja per tim konsisten.",
    checklist: [
      "Pola shift harian/mingguan tervalidasi",
      "Rotasi shift terdokumentasi",
      "Konflik shift terdeteksi dini",
    ],
    links: [
      { label: "Jam Kerja", path: "/org/hr/work-hours" },
      { label: "Pengaturan Keterlambatan", path: "/org/hr/late-settings" },
      { label: "Laporan HR", path: "/org/hr/reports" },
    ],
  },
  "/org/hr/late-settings": {
    title: "Pengaturan Keterlambatan",
    domain: "Absensi & Kehadiran",
    group: "attendance_policy",
    description: "Atur aturan keterlambatan agar penilaian kehadiran konsisten lintas unit.",
    checklist: [
      "Batas keterlambatan per kebijakan ditetapkan",
      "Skema eskalasi keterlambatan tersedia",
      "Dampak aturan terlihat pada rekap",
    ],
    links: [
      { label: "Jam Kerja", path: "/org/hr/work-hours" },
      { label: "Pola Shift", path: "/org/hr/shifts" },
      { label: "Laporan HR", path: "/org/hr/reports" },
    ],
  },
  "/org/hr/attendance-integrations": {
    title: "Integrasi Absensi",
    domain: "Absensi & Kehadiran",
    group: "attendance_policy",
    description: "Kelola integrasi sumber absensi (device/GPS) agar data kehadiran stabil.",
    checklist: [
      "Sumber data absensi terdaftar",
      "Fallback saat integrasi gagal tersedia",
      "Log error integrasi termonitor",
    ],
    links: [
      { label: "Laporan HR", path: "/org/hr/reports" },
      { label: "FAQ HR", path: "/org/hr/help/faq" },
      { label: "Tiket HR", path: "/org/hr/help/tickets" },
    ],
  },
  "/org/hr/leave-types": {
    title: "Jenis Cuti",
    domain: "Cuti & Izin",
    group: "leave_policy",
    description: "Definisikan kategori cuti/izin untuk standar operasional HR.",
    checklist: [
      "Jenis cuti/izin terstandar",
      "Persyaratan dokumen per jenis jelas",
      "Jenis cuti terhubung ke kuota",
    ],
    links: [
      { label: "Laporan HR", path: "/org/hr/reports" },
      { label: "Pengaturan HR", path: "/org/hr/settings" },
      { label: "Tiket HR", path: "/org/hr/help/tickets" },
    ],
  },
  "/org/hr/leave-quota": {
    title: "Kuota Cuti",
    domain: "Cuti & Izin",
    group: "leave_policy",
    description: "Kelola kuota cuti agar saldo dan pemakaian tetap terkontrol.",
    checklist: [
      "Kuota per pegawai/kelompok tersedia",
      "Carry-over dan kadaluarsa ditetapkan",
      "Validasi pemotongan saldo otomatis",
    ],
    links: [
      { label: "Laporan HR", path: "/org/hr/reports" },
      { label: "Pengaturan HR", path: "/org/hr/settings" },
      { label: "Tiket HR", path: "/org/hr/help/tickets" },
    ],
  },
  "/org/hr/leave-approval": {
    title: "Alur Persetujuan Cuti",
    domain: "Cuti & Izin",
    group: "leave_policy",
    description: "Atur alur persetujuan cuti agar SLA persetujuan dapat dipantau.",
    checklist: [
      "Hierarki penyetuju terdefinisi",
      "SLA persetujuan terukur",
      "Eskalasi persetujuan tersedia",
    ],
    links: [
      { label: "Pengaturan HR", path: "/org/hr/settings" },
      { label: "Laporan HR", path: "/org/hr/reports" },
      { label: "Tiket HR", path: "/org/hr/help/tickets" },
    ],
  },
  "/org/hr/mutation-approval": {
    title: "Persetujuan Mutasi",
    domain: "Manajemen Karyawan",
    group: "lifecycle",
    description: "Proses pengajuan mutasi dan perubahan data pegawai dari perspektif HR.",
    checklist: [
      "Usulan mutasi tervalidasi terhadap struktur dan jabatan aktif",
      "Keputusan persetujuan atau penolakan terdokumentasi",
      "Dampak mutasi ke lifecycle pegawai ditinjau",
    ],
    links: [
      { label: "Riwayat Jabatan", path: "/org/hr/job-history" },
      { label: "Struktur Organisasi", path: "/org/hr/structure" },
      { label: "Proses Keluar Pegawai", path: "/org/hr/offboarding" },
    ],
  },
  "/org/hr/leave-validity": {
    title: "Masa Berlaku Cuti",
    domain: "Cuti & Izin",
    group: "leave_policy",
    description: "Tetapkan masa berlaku kuota cuti dan aturan carry-over tahunan.",
    checklist: [
      "Aturan kadaluarsa kuota ditetapkan",
      "Skema carry-over tahunan terdokumentasi",
      "Peringatan sebelum kuota hangus tersedia",
    ],
    links: [
      { label: "Laporan HR", path: "/org/hr/reports" },
      { label: "Pengaturan HR", path: "/org/hr/settings" },
      { label: "FAQ HR", path: "/org/hr/help/faq" },
    ],
  },
  "/org/hr/kpi": {
    title: "KPI",
    domain: "Manajemen Kinerja",
    group: "performance_training",
    description: "Konfigurasi KPI sebagai dasar evaluasi kinerja pegawai.",
    checklist: [
      "KPI inti tiap fungsi terdokumentasi",
      "Bobot KPI tervalidasi",
      "KPI terhubung ke periode penilaian",
    ],
    links: [
      { label: "Periode Penilaian", path: "/org/hr/performance-periods" },
      { label: "Form Penilaian", path: "/org/hr/performance-forms" },
      { label: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
    ],
  },
  "/org/hr/performance-periods": {
    title: "Periode Penilaian",
    domain: "Manajemen Kinerja",
    group: "performance_training",
    description: "Kelola periode evaluasi agar siklus penilaian berjalan tertib.",
    checklist: [
      "Periode aktif terjadwal",
      "Tanggal mulai/akhir tervalidasi",
      "Status periode terdokumentasi",
    ],
    links: [
      { label: "KPI", path: "/org/hr/kpi" },
      { label: "Form Penilaian", path: "/org/hr/performance-forms" },
      { label: "Ulasan 360", path: "/org/hr/review-360" },
    ],
  },
  "/org/hr/performance-forms": {
    title: "Form Penilaian",
    domain: "Manajemen Kinerja",
    group: "performance_training",
    description: "Bangun template form penilaian yang konsisten lintas tim.",
    checklist: [
      "Templat pertanyaan sesuai level jabatan",
      "Skala penilaian konsisten",
      "Wajib isi/kondisional tervalidasi",
    ],
    links: [
      { label: "KPI", path: "/org/hr/kpi" },
      { label: "Periode Penilaian", path: "/org/hr/performance-periods" },
      { label: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
    ],
  },
  "/org/hr/review-360": {
    title: "Ulasan 360",
    domain: "Manajemen Kinerja",
    group: "performance_training",
    description: "Konfigurasi evaluasi multi-penilai untuk memperkaya hasil performa.",
    checklist: [
      "Pemetaan reviewer lintas relasi lengkap",
      "Kerahasiaan penilaian terjaga",
      "Rekap feedback siap ditindaklanjuti",
    ],
    links: [
      { label: "Form Penilaian", path: "/org/hr/performance-forms" },
      { label: "Periode Penilaian", path: "/org/hr/performance-periods" },
      { label: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
    ],
  },
  "/org/hr/evaluation-results": {
    title: "Hasil Evaluasi",
    domain: "Manajemen Kinerja",
    group: "performance_training",
    description: "Pantau hasil evaluasi untuk keputusan pengembangan SDM.",
    checklist: [
      "Hasil evaluasi terdokumentasi per periode",
      "Rekomendasi tindak lanjut tersedia",
      "Aksi pengembangan terhubung ke training",
    ],
    links: [
      { label: "KPI", path: "/org/hr/kpi" },
      { label: "Data Pelatihan", path: "/org/hr/training-data" },
      { label: "Sertifikasi", path: "/org/hr/certifications" },
    ],
  },
  "/org/hr/training-data": {
    title: "Data Pelatihan",
    domain: "Pelatihan & Pengembangan",
    group: "performance_training",
    description: "Kelola program training internal untuk peningkatan kompetensi.",
    checklist: [
      "Program training terdaftar",
      "Peserta dan progres tercatat",
      "Hasil training terhubung ke evaluasi",
    ],
    links: [
      { label: "Sertifikasi", path: "/org/hr/certifications" },
      { label: "Matriks Kompetensi", path: "/org/hr/skill-matrix" },
      { label: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
    ],
  },
  "/org/hr/certifications": {
    title: "Sertifikasi",
    domain: "Pelatihan & Pengembangan",
    group: "performance_training",
    description: "Pantau kepemilikan dan masa berlaku sertifikasi pegawai.",
    checklist: [
      "Data sertifikasi pegawai lengkap",
      "Pengingat masa berlaku aktif",
      "Kebutuhan perpanjangan termonitor",
    ],
    links: [
      { label: "Data Pelatihan", path: "/org/hr/training-data" },
      { label: "Matriks Kompetensi", path: "/org/hr/skill-matrix" },
      { label: "Notifikasi", path: "/org/hr/notifications" },
    ],
  },
  "/org/hr/skill-matrix": {
    title: "Matriks Kompetensi",
    domain: "Pelatihan & Pengembangan",
    group: "performance_training",
    description: "Peta kompetensi tim untuk identifikasi gap keterampilan.",
    checklist: [
      "Matriks skill per fungsi tersedia",
      "Gap kompetensi teridentifikasi",
      "Rencana pengembangan terhubung ke training",
    ],
    links: [
      { label: "Data Pelatihan", path: "/org/hr/training-data" },
      { label: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
      { label: "Data Karyawan", path: "/org/hr/employees" },
    ],
  },
  "/org/hr/ess/requests": {
    title: "Pengajuan Saya",
    domain: "ESS",
    group: "ess",
    description: "Portal pengajuan mandiri karyawan untuk kebutuhan HR harian.",
    checklist: [
      "Daftar pengajuan aktif tersedia",
      "Status persetujuan real-time",
      "Riwayat pengajuan terdokumentasi",
    ],
    links: [
      { label: "Cuti & Izin Saya", path: "/org/hr/ess/leave-requests" },
      { label: "WFH Pegawai", path: "/org/hr/ess/wfh-requests" },
      { label: "Lembur Pegawai", path: "/org/hr/ess/overtime-requests" },
      { label: "Kehadiran Saya", path: "/org/hr/ess/attendance" },
      { label: "Profil Saya", path: "/org/hr/ess/profile" },
    ],
  },
  "/org/hr/ess/leave-requests": {
    title: "Cuti dan Izin Saya",
    domain: "ESS",
    group: "ess",
    description: "Pengajuan cuti/izin mandiri pegawai dengan pelacakan status.",
    checklist: [
      "Pengajuan cuti/izin tersubmit dari ESS",
      "Status persetujuan terlihat jelas",
      "Saldo cuti pribadi terupdate",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Jenis Cuti", path: "/org/hr/leave-types" },
      { label: "Kuota Cuti", path: "/org/hr/leave-quota" },
    ],
  },
  "/org/hr/ess/wfh-requests": {
    title: "WFH Pegawai",
    domain: "ESS",
    group: "ess",
    description: "Persetujuan pengajuan kerja dari rumah dari kanal pegawai dalam konteks HR.",
    checklist: [
      "Request WFH yang menunggu terlihat",
      "Keputusan persetujuan tercatat dengan jelas",
      "Alasan dan tanggal pengajuan mudah ditinjau",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Jam Kerja", path: "/org/hr/work-hours" },
      { label: "Analitik Kehadiran HR", path: "/org/hr/attendance-insights" },
    ],
  },
  "/org/hr/ess/flexible-attendance": {
    title: "Absensi Khusus",
    domain: "ESS",
    group: "ess",
    description: "Persetujuan pengajuan absensi fleksibel atau non-standar dari pegawai.",
    checklist: [
      "Permohonan absensi khusus dapat ditinjau per alasan",
      "Status persetujuan dan penolakan terlihat jelas",
      "Kebijakan kehadiran tetap menjadi rujukan utama",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Jam Kerja", path: "/org/hr/work-hours" },
      { label: "Pengaturan Keterlambatan", path: "/org/hr/late-settings" },
    ],
  },
  "/org/hr/ess/overtime-requests": {
    title: "Lembur Pegawai",
    domain: "ESS",
    group: "ess",
    description: "Persetujuan pengajuan lembur pegawai dari kanal self-service.",
    checklist: [
      "Nomor pengajuan dan total jam lembur terlihat",
      "Antrean persetujuan lembur dapat diproses dari HR",
      "Riwayat lembur tenant tetap tercatat di engine yang sama",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Pengaturan Lembur", path: "/org/schedule/overtime" },
      { label: "Laporan HR", path: "/org/hr/reports" },
    ],
  },
  "/org/hr/ess/attendance": {
    title: "Kehadiran Saya",
    domain: "ESS",
    group: "ess",
    description: "Ringkasan kehadiran personal dan pengajuan koreksi absensi.",
    checklist: [
      "Riwayat hadir harian tampil",
      "Anomali absensi dapat diajukan koreksi",
      "Keterlambatan/lembur terlihat per periode",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Jam Kerja", path: "/org/hr/work-hours" },
      { label: "Laporan HR", path: "/org/hr/reports" },
    ],
  },
  "/org/hr/ess/documents": {
    title: "Dokumen Saya",
    domain: "ESS",
    group: "ess",
    description: "Akses dokumen personal karyawan dalam satu tempat.",
    checklist: [
      "Dokumen personal tersedia aman",
      "Status tanda tangan termonitor",
      "Riwayat unduh/akses terdokumentasi",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Dokumen HR", path: "/org/hr/documents" },
      { label: "Pengaturan HR", path: "/org/hr/settings" },
    ],
  },
  "/org/hr/ess/profile": {
    title: "Profil Saya",
    domain: "ESS",
    group: "ess",
    description: "Kelola data profil pribadi dan informasi kontak darurat.",
    checklist: [
      "Data personal tervalidasi",
      "Kontak darurat terisi",
      "Riwayat perubahan profil tersimpan",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Dokumen Saya", path: "/org/hr/ess/documents" },
      { label: "Tiket HR", path: "/org/hr/help/tickets" },
    ],
  },
};

const initialSummaryCounters: SummaryCounters = {
  employees: 0,
  activeEmployees: 0,
  invitationsPending: 0,
  workHours: 0,
  leavePending: 0,
  leaveApproved: 0,
};

function groupBadgeLabel(group: PriorityGroup): string {
  if (group === "lifecycle") return "Prioritas 1 • Siklus Kerja Pegawai";
  if (group === "attendance_policy") return "Prioritas 2 • Kehadiran";
  if (group === "leave_policy") return "Prioritas 3 • Cuti";
  if (group === "performance_training") return "Prioritas 4 • Kinerja & Pelatihan";
  return "Prioritas 5 • ESS";
}

function buildOperationalBlock(pathname: string, summary: SummaryCounters): OperationalBlock | null {
  if (pathname === "/org/hr/onboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    return {
      title: "Status Kerja Minimum Onboarding",
      description: "Halaman ini belum menjadi alur kerja final, tetapi sinyal operasionalnya sudah bisa dipantau dari undangan proses masuk, kandidat ATS, dan kesiapan aktivasi pegawai.",
      items: [
        {
          label: "Undangan proses masuk",
          value: `${summary.invitationsPending} menunggu`,
          note: "Ambil dari pipeline `employee_invitations` yang belum dipakai.",
        },
        {
          label: "Aktivasi pegawai",
          value: `${summary.activeEmployees} aktif`,
          note: "Pegawai aktif menjadi indikator hasil akhir onboarding yang sudah selesai.",
        },
        {
          label: "Pegawai belum aktif",
          value: `${inactiveEmployees}`,
          note: "Perlu dipisahkan dari kasus offboarding agar follow-up onboarding tidak tercampur.",
        },
      ],
    };
  }

  if (pathname === "/org/hr/offboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    return {
      title: "Status Kerja Minimum Offboarding",
      description: "Halaman ini belum menjadi alur kerja final, tetapi sinyal operasionalnya sudah bisa dipantau dari pegawai nonaktif, dokumen HR, dan kebutuhan penonaktifan akses.",
      items: [
        {
          label: "Pegawai nonaktif",
          value: `${inactiveEmployees}`,
          note: "Menjadi backlog utama untuk penutupan lifecycle, arsip, dan tindak lanjut akses.",
        },
        {
          label: "Pegawai aktif",
          value: `${summary.activeEmployees}`,
          note: "Menjadi pembanding agar kasus offboarding tidak tertukar dengan tenaga kerja aktif.",
        },
        {
          label: "Dokumen akhir",
          value: "diarsipkan lewat Dokumen HR",
          note: "Belum ada area kerja final; gunakan dokumen HR dan data pegawai nonaktif sebagai kontrol minimum.",
        },
      ],
    };
  }

  return null;
}

function buildSourceReferenceBlock(pathname: string): SourceReferenceBlock | null {
  if (pathname === "/org/hr/onboarding") {
    return {
      title: "Sumber Data Saat Ini",
      description: "Gunakan halaman ini untuk memantau transisi. Eksekusi operasional utama masih tersebar di halaman sumber data berikut.",
      items: [
        {
          label: "employee_invitations",
          note: "Menjadi sumber utama undangan proses masuk yang belum dipakai atau masih menunggu.",
          href: "/org/invitations",
          hrefLabel: "Buka Undangan Pegawai",
        },
        {
          label: "Kandidat ATS",
          note: "Konversi kandidat diterima ke proses masuk masih terjadi dari alur kandidat, bukan dari halaman proses masuk final.",
          href: "/org/hr/recruitment/candidates",
          hrefLabel: "Buka Kandidat ATS",
        },
        {
          label: "employees",
          note: "Aktivasi akhir tetap tercermin di data pegawai aktif setelah onboarding selesai.",
          href: "/org/hr/employees",
          hrefLabel: "Buka Data Pegawai",
        },
      ],
    };
  }

  if (pathname === "/org/hr/offboarding") {
    return {
      title: "Sumber Data Saat Ini",
      description: "Gunakan halaman ini untuk memantau transisi. Eksekusi operasional utama proses keluar masih harus merujuk ke data pegawai, arsip, dan kontrol akses yang terpisah.",
      items: [
        {
          label: "employees.is_active = false",
          note: "Pegawai nonaktif menjadi sinyal paling nyata bahwa kasus offboarding perlu ditindaklanjuti.",
          href: "/org/employees/inactive",
          hrefLabel: "Buka Pegawai Nonaktif",
        },
        {
          label: "Dokumen HR",
          note: "Dokumen akhir, surat terminasi, dan arsip manual masih dikendalikan dari repository dokumen HR.",
          href: "/org/hr/documents",
          hrefLabel: "Buka Dokumen HR",
        },
        {
          label: "Pengaturan dan tiket HR",
          note: "Kasus penonaktifan akses dan koordinasi lintas unit masih perlu dicatat dari pengaturan HR atau tiket HR.",
          href: "/org/hr/help/tickets",
          hrefLabel: "Buka Tiket HR",
        },
      ],
    };
  }

  return null;
}

function buildExecutionNoticeBlock(pathname: string): ExecutionNoticeBlock | null {
  if (pathname === "/org/hr/onboarding") {
    return {
      title: "Pemantauan Transisi, Bukan Pusat Eksekusi",
      description:
        "Gunakan halaman ini untuk membaca kesiapan proses masuk. Eksekusi utama tetap dilakukan dari undangan pegawai, kandidat ATS, dan tindak lanjut aktivasi di data pegawai.",
      ctaLabel: "Buka Undangan Pegawai",
      ctaPath: "/org/invitations",
    };
  }

  if (pathname === "/org/hr/offboarding") {
    return {
      title: "Pemantauan Transisi, Bukan Pusat Eksekusi",
      description:
        "Gunakan halaman ini untuk membaca backlog proses keluar. Eksekusi utama tetap dilakukan dari pegawai nonaktif, arsip dokumen, dan koordinasi tindak lanjut akses.",
      ctaLabel: "Buka Pegawai Nonaktif",
      ctaPath: "/org/employees/inactive",
    };
  }

  return null;
}

function buildOperationalRouteBlock(pathname: string, summary: SummaryCounters): OperationalRouteBlock | null {
  if (pathname === "/org/hr/onboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    return {
      title: "Halaman Operasional Utama",
      description: "Gunakan halaman berikut untuk eksekusi kerja proses masuk yang nyata. Halaman HR ini hanya menjadi lapisan pemantauan transisi.",
      items: [
        {
          label: "Undangan Pegawai",
          path: "/org/invitations",
          note: "Tempat utama menerbitkan, memantau, dan menindaklanjuti undangan onboarding.",
          metric: `${summary.invitationsPending} menunggu`,
          priorityLabel: "Buka lebih dulu",
          emphasis: "primary",
        },
        {
          label: "Kandidat ATS",
          path: "/org/hr/recruitment/candidates",
          note: "Gunakan saat konversi kandidat diterima ke proses masuk masih dilakukan dari alur rekrutmen.",
          priorityLabel: "Rujukan kedua",
          emphasis: "secondary",
        },
        {
          label: "Data Pegawai",
          path: "/org/hr/employees",
          note: "Gunakan untuk verifikasi hasil akhir aktivasi dan follow-up pegawai yang sudah masuk sistem.",
          metric: `${inactiveEmployees} belum aktif/transisi`,
          priorityLabel: "Verifikasi hasil",
          emphasis: "secondary",
        },
      ],
    };
  }

  if (pathname === "/org/hr/offboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    return {
      title: "Halaman Operasional Utama",
      description: "Gunakan halaman berikut untuk eksekusi kerja proses keluar yang nyata. Halaman HR ini hanya menjadi lapisan pemantauan transisi.",
      items: [
        {
          label: "Pegawai Nonaktif",
          path: "/org/employees/inactive",
          note: "Tempat utama membaca backlog penonaktifan pegawai dan memastikan kasus offboarding tidak tercecer.",
          metric: `${inactiveEmployees} backlog`,
          priorityLabel: "Buka lebih dulu",
          emphasis: "primary",
        },
        {
          label: "Dokumen HR",
          path: "/org/hr/documents",
          note: "Gunakan untuk arsip dokumen akhir, surat terminasi, dan jejak administrasi manual.",
          priorityLabel: "Arsip administrasi",
          emphasis: "secondary",
        },
        {
          label: "Tiket HR",
          path: "/org/hr/help/tickets",
          note: "Gunakan untuk koordinasi lintas unit jika ada akses, aset, atau persetujuan yang belum tuntas.",
          metric: `${summary.activeEmployees} pegawai aktif`,
          priorityLabel: "Koordinasi lanjutan",
          emphasis: "secondary",
        },
      ],
    };
  }

  return null;
}

function buildDecisionGuideBlock(pathname: string, summary: SummaryCounters): DecisionGuideBlock | null {
  if (pathname === "/org/hr/onboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    return {
      title: "Panduan Keputusan Cepat",
      description: "Gunakan panduan ini untuk menentukan rute eksekusi tanpa membaca seluruh halaman terlebih dahulu.",
      items: [
        {
          condition: `Jika masih ada ${summary.invitationsPending} undangan menunggu atau calon pegawai belum menerima akses`,
          actionLabel: "Buka Undangan Pegawai",
          actionPath: "/org/invitations",
          note: "Ini tetap menjadi titik kerja utama untuk follow-up onboarding awal.",
        },
        {
          condition: "Jika kandidat hired belum dikonversi ke onboarding",
          actionLabel: "Buka Kandidat ATS",
          actionPath: "/org/hr/recruitment/candidates",
          note: "Gunakan rute ini selama konversi onboarding masih bergantung pada flow ATS.",
        },
        {
          condition: `Jika perlu mengecek hasil akhir aktivasi atau ${inactiveEmployees} pegawai masih transisi`,
          actionLabel: "Buka Data Pegawai",
          actionPath: "/org/hr/employees",
          note: "Gunakan untuk verifikasi akhir bahwa pegawai benar-benar masuk ke sistem HR aktif.",
        },
      ],
    };
  }

  if (pathname === "/org/hr/offboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    return {
      title: "Panduan Keputusan Cepat",
      description: "Gunakan panduan ini untuk menentukan rute eksekusi tanpa membaca seluruh halaman terlebih dahulu.",
      items: [
        {
          condition: `Jika ada ${inactiveEmployees} backlog pegawai nonaktif yang perlu dipastikan tidak tercecer`,
          actionLabel: "Buka Pegawai Nonaktif",
          actionPath: "/org/employees/inactive",
          note: "Ini tetap menjadi titik kerja utama untuk membaca backlog offboarding saat ini.",
        },
        {
          condition: "Jika dokumen akhir, surat terminasi, atau arsip administrasi perlu dilengkapi",
          actionLabel: "Buka Dokumen HR",
          actionPath: "/org/hr/documents",
          note: "Gunakan rute ini untuk kontrol administrasi akhir sebelum kasus dianggap selesai.",
        },
        {
          condition: "Jika penutupan akses, aset, atau koordinasi lintas unit masih menggantung",
          actionLabel: "Buka Tiket HR",
          actionPath: "/org/hr/help/tickets",
          note: "Gunakan tiket untuk memastikan tindak lanjut tidak hilang di luar halaman monitoring.",
        },
      ],
    };
  }

  return null;
}

function buildRecommendedAction(pathname: string, summary: SummaryCounters): RecommendedAction | null {
  if (pathname === "/org/hr/onboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    if (summary.invitationsPending > 0) {
      return {
        label: "Prioritaskan Undangan Pegawai",
        note: `${summary.invitationsPending} undangan masih menunggu. Selesaikan ini lebih dulu sebelum mengejar verifikasi akhir proses masuk.`,
        path: "/org/invitations",
        urgency: "tinggi",
        summary: "Fokus hari ini: masih ada undangan onboarding yang belum selesai.",
      };
    }
    if (inactiveEmployees > 0) {
      return {
        label: "Verifikasi Data Pegawai",
        note: `${inactiveEmployees} pegawai masih terlihat sebagai transisi/belum aktif. Pastikan hasil akhir aktivasi sudah benar.`,
        path: "/org/hr/employees",
        urgency: "sedang",
        summary: "Fokus hari ini: verifikasi hasil aktivasi dan status transisi pegawai.",
      };
    }
    return {
      label: "Periksa Kandidat ATS",
      note: "Tidak ada undangan menunggu yang menonjol. Pastikan tidak ada kandidat diterima yang belum dikonversi ke proses masuk.",
      path: "/org/hr/recruitment/candidates",
      urgency: "rendah",
      summary: "Fokus hari ini: cek pipeline kandidat agar tidak ada proses masuk yang tertahan di ATS.",
    };
  }

  if (pathname === "/org/hr/offboarding") {
    const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
    if (inactiveEmployees > 0) {
      return {
        label: "Prioritaskan Pegawai Nonaktif",
        note: `${inactiveEmployees} backlog nonaktif perlu dipastikan tidak tercecer sebelum arsip dan koordinasi lanjutan ditutup.`,
        path: "/org/employees/inactive",
        urgency: "tinggi",
        summary: "Fokus hari ini: backlog pegawai nonaktif masih perlu ditutup dengan rapi.",
      };
    }
    return {
      label: "Periksa Dokumen HR",
      note: "Backlog nonaktif tidak menonjol. Pastikan arsip administrasi akhir dan dokumen terminasi tetap lengkap.",
      path: "/org/hr/documents",
      urgency: "rendah",
      summary: "Fokus hari ini: pastikan arsip administrasi akhir tetap lengkap.",
    };
  }

  return null;
}

function getUrgencyLabel(urgency: RecommendedAction["urgency"]): string {
  if (urgency === "tinggi") return "Urgensi Tinggi";
  if (urgency === "sedang") return "Urgensi Sedang";
  return "Urgensi Rendah";
}

function getUrgencyCardClassName(urgency: RecommendedAction["urgency"]): string {
  if (urgency === "tinggi") return "border-rose-300 bg-rose-50/70";
  if (urgency === "sedang") return "border-amber-300 bg-amber-50/70";
  return "border-emerald-300 bg-emerald-50/70";
}

function getSummaryFreshness(lastUpdatedAt: Date | null): {
  label: string;
  tone: "fresh" | "stale" | "unknown";
} {
  if (!lastUpdatedAt) {
    return { label: "Belum dimuat", tone: "unknown" };
  }

  const diffMs = Date.now() - lastUpdatedAt.getTime();
  if (diffMs >= 5 * 60 * 1000) {
    return { label: "Perlu refresh", tone: "stale" };
  }

  return { label: "Masih segar", tone: "fresh" };
}

function getSummaryFreshnessBadgeClassName(tone: "fresh" | "stale" | "unknown"): string {
  if (tone === "fresh") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (tone === "stale") return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function formatLastUpdatedRelative(lastUpdatedAt: Date | null): string {
  if (!lastUpdatedAt) return "belum dimuat";

  const diffMs = Date.now() - lastUpdatedAt.getTime();
  const diffSeconds = Math.max(Math.floor(diffMs / 1000), 0);
  if (diffSeconds < 15) return "baru saja";
  if (diffSeconds < 60) return `${diffSeconds} detik lalu`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} hari lalu`;
}

function formatTimeUntilNextRefresh(nextAutoRefreshAt: Date | null): string {
  if (!nextAutoRefreshAt) return "-";

  const diffMs = nextAutoRefreshAt.getTime() - Date.now();
  if (diffMs <= 0) return "sebentar lagi";

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds} detik lagi`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  const remainingSeconds = diffSeconds % 60;
  return `${diffMinutes}m ${remainingSeconds}s lagi`;
}

export default function OrgHRPriorityWorkspace() {
  const location = useLocation();
  const config = ROUTE_CONFIG[location.pathname];
  const routePolicy = getHrRoutePolicy(location.pathname);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<SummaryCounters>(initialSummaryCounters);
  const [lastSummaryUpdatedAt, setLastSummaryUpdatedAt] = useState<Date | null>(null);
  const [freshnessTick, setFreshnessTick] = useState(0);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(false);
  const [nextAutoRefreshAt, setNextAutoRefreshAt] = useState<Date | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(() => document.visibilityState === "visible");
  const [lastRefreshErrorRef, setLastRefreshErrorRef] = useState<string | null>(null);
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const { access, isLoading: isLoadingAccess } = useHrPageAccess(location.pathname);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    const key = `${CHECKLIST_STORAGE_KEY}:${location.pathname}`;
    try {
      const raw = localStorage.getItem(key);
      setCheckedMap(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setCheckedMap({});
    }
  }, [config, location.pathname]);

  useEffect(() => {
    if (!config) return;
    const key = `${AUTO_REFRESH_STORAGE_KEY}:${location.pathname}`;
    try {
      setIsAutoRefreshEnabled(localStorage.getItem(key) === "true");
    } catch {
      setIsAutoRefreshEnabled(false);
    }
  }, [config, location.pathname]);

  const persistChecklist = (next: Record<string, boolean>) => {
    const key = `${CHECKLIST_STORAGE_KEY}:${location.pathname}`;
    setCheckedMap(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Ignore storage failure.
    }
  };

  const persistAutoRefresh = (next: boolean) => {
    const key = `${AUTO_REFRESH_STORAGE_KEY}:${location.pathname}`;
    setIsAutoRefreshEnabled(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // Ignore storage failure.
    }
  };

  const checklistProgress = useMemo(() => {
    if (!config) return { done: 0, total: 0 };
    const done = config.checklist.filter((item) => checkedMap[item]).length;
    return { done, total: config.checklist.length };
  }, [checkedMap, config]);

  const loadSummary = useCallback(
    async (cancelledRef?: { current: boolean }) => {
      setIsLoadingSummary(true);
      try {
        const resolvedTenantId = tenantId || (await resolveOrgTenantId());
        if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
        if (!tenantId) setTenantId(resolvedTenantId);

        const [employeesRes, activeEmployeesRes, invitationsRes, workHoursRes, leavePendingRes, leaveApprovedRes] =
          await Promise.all([
            supabase.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", resolvedTenantId),
            supabase
              .from("employees")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", resolvedTenantId)
              .neq("is_active", false),
            supabase
              .from("employee_invitations")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", resolvedTenantId)
              .eq("status", "pending")
              .eq("is_used", false),
            supabase.from("work_hours").select("id", { count: "exact", head: true }).eq("tenant_id", resolvedTenantId),
            supabase
              .from("leave_requests")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", resolvedTenantId)
              .eq("status", "pending"),
            supabase
              .from("leave_requests")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", resolvedTenantId)
              .eq("status", "approved"),
          ]);

        const queryError =
          employeesRes.error ||
          activeEmployeesRes.error ||
          invitationsRes.error ||
          workHoursRes.error ||
          leavePendingRes.error ||
          leaveApprovedRes.error;
        if (queryError) throw queryError;

        if (cancelledRef?.current) return;
        setSummary({
          employees: employeesRes.count ?? 0,
          activeEmployees: activeEmployeesRes.count ?? 0,
          invitationsPending: invitationsRes.count ?? 0,
          workHours: workHoursRes.count ?? 0,
          leavePending: leavePendingRes.count ?? 0,
          leaveApproved: leaveApprovedRes.count ?? 0,
        });
        const refreshedAt = new Date();
        setLastSummaryUpdatedAt(refreshedAt);
        setLastRefreshErrorRef(null);
        if (isAutoRefreshEnabled) {
          setNextAutoRefreshAt(new Date(refreshedAt.getTime() + AUTO_REFRESH_INTERVAL_MS));
        } else {
          setNextAutoRefreshAt(null);
        }
      } catch (error) {
        const ref = reportError(error, "org.hr.priority_workspace.summary_fetch", {
          pathname: location.pathname,
        });
        if (!cancelledRef?.current) {
          setLastRefreshErrorRef(ref);
          toast.error(appendErrorReference("Gagal memuat ringkasan prioritas HR", ref));
          if (isAutoRefreshEnabled && isPageVisible) {
            setNextAutoRefreshAt(new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS));
          }
        }
      } finally {
        if (!cancelledRef?.current) setIsLoadingSummary(false);
      }
    },
    [isAutoRefreshEnabled, isPageVisible, location.pathname, tenantId],
  );

  useEffect(() => {
    if (!config) return;
    const cancelledRef = { current: false };

    void loadSummary(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [config, loadSummary]);

  useEffect(() => {
    if (!lastSummaryUpdatedAt) return;
    const timer = window.setInterval(() => {
      setFreshnessTick((value) => value + 1);
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [lastSummaryUpdatedAt]);

  useEffect(() => {
    if (!config || !isAutoRefreshEnabled || !isPageVisible) return;
    setNextAutoRefreshAt(new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS));
    const timer = window.setInterval(() => {
      void loadSummary();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [config, isAutoRefreshEnabled, isPageVisible, loadSummary]);

  useEffect(() => {
    if (isAutoRefreshEnabled) return;
    setNextAutoRefreshAt(null);
  }, [isAutoRefreshEnabled]);

  useEffect(() => {
    if (!isAutoRefreshEnabled) return;
    if (isPageVisible) {
      setNextAutoRefreshAt(new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS));
      if (lastSummaryUpdatedAt && Date.now() - lastSummaryUpdatedAt.getTime() >= AUTO_REFRESH_INTERVAL_MS) {
        void loadSummary();
      }
      return;
    }
    setNextAutoRefreshAt(null);
  }, [isAutoRefreshEnabled, isPageVisible, lastSummaryUpdatedAt, loadSummary]);

  if (!config) {
    return (
      <OrganizationLayout>
        <div className="space-y-2">
          <Badge variant="outline">Transisi HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Halaman Transisi Tidak Ditemukan</h1>
          <p className="text-sm text-muted-foreground">
            Rute ini belum masuk cakupan transisi internal HR. Gunakan menu HR utama di sidebar.
          </p>
        </div>
      </OrganizationLayout>
    );
  }

  const summaryCards = (() => {
    if (location.pathname === "/org/hr/onboarding") {
      const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
      return [
        { label: "Undangan Menunggu", value: summary.invitationsPending, note: "Pipeline onboarding dari undangan aktif" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Hasil akhir aktivasi onboarding" },
        { label: "Belum Aktif / Transisi", value: inactiveEmployees, note: "Butuh follow-up agar tidak menggantung" },
      ];
    }
    if (location.pathname === "/org/hr/offboarding") {
      const inactiveEmployees = Math.max(summary.employees - summary.activeEmployees, 0);
      return [
        { label: "Pegawai Nonaktif", value: inactiveEmployees, note: "Backlog utama offboarding" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Pembanding populasi aktif" },
        { label: "Total Pegawai", value: summary.employees, note: "Cakupan lifecycle saat ini" },
      ];
    }
    if (config.group === "lifecycle") {
      return [
        { label: "Total Pegawai", value: summary.employees, note: "Data pegawai tenant" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Status aktif saat ini" },
        { label: "Undangan Menunggu", value: summary.invitationsPending, note: "Pipeline onboarding" },
      ];
    }
    if (config.group === "attendance_policy") {
      return [
        { label: "Templat Jam Kerja", value: summary.workHours, note: "Baseline jam kerja" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Target kebijakan kehadiran" },
        { label: "Cuti Menunggu", value: summary.leavePending, note: "Dampak ke jadwal kehadiran" },
      ];
    }
    if (config.group === "leave_policy") {
      return [
        { label: "Cuti Menunggu", value: summary.leavePending, note: "Menunggu persetujuan" },
        { label: "Cuti Disetujui", value: summary.leaveApproved, note: "Sudah selesai persetujuan" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Basis kuota cuti" },
      ];
    }
    if (config.group === "performance_training") {
      return [
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Peserta evaluasi/training" },
        { label: "Undangan Menunggu", value: summary.invitationsPending, note: "Kesiapan onboarding talent baru" },
        { label: "Cuti Disetujui", value: summary.leaveApproved, note: "Konteks beban tim" },
      ];
    }
    return [
      { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Pengguna ESS aktif" },
      { label: "Cuti Menunggu", value: summary.leavePending, note: "Permintaan ESS berjalan" },
      { label: "Templat Jam Kerja", value: summary.workHours, note: "Dasar kehadiran ESS" },
    ];
  })();
  const operationalBlock = buildOperationalBlock(location.pathname, summary);
  const sourceReferenceBlock = buildSourceReferenceBlock(location.pathname);
  const executionNoticeBlock = buildExecutionNoticeBlock(location.pathname);
  const operationalRouteBlock = buildOperationalRouteBlock(location.pathname, summary);
  const decisionGuideBlock = buildDecisionGuideBlock(location.pathname, summary);
  const recommendedAction = buildRecommendedAction(location.pathname, summary);
  const summaryFreshness = getSummaryFreshness(lastSummaryUpdatedAt);
  const lastUpdatedRelative = formatLastUpdatedRelative(lastSummaryUpdatedAt);
  const nextAutoRefreshRelative = formatTimeUntilNextRefresh(nextAutoRefreshAt);
  const hasValidSummary = lastSummaryUpdatedAt !== null;
  const canRenderSummaryValues = isLoadingSummary || hasValidSummary;
  void freshnessTick;
  const nextActions = (() => {
    if (location.pathname === "/org/hr/onboarding") {
      return [
        "Gunakan kandidat ATS atau undangan pegawai untuk memastikan calon pegawai sudah punya jalur aktivasi yang jelas.",
        "Pantau undangan menunggu dan selesaikan tindak lanjut sebelum pegawai dipindahkan ke backlog umum.",
        "Gunakan tiket HR jika ada hambatan aktivasi akun, dokumen awal, atau koordinasi lintas tim.",
      ];
    }
    if (location.pathname === "/org/hr/offboarding") {
      return [
        "Gunakan tab pegawai nonaktif sebagai backlog awal untuk memastikan kasus offboarding tidak tercecer.",
        "Arsipkan dokumen akhir dan catat kebutuhan serah terima sebelum penutupan akses dianggap selesai.",
        "Gunakan pengaturan HR dan tiket HR untuk kasus yang masih butuh kontrol akses atau koordinasi lintas unit.",
      ];
    }
    return [];
  })();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{groupBadgeLabel(config.group)}</Badge>
            <Badge variant="secondary">{getHrRouteStatusBadgeLabel(routePolicy.status)}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="text-sm text-muted-foreground">
            {config.description} Halaman ini dipertahankan untuk pemetaan prioritas internal, bukan sebagai halaman produksi utama.
          </p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "admin dapat kelola checklist transisi internal" : access.canView ? "pemantauan transisi baca saja" : "akses dibatasi"}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Terakhir diperbarui:{" "}
              {lastSummaryUpdatedAt
                ? lastSummaryUpdatedAt.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "belum dimuat"}
            </span>
            <span>({lastUpdatedRelative})</span>
            <span
              className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${getSummaryFreshnessBadgeClassName(summaryFreshness.tone)}`}
            >
              {summaryFreshness.label}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void loadSummary()}
              disabled={isLoadingSummary}
            >
              {isLoadingSummary ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Muat Ulang
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => persistAutoRefresh(!isAutoRefreshEnabled)}
            >
              {isAutoRefreshEnabled ? "Pembaruan otomatis aktif" : "Pembaruan otomatis mati"}
            </Button>
            {isAutoRefreshEnabled ? (
              <span>
                {isPageVisible ? `Muat ulang berikutnya: ${nextAutoRefreshRelative}` : "Pembaruan otomatis dijeda saat tab tidak aktif"}
              </span>
            ) : null}
          </div>
          {lastRefreshErrorRef ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-rose-700">
              <span>
                {hasValidSummary
                  ? `Muat ulang terakhir gagal. Halaman masih menampilkan ringkasan terakhir yang berhasil dimuat. Ref: ${lastRefreshErrorRef}`
                  : `Muat ulang terakhir gagal dan belum ada ringkasan valid yang berhasil dimuat. Ref: ${lastRefreshErrorRef}`}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                onClick={() => void loadSummary()}
                disabled={isLoadingSummary}
              >
                {isLoadingSummary ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
                Coba muat ulang lagi
              </Button>
            </div>
          ) : null}
          {hasValidSummary && summaryFreshness.tone === "stale" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700">
              <span>Data monitoring sudah mulai usang. Muat ulang disarankan sebelum Anda membuka rute sumber untuk mengambil keputusan.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                onClick={() => void loadSummary()}
                disabled={isLoadingSummary}
              >
                {isLoadingSummary ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
                Muat ulang sekarang
              </Button>
            </div>
          ) : null}
          {hasValidSummary && recommendedAction ? (
            <p className="text-xs text-muted-foreground">
              {isLoadingSummary ? "Menyusun fokus tindakan harian..." : recommendedAction.summary}
            </p>
          ) : null}
          {hasValidSummary && recommendedAction ? (
            <div className={`rounded-md border p-3 text-sm ${getUrgencyCardClassName(recommendedAction.urgency)}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{recommendedAction.label}</p>
                <Badge variant="secondary">{getUrgencyLabel(recommendedAction.urgency)}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{isLoadingSummary ? "Menyusun rekomendasi tindakan..." : recommendedAction.note}</p>
              <OrgHRContextLink
                to={recommendedAction.path}
                className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Buka rute yang direkomendasikan
              </OrgHRContextLink>
            </div>
          ) : null}
          {operationalRouteBlock ? (
            <div className="flex flex-wrap gap-2 pt-2">
              {operationalRouteBlock.items.map((item) => (
                <OrgHRContextLink
                  key={`quick-${item.path}`}
                  to={item.path}
                  className={`inline-flex rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40 ${
                    item.emphasis === "primary" ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <span>{item.label}</span>
                  {hasValidSummary && item.metric ? <span className="ml-2 text-xs text-muted-foreground">{item.metric}</span> : null}
                </OrgHRContextLink>
              ))}
            </div>
          ) : null}
        </div>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{getHrRouteStatusDescription(routePolicy.status)}</p>
          </CardContent>
        </Card>

        {executionNoticeBlock ? (
          <Card className="border-amber-300 bg-amber-50/60">
            <CardHeader>
              <CardTitle className="text-base">{executionNoticeBlock.title}</CardTitle>
              <CardDescription className="text-foreground/80">{executionNoticeBlock.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <OrgHRContextLink
                to={executionNoticeBlock.ctaPath}
                className="inline-flex rounded-md border border-amber-400 bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-amber-100"
              >
                {executionNoticeBlock.ctaLabel}
              </OrgHRContextLink>
            </CardContent>
          </Card>
        ) : null}

        {!isLoadingSummary && !hasValidSummary ? (
          <Card className="border-rose-300 bg-rose-50/40">
            <CardHeader>
              <CardTitle>Ringkasan Belum Tersedia</CardTitle>
              <CardDescription>
                Area kerja internal ini belum memiliki ringkasan valid yang berhasil dimuat. Gunakan muat ulang atau buka halaman sumber operasional
                untuk verifikasi manual.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                onClick={() => void loadSummary()}
                disabled={isLoadingSummary}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Coba muat ulang lagi
              </Button>
              {sourceReferenceBlock?.items
                .filter((item) => item.href && item.hrefLabel)
                .slice(0, 2)
                .map((item) => (
                  <OrgHRContextLink
                    key={`fallback-source-${item.label}`}
                    to={item.href!}
                    className="inline-flex rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40"
                  >
                    {item.hrefLabel}
                  </OrgHRContextLink>
                ))}
            </CardContent>
          </Card>
        ) : null}

        {canRenderSummaryValues ? (
          <section className="grid gap-3 md:grid-cols-3">
            {summaryCards.map((item) => (
              <Card key={item.label}>
                <CardHeader className="pb-2">
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="text-2xl">{isLoadingSummary ? "..." : item.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        {canRenderSummaryValues && operationalBlock ? (
          <Card>
            <CardHeader>
              <CardTitle>{operationalBlock.title}</CardTitle>
              <CardDescription>{operationalBlock.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {operationalBlock.items.map((item) => (
                <div key={item.label} className="rounded-md border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold">{isLoadingSummary ? "..." : item.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {sourceReferenceBlock ? (
          <Card>
            <CardHeader>
              <CardTitle>{sourceReferenceBlock.title}</CardTitle>
              <CardDescription>{sourceReferenceBlock.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sourceReferenceBlock.items.map((item) => (
                <div key={item.label} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                  {item.href && item.hrefLabel ? (
                    <OrgHRContextLink
                      to={item.href}
                      className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {item.hrefLabel}
                    </OrgHRContextLink>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {operationalRouteBlock ? (
          <Card>
            <CardHeader>
              <CardTitle>{operationalRouteBlock.title}</CardTitle>
              <CardDescription>{operationalRouteBlock.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {operationalRouteBlock.items.map((item) => (
                <OrgHRContextLink
                  key={item.path}
                  to={item.path}
                  className={`rounded-md border p-4 transition-colors hover:bg-muted/40 ${
                    item.emphasis === "primary" ? "border-primary/40 bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.priorityLabel ? (
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.priorityLabel}</p>
                      ) : null}
                    </div>
                    {hasValidSummary && item.metric ? <span className="text-xs text-muted-foreground">{item.metric}</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                </OrgHRContextLink>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {decisionGuideBlock ? (
          <Card>
            <CardHeader>
              <CardTitle>{decisionGuideBlock.title}</CardTitle>
              <CardDescription>{decisionGuideBlock.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {decisionGuideBlock.items.map((item) => (
                <div key={`${item.actionPath}-${item.condition}`} className="rounded-md border p-4">
                  <p className="text-sm font-medium">{item.condition}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                  <OrgHRContextLink
                    to={item.actionPath}
                    className="mt-3 inline-flex rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40"
                  >
                    {item.actionLabel}
                  </OrgHRContextLink>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Checklist Implementasi {config.domain}</CardTitle>
            <CardDescription>
              Progres modul prioritas per halaman. Selesai: {checklistProgress.done}/{checklistProgress.total}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.checklist.map((item) => {
              const checked = Boolean(checkedMap[item]);
              return (
                <label key={item} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={isLoadingAccess || !access.canEdit}
                    onCheckedChange={(value) => {
                      persistChecklist({
                        ...checkedMap,
                        [item]: Boolean(value),
                      });
                    }}
                  />
                  <span>{item}</span>
                </label>
              );
            })}
          </CardContent>
        </Card>

        {nextActions.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Langkah Operasional Minimum</CardTitle>
              <CardDescription>
                Gunakan alur ini untuk menjaga halaman internal tetap berguna sampai alur kerja final tersedia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {nextActions.map((item, index) => (
                <div key={item} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">Langkah {index + 1}</p>
                  <p className="mt-1 text-muted-foreground">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Relasi Modul</CardTitle>
            <CardDescription>Rujukan modul terkait untuk implementasi halaman ini.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {config.links.map((item) => (
              <OrgHRContextLink key={item.path} to={item.path} className="block rounded-md border p-3 text-sm transition-colors hover:bg-muted/40">
                {item.label}
              </OrgHRContextLink>
            ))}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
