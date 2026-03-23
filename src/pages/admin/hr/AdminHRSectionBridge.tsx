import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { getHrRoutePolicy } from "@/lib/hrRouteAccess";
import { toast } from "sonner";

type SectionConfig = {
  title: string;
  description: string;
  domain: string;
  checkpoints: string[];
  adminControls?: string[];
  orgTargets?: string[];
};

type OperationalPlaybook = {
  focus: string[];
  deliverables: string[];
  actions: Array<{ label: string; path: string }>;
};

type HrSectionKpi = {
  activeTenants: number;
  employees: number;
  contracts: number;
  hrCriticalErrors24h: number;
  ticketEvents24h: number;
};

type SectionOperationalMetric = {
  label: string;
  value: number;
  note: string;
};

type SectionOperationalRow = {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  tenantLabel: string;
  statusLabel: string;
  updatedAt: string | null;
  meta: string;
};

type TenantOption = {
  id: string;
  name: string;
  code: string;
};

const getOrgTargetStatusLabel = (path: string): string => {
  const policy = getHrRoutePolicy(path);
  if (policy.status === "redirect") return "Alias";
  if (policy.status === "internal") return "Internal";
  if (policy.status === "tunda") return "Tunda";
  return "Aktif";
};

const getOrgTargetStatusVariant = (path: string): "default" | "secondary" | "outline" => {
  const policy = getHrRoutePolicy(path);
  return policy.status === "tampil" ? "secondary" : "outline";
};

