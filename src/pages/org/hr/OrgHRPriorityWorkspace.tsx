import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
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

const CHECKLIST_STORAGE_KEY = "org_hr_priority_checklist_v1";

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
      { label: "Riwayat Jabatan", path: "/org/hr/job-history" },
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
    title: "Onboarding",
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
    title: "Offboarding",
    domain: "Manajemen Karyawan",
    group: "lifecycle",
    description: "Kelola proses offboarding agar penonaktifan pegawai tetap terdokumentasi.",
    checklist: [
      "Proses serah terima aset tercatat",
      "Akses sistem pegawai dinonaktifkan terkontrol",
      "Dokumen akhir offboarding tersimpan",
    ],
    links: [
      { label: "Status Kepegawaian", path: "/org/hr/employee-status" },
      { label: "Dokumen HR", path: "/org/hr/documents" },
      { label: "Audit Aktivitas", path: "/org/hr/activity-log" },
    ],
  },
  "/org/hr/work-hours": {
    title: "Jam Kerja",
    domain: "Absensi & Kehadiran",
    group: "attendance_policy",
    description: "Atur baseline jam kerja untuk perhitungan kehadiran dan keterlambatan.",
    checklist: [
      "Template jam kerja tersedia sesuai unit",
      "Aturan toleransi keterlambatan ditetapkan",
      "Sinkronisasi jam kerja ke dashboard kehadiran",
    ],
    links: [
      { label: "Shift", path: "/org/hr/shifts" },
      { label: "Analitik Kehadiran", path: "/org/hr/attendance-insights" },
      { label: "Rekap Absensi", path: "/org/hr/attendance-recap" },
    ],
  },
  "/org/hr/shifts": {
    title: "Shift",
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
      { label: "Rekap Absensi", path: "/org/hr/attendance-recap" },
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
      { label: "Shift", path: "/org/hr/shifts" },
      { label: "Analitik Kehadiran", path: "/org/hr/attendance-insights" },
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
      { label: "Analitik Kehadiran", path: "/org/hr/attendance-insights" },
      { label: "Log Error HR", path: "/org/hr/help/error-logs" },
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
      { label: "Kuota Cuti", path: "/org/hr/leave-quota" },
      { label: "Alur Persetujuan", path: "/org/hr/leave-approval" },
      { label: "Rekap Cuti", path: "/org/hr/leave-recap" },
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
      { label: "Jenis Cuti", path: "/org/hr/leave-types" },
      { label: "Masa Berlaku", path: "/org/hr/leave-validity" },
      { label: "Rekap Cuti", path: "/org/hr/leave-recap" },
    ],
  },
  "/org/hr/leave-approval": {
    title: "Alur Persetujuan Cuti",
    domain: "Cuti & Izin",
    group: "leave_policy",
    description: "Atur approval flow cuti agar SLA persetujuan dapat dipantau.",
    checklist: [
      "Hierarki approver terdefinisi",
      "SLA persetujuan terukur",
      "Eskalasi approval tersedia",
    ],
    links: [
      { label: "Kuota Cuti", path: "/org/hr/leave-quota" },
      { label: "Hierarki Persetujuan", path: "/org/hr/approval-hierarchy" },
      { label: "Rekap Cuti", path: "/org/hr/leave-recap" },
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
      { label: "Jenis Cuti", path: "/org/hr/leave-types" },
      { label: "Kuota Cuti", path: "/org/hr/leave-quota" },
      { label: "Notifikasi", path: "/org/hr/notifications" },
    ],
  },
  "/org/hr/kpi": {
    title: "KPI",
    domain: "Performance Management",
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
    domain: "Performance Management",
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
      { label: "360 Review", path: "/org/hr/review-360" },
    ],
  },
  "/org/hr/performance-forms": {
    title: "Form Penilaian",
    domain: "Performance Management",
    group: "performance_training",
    description: "Bangun template form penilaian yang konsisten lintas tim.",
    checklist: [
      "Template pertanyaan sesuai level jabatan",
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
    title: "360 Review",
    domain: "Performance Management",
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
    domain: "Performance Management",
    group: "performance_training",
    description: "Pantau hasil evaluasi untuk keputusan pengembangan SDM.",
    checklist: [
      "Hasil evaluasi terdokumentasi per periode",
      "Rekomendasi tindak lanjut tersedia",
      "Aksi pengembangan terhubung ke training",
    ],
    links: [
      { label: "KPI", path: "/org/hr/kpi" },
      { label: "Data Training", path: "/org/hr/training-data" },
      { label: "Sertifikasi", path: "/org/hr/certifications" },
    ],
  },
  "/org/hr/training-data": {
    title: "Data Training",
    domain: "Training & Development",
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
    domain: "Training & Development",
    group: "performance_training",
    description: "Pantau kepemilikan dan masa berlaku sertifikasi pegawai.",
    checklist: [
      "Data sertifikasi pegawai lengkap",
      "Pengingat masa berlaku aktif",
      "Kebutuhan perpanjangan termonitor",
    ],
    links: [
      { label: "Data Training", path: "/org/hr/training-data" },
      { label: "Matriks Kompetensi", path: "/org/hr/skill-matrix" },
      { label: "Notifikasi", path: "/org/hr/notifications" },
    ],
  },
  "/org/hr/skill-matrix": {
    title: "Matriks Kompetensi",
    domain: "Training & Development",
    group: "performance_training",
    description: "Peta kompetensi tim untuk identifikasi gap keterampilan.",
    checklist: [
      "Matriks skill per fungsi tersedia",
      "Gap kompetensi teridentifikasi",
      "Rencana pengembangan terhubung ke training",
    ],
    links: [
      { label: "Data Training", path: "/org/hr/training-data" },
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
      "Status approval real-time",
      "Riwayat pengajuan terdokumentasi",
    ],
    links: [
      { label: "Cuti & Izin Saya", path: "/org/hr/ess/leave-requests" },
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
      "Status approval terlihat jelas",
      "Saldo cuti pribadi terupdate",
    ],
    links: [
      { label: "Pengajuan Saya", path: "/org/hr/ess/requests" },
      { label: "Jenis Cuti", path: "/org/hr/leave-types" },
      { label: "Kuota Cuti", path: "/org/hr/leave-quota" },
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
      { label: "Analitik Kehadiran", path: "/org/hr/attendance-insights" },
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
      { label: "Digital Signature", path: "/org/hr/digital-signature" },
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
      { label: "Bantuan HR", path: "/org/hr/help/support" },
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
  if (group === "lifecycle") return "Prioritas 1 • Lifecycle";
  if (group === "attendance_policy") return "Prioritas 2 • Kehadiran";
  if (group === "leave_policy") return "Prioritas 3 • Cuti";
  if (group === "performance_training") return "Prioritas 4 • Performance & Training";
  return "Prioritas 5 • ESS";
}

export default function OrgHRPriorityWorkspace() {
  const location = useLocation();
  const config = ROUTE_CONFIG[location.pathname];
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<SummaryCounters>(initialSummaryCounters);
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});

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

  const persistChecklist = (next: Record<string, boolean>) => {
    const key = `${CHECKLIST_STORAGE_KEY}:${location.pathname}`;
    setCheckedMap(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Ignore storage failure.
    }
  };

  const checklistProgress = useMemo(() => {
    if (!config) return { done: 0, total: 0 };
    const done = config.checklist.filter((item) => checkedMap[item]).length;
    return { done, total: config.checklist.length };
  }, [checkedMap, config]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    const loadSummary = async () => {
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

        if (cancelled) return;
        setSummary({
          employees: employeesRes.count ?? 0,
          activeEmployees: activeEmployeesRes.count ?? 0,
          invitationsPending: invitationsRes.count ?? 0,
          workHours: workHoursRes.count ?? 0,
          leavePending: leavePendingRes.count ?? 0,
          leaveApproved: leaveApprovedRes.count ?? 0,
        });
      } catch (error) {
        const ref = reportError(error, "org.hr.priority_workspace.summary_fetch", {
          pathname: location.pathname,
        });
        if (!cancelled) {
          toast.error(appendErrorReference("Gagal memuat ringkasan prioritas HR", ref));
          setSummary(initialSummaryCounters);
        }
      } finally {
        if (!cancelled) setIsLoadingSummary(false);
      }
    };

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [config, location.pathname, tenantId]);

  if (!config) {
    return (
      <OrganizationLayout>
        <div className="space-y-2">
          <Badge variant="outline">HR Prioritas</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Halaman Prioritas Tidak Ditemukan</h1>
          <p className="text-sm text-muted-foreground">
            Route ini belum masuk cakupan prioritas 1-5. Gunakan menu HR lain di sidebar.
          </p>
        </div>
      </OrganizationLayout>
    );
  }

  const summaryCards = (() => {
    if (config.group === "lifecycle") {
      return [
        { label: "Total Pegawai", value: summary.employees, note: "Data pegawai tenant" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Status aktif saat ini" },
        { label: "Undangan Pending", value: summary.invitationsPending, note: "Pipeline onboarding" },
      ];
    }
    if (config.group === "attendance_policy") {
      return [
        { label: "Template Jam Kerja", value: summary.workHours, note: "Baseline jam kerja" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Target kebijakan kehadiran" },
        { label: "Cuti Pending", value: summary.leavePending, note: "Dampak ke jadwal kehadiran" },
      ];
    }
    if (config.group === "leave_policy") {
      return [
        { label: "Cuti Pending", value: summary.leavePending, note: "Menunggu approval" },
        { label: "Cuti Disetujui", value: summary.leaveApproved, note: "Sudah selesai approval" },
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Basis kuota cuti" },
      ];
    }
    if (config.group === "performance_training") {
      return [
        { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Peserta evaluasi/training" },
        { label: "Undangan Pending", value: summary.invitationsPending, note: "Kesiapan onboarding talent baru" },
        { label: "Cuti Disetujui", value: summary.leaveApproved, note: "Konteks beban tim" },
      ];
    }
    return [
      { label: "Pegawai Aktif", value: summary.activeEmployees, note: "Pengguna ESS aktif" },
      { label: "Cuti Pending", value: summary.leavePending, note: "Permintaan ESS berjalan" },
      { label: "Template Jam Kerja", value: summary.workHours, note: "Dasar kehadiran ESS" },
    ];
  })();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">{groupBadgeLabel(config.group)}</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>

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

        <Card>
          <CardHeader>
            <CardTitle>Relasi Modul</CardTitle>
            <CardDescription>Rujukan modul terkait untuk implementasi halaman ini.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {config.links.map((item) => (
              <div key={item.path} className="rounded-md border p-3 text-sm">
                {item.label}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