const SECTION_CONFIG: Record<string, SectionConfig> = {
  "status-absensi-hari-ini": {
    title: "Status Absensi Hari Ini",
    description: "Halaman mandiri HR super admin untuk pemantauan status kehadiran harian.",
    domain: "Ringkasan",
    checkpoints: ["Ringkasan status hadir harian", "Anomali keterlambatan", "Tindak lanjut operasional"],
    adminControls: ["/admin/hr", "/admin/hr/audit", "/admin/hr/error-logs"],
    orgTargets: ["/org/hr/attendance-insights", "/org/hr/attendance-recap"],
  },
  "notifikasi-sistem": {
    title: "Notifikasi Sistem",
    description: "Kontrol notifikasi HR lintas tenant pada area kerja super admin HR.",
    domain: "Ringkasan",
    checkpoints: ["Templat notifikasi HR", "Kanal notifikasi aktif", "Riwayat pengiriman notifikasi"],
    adminControls: ["/admin/hr/settings#alert-defaults", "/admin/hr/settings#alert-override"],
    orgTargets: ["/org/hr/notifications", "/org/hr/dashboard-notifications"],
  },
  "hari-libur-nasional": {
    title: "Hari Libur Nasional",
    description: "Halaman mandiri untuk kebijakan hari libur nasional pada konteks HR.",
    domain: "Manajemen Kehadiran",
    checkpoints: ["Daftar hari libur nasional", "Sinkronisasi kalender kerja", "Dampak ke rekap absensi"],
    adminControls: ["/admin/hr/policies", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/reports", "/org/hr/work-calendar"],
  },
  "pengaturan-keterlambatan": {
    title: "Pengaturan Keterlambatan",
    description: "Kontrol aturan keterlambatan untuk tenant HR.",
    domain: "Manajemen Kehadiran",
    checkpoints: ["Batas toleransi keterlambatan", "Aturan auto-flag", "Kebijakan eskalasi keterlambatan"],
    adminControls: ["/admin/hr/policies", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/late-settings"],
  },
  "integrasi-fingerprint-gps": {
    title: "Integrasi Fingerprint / GPS",
    description: "Konfigurasi integrasi perangkat absensi pada area kerja HR super admin.",
    domain: "Manajemen Kehadiran",
    checkpoints: ["Status integrasi perangkat", "Kanal fallback absensi", "Audit sinkronisasi data"],
    adminControls: ["/admin/hr/settings#workspace-tenant", "/admin/hr/error-logs"],
    orgTargets: ["/org/hr/attendance-integrations"],
  },
  "rekap-absensi": {
    title: "Rekap Absensi",
    description: "Ringkasan data kehadiran lintas tenant untuk pemantauan HR.",
    domain: "Manajemen Kehadiran",
    checkpoints: ["Rekap harian/mingguan", "Tren keterlambatan", "Kualitas data absensi"],
    adminControls: ["/admin/hr", "/admin/hr/audit"],
    orgTargets: ["/org/hr/attendance-recap", "/org/hr/reports"],
  },
  "struktur-organisasi": {
    title: "Struktur Organisasi",
    description: "Governance struktur organisasi lintas tenant HR.",
    domain: "Tata Kelola Tenant",
    checkpoints: ["Konsistensi hirarki organisasi", "Validasi relasi unit/divisi", "Pemantauan drift struktur tenant"],
    adminControls: ["/admin/hr/tenants", "/admin/hr/policies"],
    orgTargets: ["/org/hr/structure", "/org/hr/departments", "/org/hr/divisions"],
  },
  "struktur-unit-organisasi": {
    title: "Struktur & Unit Organisasi",
    description: "Kontrol terpadu untuk struktur organisasi, departemen, dan divisi lintas tenant.",
    domain: "Tata Kelola Tenant",
    checkpoints: ["Konsistensi hirarki organisasi", "Standardisasi departemen/divisi", "Audit drift struktur antar tenant"],
    adminControls: ["/admin/hr/tenants", "/admin/hr/policies", "/admin/hr/audit"],
    orgTargets: ["/org/hr/structure", "/org/hr/departments", "/org/hr/divisions"],
  },
  departemen: {
    title: "Departemen",
    description: "Kontrol acuan bawaan departemen untuk seluruh tenant HR.",
    domain: "Tata Kelola Tenant",
    checkpoints: ["Standardisasi master departemen", "Cek duplikasi departemen", "Kesesuaian pemetaan pegawai"],
    adminControls: ["/admin/hr/tenants", "/admin/hr/audit"],
    orgTargets: ["/org/hr/departments", "/org/hr/employees"],
  },
  divisi: {
    title: "Divisi",
    description: "Pengaturan domain divisi lintas tenant.",
    domain: "Tata Kelola Tenant",
    checkpoints: ["Konsistensi master divisi", "Relasi divisi ke departemen", "Dampak ke struktur jabatan"],
    adminControls: ["/admin/hr/tenants", "/admin/hr/policies"],
    orgTargets: ["/org/hr/divisions", "/org/hr/structure"],
  },
  jabatan: {
    title: "Jabatan",
    description: "Kontrol standar jabatan/grade untuk governance HR.",
    domain: "Tata Kelola Tenant",
    checkpoints: ["Standar level jabatan", "Keselarasan grade & posisi", "Audit perubahan jabatan"],
    adminControls: ["/admin/hr/policies", "/admin/hr/audit"],
    orgTargets: ["/org/hr/position-grade", "/org/hr/job-history"],
  },
  "jabatan-grade": {
    title: "Jabatan & Grade",
    description: "Standar jabatan, level, dan grade karyawan pada seluruh tenant.",
    domain: "Tata Kelola Tenant",
    checkpoints: ["Standar jabatan lintas tenant", "Keselarasan grade/level", "Audit perubahan jabatan dan promosi"],
    adminControls: ["/admin/hr/policies", "/admin/hr/audit"],
    orgTargets: ["/org/hr/position-grade", "/org/hr/job-history"],
  },
  "lokasi-kerja": {
    title: "Lokasi Kerja",
    description: "Acuan bawaan lokasi kerja tenant untuk modul HR.",
    domain: "Tata Kelola Tenant",
    checkpoints: ["Kelengkapan lokasi kerja", "Pemakaian lokasi pada absensi", "Konsistensi data geo"],
    adminControls: ["/admin/hr/tenants", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/work-locations", "/org/hr/attendance-integrations"],
  },
  "kalender-kerja": {
    title: "Kalender Kerja",
    description: "Kontrol kalender kerja global untuk operasional tenant HR.",
    domain: "Tenant Governance",
    checkpoints: ["Templat kalender kerja", "Sinkronisasi hari kerja", "Dampak ke cuti dan absensi"],
    adminControls: ["/admin/hr/policies", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/work-calendar", "/org/hr/reports"],
  },
  "lokasi-kalender-kerja": {
    title: "Lokasi & Kalender Kerja",
    description: "Kontrol lokasi kerja dan kalender operasional tenant dalam satu panel governance.",
    domain: "Tenant Governance",
    checkpoints: ["Kelengkapan lokasi kerja", "Templat kalender kerja", "Sinkronisasi hari libur dan aturan kehadiran"],
    adminControls: ["/admin/hr/tenants", "/admin/hr/policies", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/work-locations", "/org/hr/work-calendar", "/org/hr/reports"],
  },
  "cuti-izin-baseline": {
    title: "Cuti & Izin Acuan Bawaan",
    description: "Acuan bawaan kebijakan cuti dan izin di level super admin.",
    domain: "Kebijakan & Acuan Bawaan",
    checkpoints: ["Aturan jenis cuti", "Kuota dan masa berlaku", "Alur persetujuan tenant bawaan"],
    adminControls: ["/admin/hr/policies", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/leave-types", "/org/hr/leave-quota", "/org/hr/leave-approval"],
  },
  "kontrak-kerja-baseline": {
    title: "Kontrak Kerja Acuan Bawaan",
    description: "Standarisasi acuan bawaan kontrak kerja pada semua tenant HR.",
    domain: "Kebijakan & Acuan Bawaan",
    checkpoints: ["Masa berlaku kontrak", "Templat kontrak bawaan", "Pemantauan kontrak mendekati akhir"],
    adminControls: ["/admin/hr/policies", "/admin/hr/audit"],
    orgTargets: ["/org/hr/contracts", "/org/hr/contract-templates"],
  },
  "kpi-performance-baseline": {
    title: "KPI & Kinerja Acuan Bawaan",
    description: "Acuan bawaan pengaturan KPI dan evaluasi kinerja HR.",
    domain: "Kebijakan & Acuan Bawaan",
    checkpoints: ["Templat KPI bawaan", "Periode evaluasi", "Tata kelola ulasan 360"],
    adminControls: ["/admin/hr/policies", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/kpi", "/org/hr/performance-periods", "/org/hr/review-360"],
  },
  "analitik-cuti": {
    title: "Analitik Cuti",
    description: "Pemantauan analitik cuti lintas tenant untuk evaluasi kebijakan.",
    domain: "Pemantauan & Kepatuhan",
    checkpoints: ["Tren penggunaan cuti", "Deteksi anomali kuota", "Kesesuaian approval flow"],
    adminControls: ["/admin/hr/audit", "/admin/hr/error-logs"],
    orgTargets: ["/org/hr/leave-recap", "/org/hr/reports"],
  },
  "compliance-dokumen": {
    title: "Kepatuhan Dokumen",
    description: "Pengawasan kepatuhan dokumen ketenagakerjaan lintas tenant.",
    domain: "Pemantauan & Kepatuhan",
    checkpoints: ["Kelengkapan dokumen karyawan", "Validitas templat legal", "Audit dokumen kritikal"],
    adminControls: ["/admin/hr/audit", "/admin/hr/policies"],
    orgTargets: ["/org/hr/documents", "/org/hr/document-templates", "/org/hr/digital-signature"],
  },
  "sla-monitoring": {
    title: "Pemantauan SLA",
    description: "Pemantauan SLA penanganan isu HR pada tenant.",
    domain: "Operasional Dukungan",
    checkpoints: ["Waktu respon tiket", "Pelanggaran SLA kritikal", "Kapasitas tim dukungan HR"],
    adminControls: ["/admin/hr/help/tickets", "/admin/hr/audit", "/admin/hr/error-logs"],
    orgTargets: ["/org/hr/help/tickets", "/org/hr/help/support"],
  },
  "playbook-eskalasi": {
    title: "Panduan Eskalasi",
    description: "Panduan eskalasi standar untuk insiden dan tiket HR.",
    domain: "Operasional Dukungan",
    checkpoints: ["Matriks eskalasi prioritas", "Jalur komunikasi insiden", "Postmortem dan tindak lanjut"],
    adminControls: ["/admin/hr/help/support", "/admin/hr/help/tickets", "/admin/hr/settings#ticket-defaults"],
    orgTargets: ["/org/hr/help/support", "/org/hr/help/tickets"],
  },
  "pengaturan-bank": {
    title: "Pengaturan Bank",
    description: "Halaman mandiri pengaturan rekening organisasi untuk dukungan kebutuhan administratif HR.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Validasi rekening organisasi", "Kelengkapan data bank", "Audit perubahan data rekening"],
    adminControls: ["/admin/hr/settings", "/admin/hr/audit"],
    orgTargets: ["/org/hr/import-export", "/org/hr/settings"],
  },
  "rekrutmen-ats": {
    title: "Rekrutmen (ATS)",
    description: "Tata kelola super admin untuk modul rekrutmen HR berbasis pipeline.",
    domain: "Rekrutmen",
    checkpoints: ["Standar pipeline kandidat", "SLA tahapan seleksi", "Templat evaluasi wawancara"],
    adminControls: ["/admin/hr/policies", "/admin/hr/audit", "/admin/hr/settings#coverage-map"],
    orgTargets: [
      "/org/hr/recruitment/jobs",
      "/org/hr/recruitment/candidates",
      "/org/hr/recruitment/interviews",
      "/org/hr/recruitment/offers",
    ],
  },
  "layanan-mandiri-karyawan": {
    title: "Layanan Mandiri Karyawan (ESS)",
    description: "Kontrol acuan bawaan super admin untuk pengalaman layanan mandiri karyawan.",
    domain: "Layanan Mandiri Karyawan",
    checkpoints: ["Konsistensi alur pengajuan", "Kualitas data personal", "Audit interaksi ESS lintas tenant"],
    adminControls: ["/admin/hr/settings#workspace-tenant", "/admin/hr/audit", "/admin/hr/policies"],
    orgTargets: [
      "/org/hr/ess/requests",
      "/org/hr/ess/leave-requests",
      "/org/hr/ess/attendance",
      "/org/hr/ess/documents",
      "/org/hr/ess/profile",
    ],
  },
  "user-management": {
    title: "Manajemen Pengguna",
    description: "Kontrol manajemen pengguna khusus konteks HR super admin.",
    domain: "Manajemen Pengguna & Akses",
    checkpoints: ["Daftar user HR", "Status akses user", "Tinjau user lintas tenant"],
    adminControls: ["/admin/hr/tenants", "/admin/hr/audit"],
    orgTargets: ["/org/hr/users"],
  },
  "role-management": {
    title: "Manajemen Peran",
    description: "Halaman mandiri pengaturan peran pada area kerja HR.",
    domain: "Manajemen Pengguna & Akses",
    checkpoints: ["Daftar role aktif", "Matriks kewenangan", "Audit perubahan role"],
    adminControls: ["/admin/hr/settings#ticket-defaults", "/admin/hr/audit"],
    orgTargets: ["/org/hr/roles", "/org/hr/permissions"],
  },
  "permission-setting": {
    title: "Pengaturan Izin",
    description: "Kontrol izin granuler untuk modul HR.",
    domain: "Manajemen Pengguna & Akses",
    checkpoints: ["Cakupan izin per fitur", "Tinjauan akses kritikal", "Konsistensi peran-izin"],
    adminControls: ["/admin/hr/settings#ticket-defaults", "/admin/hr/audit"],
    orgTargets: ["/org/hr/permissions", "/org/hr/approval-hierarchy"],
  },
  "general-settings": {
    title: "Pengaturan Umum",
    description: "Pengaturan umum modul HR pada level super admin.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Area kerja bawaan tenant", "Kebijakan global HR", "Konfigurasi acuan bawaan tenant"],
    adminControls: ["/admin/hr/settings#workspace-default", "/admin/hr/settings#workspace-tenant"],
    orgTargets: ["/org/hr/general-settings"],
  },
  "branding-logo-warna": {
    title: "Branding (Logo, Warna)",
    description: "Konfigurasi branding yang dipakai pada pengalaman area kerja HR.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Logo & identitas visual", "Konsistensi tema HR", "Kebijakan branding tenant"],
    adminControls: ["/admin/hr/profile", "/admin/hr/settings#coverage-map"],
    orgTargets: ["/org/hr/branding"],
  },
  "email-configuration": {
    title: "Konfigurasi Email",
    description: "Pengaturan email untuk notifikasi modul HR.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Templat email HR", "Endpoint email", "Kesehatan pengiriman email"],
    adminControls: ["/admin/hr/settings#alert-defaults", "/admin/hr/settings#alert-override"],
    orgTargets: ["/org/hr/notifications"],
  },
  notifikasi: {
    title: "Notifikasi",
    description: "Halaman mandiri pengaturan notifikasi HR.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Rule notifikasi HR", "Target notifikasi", "Riwayat notifikasi tenant"],
    adminControls: ["/admin/hr/settings#alert-defaults", "/admin/hr/settings#alert-override"],
    orgTargets: ["/org/hr/notifications", "/org/hr/dashboard-notifications"],
  },
  "integrasi-api": {
    title: "Integrasi API",
    description: "Pengelolaan integrasi API lintas kebutuhan HR.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Endpoint integrasi aktif", "Validasi payload", "Pemantauan error integrasi"],
    adminControls: ["/admin/hr/settings#workspace-tenant", "/admin/hr/error-logs"],
    orgTargets: ["/org/hr/attendance-integrations"],
  },
  "backup-restore": {
    title: "Backup & Restore",
    description: "Kontrol backup/restore data untuk domain HR.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Jadwal backup HR", "Status restore drill", "Retensi data backup"],
    adminControls: ["/admin/hr/settings#coverage-map", "/admin/hr/audit"],
    orgTargets: ["/org/hr/backup"],
  },
  "import-export-data": {
    title: "Impor / Ekspor Data",
    description: "Pusat kontrol impor/ekspor data HR lintas tenant.",
    domain: "Pengaturan Sistem",
    checkpoints: ["Templat impor aktif", "Validasi data impor", "Riwayat ekspor data HR"],
    adminControls: ["/admin/hr/policies", "/admin/hr/audit"],
    orgTargets: ["/org/hr/import-export"],
  },
  "report-absensi": {
    title: "Laporan Absensi",
    description: "Halaman mandiri laporan absensi pada area kerja HR super admin.",
    domain: "Pelaporan",
    checkpoints: ["Filter laporan absensi", "Kualitas data laporan", "Distribusi laporan lintas tenant"],
    adminControls: ["/admin/hr", "/admin/hr/audit", "/admin/hr/error-logs"],
    orgTargets: ["/org/hr/attendance-recap", "/org/hr/reports"],
  },
};

const SECTION_ALIASES: Record<string, string> = {
  "struktur-organisasi": "struktur-unit-organisasi",
  departemen: "struktur-unit-organisasi",
  divisi: "struktur-unit-organisasi",
  jabatan: "jabatan-grade",
  "lokasi-kerja": "lokasi-kalender-kerja",
  "kalender-kerja": "lokasi-kalender-kerja",
};

const OPERATIONAL_PLAYBOOK: Record<string, OperationalPlaybook> = {
  "struktur-unit-organisasi": {
    focus: [
      "Validasi struktur organisasi induk-cabang lintas tenant.",
      "Normalisasi penamaan departemen dan divisi.",
      "Kontrol relasi unit terhadap data pegawai aktif.",
    ],
    deliverables: [
      "Templat struktur organisasi acuan bawaan tenant.",
      "Daftar anomali unit/departemen/divisi untuk tindak lanjut.",
      "Matriks kepemilikan unit oleh admin tenant.",
    ],
    actions: [
      { label: "Buka Tenant HR", path: "/admin/hr/tenants" },
      { label: "Audit HR", path: "/admin/hr/audit" },
      { label: "Kebijakan HR", path: "/admin/hr/policies" },
    ],
  },
  "jabatan-grade": {
    focus: [
      "Standarisasi jabatan dan grade lintas tenant.",
      "Kontrol perubahan level untuk promosi/mutasi.",
      "Sinkronisasi jabatan dengan struktur organisasi.",
    ],
    deliverables: [
      "Kamus jabatan & grade standar super admin.",
      "Daftar gap jabatan tenant terhadap acuan bawaan.",
      "Rekomendasi harmonisasi jenjang karier.",
    ],
    actions: [
      { label: "Kebijakan HR", path: "/admin/hr/policies" },
      { label: "Audit HR", path: "/admin/hr/audit" },
      { label: "Pengaturan", path: "/admin/hr/settings#coverage-map" },
    ],
  },
  "lokasi-kalender-kerja": {
    focus: [
      "Validasi lokasi kerja aktif per tenant.",
      "Sinkronisasi kalender kerja dan hari libur nasional.",
      "Konsistensi aturan lokasi terhadap modul absensi.",
    ],
    deliverables: [
      "Daftar lokasi kerja tervalidasi lintas tenant.",
      "Templat kalender kerja acuan bawaan.",
      "Laporan tenant dengan mismatch kalender/libur.",
    ],
    actions: [
      { label: "Buka Tenant HR", path: "/admin/hr/tenants" },
      { label: "Pengaturan", path: "/admin/hr/settings#coverage-map" },
      { label: "Log Error HR", path: "/admin/hr/error-logs" },
    ],
  },
};

export default function AdminHRSectionBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sectionKey = "" } = useParams<{ sectionKey: string }>();
  const [kpi, setKpi] = useState<HrSectionKpi>({
    activeTenants: 0,
    employees: 0,
    contracts: 0,
    hrCriticalErrors24h: 0,
    ticketEvents24h: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSectionMetricsLoading, setIsSectionMetricsLoading] = useState(false);
  const [sectionMetrics, setSectionMetrics] = useState<SectionOperationalMetric[]>([]);
  const [sectionRows, setSectionRows] = useState<SectionOperationalRow[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("all");
  const canonicalSectionKey = useMemo(
    () => SECTION_ALIASES[sectionKey] || sectionKey,
    [sectionKey],
  );

  useEffect(() => {
    if (!sectionKey || canonicalSectionKey === sectionKey) return;
    navigate(`/admin/hr/sections/${canonicalSectionKey}${location.search}${location.hash}`, { replace: true });
  }, [canonicalSectionKey, location.hash, location.search, navigate, sectionKey]);

  const config = useMemo<SectionConfig>(() => {
    return (
      SECTION_CONFIG[canonicalSectionKey] || {
        title: "Bagian HR",
        description: "Halaman mandiri untuk bagian HR super admin.",
        domain: "Area Kerja HR",
        checkpoints: ["Validasi cakupan bagian", "Konfigurasi acuan bawaan", "Pemantauan operasional"],
      }
    );
  }, [canonicalSectionKey]);
  const orgTargets = config.orgTargets || ["/org/hr"];
  const orgTargetsContainNonFinalRoute = orgTargets.some((path) => getHrRoutePolicy(path).status !== "tampil");
  const playbook = useMemo<OperationalPlaybook | null>(
    () => OPERATIONAL_PLAYBOOK[canonicalSectionKey] || null,
    [canonicalSectionKey],
  );

  useEffect(() => {
    let mounted = true;
    const loadKpi = async () => {
      setIsLoading(true);
      try {
        const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [
          tenantsResult,
          employeesResult,
          contractsResult,
          criticalErrorsResult,
          ticketEventsResult,
        ] = await Promise.all([
          supabase.from("tenants").select("id", { count: "exact", head: true }).eq("is_active", true),
          supabase.from("employees").select("id", { count: "exact", head: true }),
          supabase.from("hr_contracts").select("id", { count: "exact", head: true }),
          supabase
            .from("client_error_logs")
            .select("id", { count: "exact", head: true })
            .gte("occurred_at", dayAgoIso)
            .ilike("context", "org.hr.%")
            .eq("is_non_critical", false)
            .eq("is_resolved", false)
            .eq("is_archived", false),
          supabase
            .from("hr_ticket_status_audits")
            .select("id", { count: "exact", head: true })
            .gte("created_at", dayAgoIso),
        ]);

        const queryError =
          tenantsResult.error ||
          employeesResult.error ||
          contractsResult.error ||
          criticalErrorsResult.error ||
          ticketEventsResult.error;
        if (queryError) throw queryError;

        if (!mounted) return;
        setKpi({
          activeTenants: tenantsResult.count || 0,
          employees: employeesResult.count || 0,
          contracts: contractsResult.count || 0,
          hrCriticalErrors24h: criticalErrorsResult.count || 0,
          ticketEvents24h: ticketEventsResult.count || 0,
        });
      } catch (error) {
        const ref = reportError(error, "admin.hr.section_bridge.kpi_fetch", { section_key: canonicalSectionKey });
        if (mounted) {
          toast.warning(appendErrorReference("KPI section HR belum dapat dimuat.", ref));
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void loadKpi();
    return () => {
      mounted = false;
    };
  }, [canonicalSectionKey]);

  useEffect(() => {
    const supportedSections = new Set([
      "struktur-unit-organisasi",
      "jabatan-grade",
      "lokasi-kalender-kerja",
    ]);
    if (!supportedSections.has(canonicalSectionKey)) {
      setSectionMetrics([]);
      setSectionRows([]);
      setIsSectionMetricsLoading(false);
      return;
    }

    let mounted = true;
    const loadSectionMetrics = async () => {
      setIsSectionMetricsLoading(true);
      try {
        const { data: tenantRows, error: tenantError } = await supabase
          .from("tenants")
          .select("id, name, code")
          .limit(2000);
        if (tenantError) throw tenantError;
        if (mounted) setTenantOptions((tenantRows || []) as TenantOption[]);
        const tenantMap = new Map(
          (tenantRows || []).map((tenant) => [
            tenant.id,
            `${tenant.name || "Tenant"}${tenant.code ? ` (${tenant.code})` : ""}`,
          ]),
        );
        const scopeTenant = <T extends { eq: (...args: unknown[]) => T }>(query: T) =>
          selectedTenantId === "all" ? query : query.eq("tenant_id", selectedTenantId);

        if (canonicalSectionKey === "struktur-unit-organisasi") {
          const [opdTotal, unitTotal, employeeNoOpd, employeeNoUnit, opdRows, unitRows] = await Promise.all([
            scopeTenant(supabase.from("opd")).select("id", { count: "exact", head: true }),
            scopeTenant(supabase.from("work_units")).select("id", { count: "exact", head: true }),
            scopeTenant(supabase.from("employees")).select("id", { count: "exact", head: true }).is("opd_id", null),
            scopeTenant(supabase.from("employees")).select("id", { count: "exact", head: true }).is("work_unit_id", null),
            scopeTenant(
              supabase
              .from("opd")
              .select("id, name, code, tenant_id, is_active, updated_at")
              .order("updated_at", { ascending: false })
              .limit(8),
            ),
            scopeTenant(
              supabase
              .from("work_units")
              .select("id, name, code, tenant_id, is_active, updated_at")
              .order("updated_at", { ascending: false })
              .limit(8),
            ),
          ]);
          const queryError =
            opdTotal.error ||
            unitTotal.error ||
            employeeNoOpd.error ||
            employeeNoUnit.error ||
            opdRows.error ||
            unitRows.error;
          if (queryError) throw queryError;
          if (!mounted) return;
          setSectionMetrics([
            {
              label: "Total Departemen (OPD)",
              value: opdTotal.count || 0,
              note: "Total master departemen pada seluruh tenant",
            },
            {
              label: "Total Unit Kerja",
              value: unitTotal.count || 0,
              note: "Total unit/divisi pada seluruh tenant",
            },
            {
              label: "Pegawai Tanpa Departemen",
              value: employeeNoOpd.count || 0,
              note: "Perlu pemetaan opd_id pada data karyawan",
            },
            {
              label: "Pegawai Tanpa Unit Kerja",
              value: employeeNoUnit.count || 0,
              note: "Perlu pemetaan work_unit_id pada data karyawan",
            },
          ]);
          const rows: SectionOperationalRow[] = [
            ...(opdRows.data || []).map((row) => ({
              id: `opd-${row.id}`,
              tenantId: row.tenant_id,
              type: "Departemen",
              title: `${row.name}${row.code ? ` (${row.code})` : ""}`,
              tenantLabel: tenantMap.get(row.tenant_id) || row.tenant_id,
              statusLabel: row.is_active ? "Aktif" : "Nonaktif",
              updatedAt: row.updated_at,
              meta: "Master departemen",
            })),
            ...(unitRows.data || []).map((row) => ({
              id: `unit-${row.id}`,
              tenantId: row.tenant_id,
              type: "Unit Kerja",
              title: `${row.name}${row.code ? ` (${row.code})` : ""}`,
              tenantLabel: tenantMap.get(row.tenant_id) || row.tenant_id,
              statusLabel: row.is_active ? "Aktif" : "Nonaktif",
              updatedAt: row.updated_at,
              meta: "Relasi unit/divisi",
            })),
          ]
            .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
            .slice(0, 12);
          setSectionRows(rows);
          return;
        }

        if (canonicalSectionKey === "jabatan-grade") {
          const [positionTotal, employeeNoPosition, contractActive, contractPending, positionRows] = await Promise.all([
            scopeTenant(supabase.from("positions")).select("id", { count: "exact", head: true }),
            scopeTenant(supabase.from("employees")).select("id", { count: "exact", head: true }).is("position_id", null),
            scopeTenant(supabase.from("hr_contracts")).select("id", { count: "exact", head: true }).eq("status", "active"),
            scopeTenant(supabase.from("hr_contracts")).select("id", { count: "exact", head: true }).eq("status", "pending"),
            scopeTenant(
              supabase
              .from("positions")
              .select("id, name, tenant_id, is_active, updated_at")
              .order("updated_at", { ascending: false })
              .limit(12),
            ),
          ]);
          const queryError =
            positionTotal.error ||
            employeeNoPosition.error ||
            contractActive.error ||
            contractPending.error ||
            positionRows.error;
          if (queryError) throw queryError;
          if (!mounted) return;
          setSectionMetrics([
            {
              label: "Total Jabatan",
              value: positionTotal.count || 0,
              note: "Jumlah master jabatan/grade lintas tenant",
            },
            {
              label: "Pegawai Tanpa Jabatan",
              value: employeeNoPosition.count || 0,
              note: "Perlu pemetaan position_id pada data karyawan",
            },
            {
              label: "Kontrak Aktif",
              value: contractActive.count || 0,
              note: "Kontrak status aktif terkait pemetaan jabatan",
            },
            {
              label: "Kontrak Menunggu",
              value: contractPending.count || 0,
              note: "Kontrak menunggu aktivasi/penetapan",
            },
          ]);
          setSectionRows(
            (positionRows.data || []).map((row) => ({
              id: `position-${row.id}`,
              tenantId: row.tenant_id,
              type: "Jabatan",
              title: row.name,
              tenantLabel: tenantMap.get(row.tenant_id) || row.tenant_id,
              statusLabel: row.is_active ? "Aktif" : "Nonaktif",
              updatedAt: row.updated_at,
              meta: "Master jabatan/grade",
            })),
          );
          return;
        }

        const holidaysCountQuery = selectedTenantId === "all"
          ? supabase.from("holidays").select("id", { count: "exact", head: true })
          : supabase.from("holidays").select("id", { count: "exact", head: true }).or(`tenant_id.eq.${selectedTenantId},tenant_id.is.null`);
        const holidaysRowsQuery = selectedTenantId === "all"
          ? supabase
              .from("holidays")
              .select("id, name, date, tenant_id, is_national")
              .order("date", { ascending: false })
              .limit(8)
          : supabase
              .from("holidays")
              .select("id, name, date, tenant_id, is_national")
              .or(`tenant_id.eq.${selectedTenantId},tenant_id.is.null`)
              .order("date", { ascending: false })
              .limit(8);
        const [officeTotal, workHoursTotal, employeeNoOffice, holidayRecap, officeRows, workHoursRows, holidayRows] =
          await Promise.all([
            scopeTenant(supabase.from("offices")).select("id", { count: "exact", head: true }),
            scopeTenant(supabase.from("work_hours")).select("id", { count: "exact", head: true }),
            scopeTenant(supabase.from("employees")).select("id", { count: "exact", head: true }).is("office_id", null),
            holidaysCountQuery,
            scopeTenant(
              supabase
                .from("offices")
                .select("id, name, tenant_id, is_active, updated_at")
                .order("updated_at", { ascending: false })
                .limit(8),
            ),
            scopeTenant(
              supabase
                .from("work_hours")
                .select("id, day_of_week, tenant_id, is_active, time_in, time_out, updated_at")
                .order("updated_at", { ascending: false })
                .limit(8),
            ),
            holidaysRowsQuery,
          ]);
        const queryError =
          officeTotal.error ||
          workHoursTotal.error ||
          employeeNoOffice.error ||
          holidayRecap.error ||
          officeRows.error ||
          workHoursRows.error ||
          holidayRows.error;
        if (queryError) throw queryError;
        if (!mounted) return;
        setSectionMetrics([
          {
            label: "Total Lokasi Kerja",
            value: officeTotal.count || 0,
            note: "Jumlah master lokasi kantor lintas tenant",
          },
          {
            label: "Total Templat Jam Kerja",
            value: workHoursTotal.count || 0,
            note: "Templat shift/jam kerja yang tersedia",
          },
          {
            label: "Pegawai Tanpa Lokasi",
            value: employeeNoOffice.count || 0,
            note: "Perlu pemetaan office_id pada data karyawan",
          },
          {
            label: "Data Hari Libur",
            value: holidayRecap.count || 0,
            note: selectedTenantId === "all"
              ? "Jumlah data hari libur global + tenant"
              : "Hari libur tenant terpilih + nasional/global",
          },
        ]);
        const rows: SectionOperationalRow[] = [
            ...(officeRows.data || []).map((row) => ({
              id: `office-${row.id}`,
              tenantId: row.tenant_id,
              type: "Lokasi Kerja",
              title: row.name,
              tenantLabel: tenantMap.get(row.tenant_id) || row.tenant_id,
            statusLabel: row.is_active ? "Aktif" : "Nonaktif",
            updatedAt: row.updated_at,
            meta: "Master lokasi kerja",
          })),
            ...(workHoursRows.data || []).map((row) => ({
              id: `wh-${row.id}`,
              tenantId: row.tenant_id,
              type: "Kalender/Jam Kerja",
              title: `Hari ${row.day_of_week} ${row.time_in}-${row.time_out}`,
              tenantLabel: tenantMap.get(row.tenant_id) || row.tenant_id,
              statusLabel: row.is_active ? "Aktif" : "Nonaktif",
              updatedAt: row.updated_at,
              meta: "Templat jam kerja",
            })),
            ...(holidayRows.data || []).map((row) => ({
              id: `holiday-${row.id}`,
              tenantId: row.tenant_id || "global",
              type: "Hari Libur",
              title: `${row.name} (${row.date})`,
              tenantLabel: row.tenant_id ? tenantMap.get(row.tenant_id) || row.tenant_id : "Global/Nasional",
              statusLabel: row.is_national ? "Nasional" : "Tenant",
              updatedAt: row.date,
              meta: "Kalender libur",
            })),
          ]
          .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
          .slice(0, 12);
        setSectionRows(rows);
      } catch (error) {
        const ref = reportError(error, "admin.hr.section_bridge.operational_metrics_fetch", {
          section_key: canonicalSectionKey,
        });
        if (mounted) {
          toast.warning(appendErrorReference("Metrik operasional section belum dapat dimuat.", ref));
          setSectionMetrics([]);
          setSectionRows([]);
        }
      } finally {
        if (mounted) setIsSectionMetricsLoading(false);
      }
    };

    void loadSectionMetrics();
    return () => {
      mounted = false;
    };
  }, [canonicalSectionKey, selectedTenantId]);

  return (
    <AdminHRPageShell
      title={config.title}
      subtitle={config.domain}
      description={config.description}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>KPI Ringkas Section</CardTitle>
            <CardDescription>Indikator lintas tenant yang relevan untuk triase super admin HR.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Tenant HR Aktif</p>
              <p className="text-xl font-semibold">{isLoading ? "..." : kpi.activeTenants}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Karyawan</p>
              <p className="text-xl font-semibold">{isLoading ? "..." : kpi.employees}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Kontrak</p>
              <p className="text-xl font-semibold">{isLoading ? "..." : kpi.contracts}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Error HR Kritis (24j)</p>
              <p className="text-xl font-semibold">{isLoading ? "..." : kpi.hrCriticalErrors24h}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Event Tiket (24j)</p>
              <p className="text-xl font-semibold">{isLoading ? "..." : kpi.ticketEvents24h}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Bagian Admin HR</Badge>
            </div>
            <CardTitle>{config.title}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {config.checkpoints.map((checkpoint) => (
              <div key={checkpoint} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {checkpoint}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relasi Kontrol Bagian</CardTitle>
            <CardDescription>
              Jalur kontrol admin dan target modul org terkait section ini.
              {orgTargetsContainNonFinalRoute ? " Beberapa target org masih berupa alias atau rute internal." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kontrol Admin</p>
              {(config.adminControls || ["/admin/hr/settings"]).map((path) => (
                <Badge key={path} variant="secondary" className="mr-2 mb-2">
                  {path}
                </Badge>
              ))}
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Org</p>
              {orgTargets.map((path) => (
                <div key={path} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="font-mono text-xs">{path}</span>
                  <Badge variant={getOrgTargetStatusVariant(path)}>{getOrgTargetStatusLabel(path)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {sectionMetrics.length > 0 ? (
          <Card>
            <CardHeader>
            <CardTitle>Metrik Operasional Bagian</CardTitle>
              <CardDescription>Ringkasan data inti untuk eksekusi kontrol harian super admin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter Tenant</p>
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger className="w-full sm:w-[300px]">
                    <SelectValue placeholder="Semua Tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tenant</SelectItem>
                    {tenantOptions.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sectionMetrics.map((metric) => (
                <div key={metric.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="text-xl font-semibold">{isSectionMetricsLoading ? "..." : metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                </div>
              ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {sectionRows.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Data Operasional Terbaru</CardTitle>
              <CardDescription>Item terbaru yang perlu tinjauan cepat oleh super admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sectionRows.map((row) => (
                  <div key={row.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{row.title}</p>
                      <Badge variant="outline">{row.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{row.tenantLabel}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{row.statusLabel}</Badge>
                      <span className="text-xs text-muted-foreground">{row.meta}</span>
                      <span className="text-xs text-muted-foreground">
                        Update:{" "}
                        {row.updatedAt
                          ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
                              new Date(row.updatedAt),
                            )
                          : "-"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {playbook ? (
          <Card>
            <CardHeader>
              <CardTitle>Rencana Operasional</CardTitle>
              <CardDescription>Checklist praktis untuk eksekusi super admin pada bagian ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fokus Kontrol</p>
                <div className="space-y-2 text-sm">
                  {playbook.focus.map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliverable</p>
                <div className="space-y-2 text-sm">
                  {playbook.deliverables.map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {playbook.actions.map((item) => (
                  <Badge key={item.path} variant="outline" className="px-2 py-1">
                    {item.label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminHRPageShell>
  );
}
