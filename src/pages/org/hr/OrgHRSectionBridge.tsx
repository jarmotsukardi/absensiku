import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type BridgeConfig = {
  title: string;
  description: string;
  domain: string;
  checkpoints: string[];
};

type OrgSnapshot = {
  companyName: string;
  companyType: string;
  opdCount: number;
  unitCount: number;
  officeCount: number;
  positionCount: number;
};

const BRIDGE_CONFIG: Record<string, BridgeConfig> = {
  "/org/hr/dashboard-notifications": {
    title: "Notifikasi Dashboard HR",
    description: "Ringkasan notifikasi prioritas untuk operasional harian HR.",
    domain: "Dashboard",
    checkpoints: [
      "Notifikasi prioritas hari ini",
      "Reminder approval tertunda",
      "Ringkasan alert operasional HR",
    ],
  },
  "/org/hr/dashboard-activity": {
    title: "Aktivitas Dashboard HR",
    description: "Ringkasan aktivitas terbaru terkait perubahan data HR.",
    domain: "Dashboard",
    checkpoints: [
      "Aktivitas perubahan terbaru",
      "Pengguna yang melakukan perubahan",
      "Waktu dan konteks perubahan",
    ],
  },
  "/org/hr/notifications": {
    title: "Notifikasi HR",
    description: "Pusat pengelolaan notifikasi yang digunakan modul HR organisasi.",
    domain: "System Settings",
    checkpoints: [
      "Template notifikasi internal HR",
      "Notifikasi approval cuti/izin",
      "Pemberitahuan onboarding/offboarding",
    ],
  },
  "/org/hr/activity-log": {
    title: "Aktivitas Terbaru HR",
    description: "Audit aktivitas untuk perubahan data penting dan operasi HR.",
    domain: "User & Access Management",
    checkpoints: [
      "Riwayat perubahan data karyawan",
      "Jejak perubahan role/permission",
      "Log aktivitas konfigurasi HR",
    ],
  },
  "/org/hr/company": {
    title: "Data Perusahaan",
    description: "Pengaturan profil organisasi dan konfigurasi perusahaan.",
    domain: "Organization Management",
    checkpoints: [
      "Profil perusahaan",
      "Identitas legal organisasi",
      "Konfigurasi unit kerja utama",
    ],
  },
  "/org/hr/branding": {
    title: "Branding HR",
    description: "Pengaturan identitas visual untuk konteks modul HR organisasi.",
    domain: "System Settings",
    checkpoints: [
      "Logo/identitas modul HR",
      "Konsistensi label workspace",
      "Standarisasi tampilan komunikasi HR",
    ],
  },
  "/org/hr/work-locations": {
    title: "Lokasi Kerja",
    description: "Master lokasi kerja yang dipakai dalam proses HR.",
    domain: "Organization Management",
    checkpoints: [
      "Daftar kantor/cabang",
      "Lokasi penempatan pegawai",
      "Lokasi default proses absensi",
    ],
  },
  "/org/hr/work-calendar": {
    title: "Kalender Kerja",
    description: "Pengaturan kalender/jam kerja yang menjadi dasar operasional HR.",
    domain: "Organization Management",
    checkpoints: [
      "Kalender kerja per unit",
      "Penetapan jadwal efektif",
      "Sinkronisasi kebijakan kehadiran",
    ],
  },
  "/org/hr/departments": {
    title: "Departemen",
    description: "Manajemen struktur departemen untuk organisasi HR.",
    domain: "Organization Management",
    checkpoints: [
      "Daftar departemen aktif",
      "Kepala departemen",
      "Relasi departemen ke divisi",
    ],
  },
  "/org/hr/divisions": {
    title: "Divisi",
    description: "Manajemen struktur divisi untuk pembagian fungsi organisasi.",
    domain: "Organization Management",
    checkpoints: [
      "Daftar divisi aktif",
      "Mapping divisi ke departemen",
      "Keterkaitan divisi dengan posisi",
    ],
  },
  "/org/hr/employee-status": {
    title: "Status Kepegawaian",
    description: "Daftar pegawai non-aktif untuk kebutuhan status kepegawaian.",
    domain: "Employee Management",
    checkpoints: [
      "Status aktif/non-aktif",
      "Riwayat perubahan status",
      "Validasi akhir lifecycle pegawai",
    ],
  },
  "/org/hr/onboarding": {
    title: "Onboarding",
    description: "Manajemen undangan dan aktivasi pegawai baru.",
    domain: "Employee Management",
    checkpoints: [
      "Undangan akun pegawai",
      "Checklist onboarding",
      "Aktivasi akses awal",
    ],
  },
  "/org/hr/offboarding": {
    title: "Offboarding",
    description: "Pengelolaan mutasi/perubahan status untuk proses offboarding.",
    domain: "Employee Management",
    checkpoints: [
      "Proses pelepasan pegawai",
      "Serah terima aset",
      "Penutupan akses sistem",
    ],
  },
  "/org/hr/job-history": {
    title: "Riwayat Jabatan",
    description: "Pelacakan riwayat promosi, mutasi, dan perubahan jabatan.",
    domain: "Employee Management",
    checkpoints: [
      "Riwayat perubahan jabatan",
      "Efektif tanggal perubahan",
      "Dokumen pendukung perubahan",
    ],
  },
  "/org/hr/work-hours": {
    title: "Jam Kerja",
    description: "Pengaturan jam kerja sebagai fondasi kehadiran pegawai.",
    domain: "Attendance Management",
    checkpoints: [
      "Template jam kerja",
      "Aturan keterlambatan",
      "Ketentuan toleransi absensi",
    ],
  },
  "/org/hr/shifts": {
    title: "Shift",
    description: "Pengaturan pola shift yang dipakai operasional kehadiran.",
    domain: "Attendance Management",
    checkpoints: [
      "Pola shift harian/mingguan",
      "Penempatan shift per tim",
      "Rotasi dan overlap shift",
    ],
  },
  "/org/hr/national-holidays": {
    title: "Hari Libur Nasional",
    description: "Daftar libur nasional yang menjadi referensi absensi.",
    domain: "Attendance Management",
    checkpoints: [
      "Sinkronisasi kalender nasional",
      "Override kebijakan per unit",
      "Dampak ke rekap kehadiran",
    ],
  },
  "/org/hr/late-settings": {
    title: "Pengaturan Keterlambatan",
    description: "Aturan batas absensi/keterlambatan untuk organisasi.",
    domain: "Attendance Management",
    checkpoints: [
      "Batas toleransi terlambat",
      "Skema sanksi internal",
      "Kebijakan auto-flag pelanggaran",
    ],
  },
  "/org/hr/attendance-recap": {
    title: "Rekap Absensi",
    description: "Laporan ringkas kehadiran yang dipakai untuk evaluasi HR.",
    domain: "Attendance Management",
    checkpoints: [
      "Rekap harian/mingguan",
      "Ringkasan keterlambatan",
      "Analisis kehadiran per unit",
    ],
  },
  "/org/hr/attendance-integrations": {
    title: "Integrasi Absensi",
    description: "Konfigurasi integrasi perangkat/kanal absensi pada konteks HR.",
    domain: "Attendance Management",
    checkpoints: [
      "Sumber data absensi",
      "Validasi sinkronisasi kehadiran",
      "Fallback saat integrasi bermasalah",
    ],
  },
  "/org/hr/leave-types": {
    title: "Jenis Cuti",
    description: "Kategori permohonan cuti/izin yang dipakai operasional harian.",
    domain: "Leave & Permission",
    checkpoints: [
      "Jenis cuti/izin",
      "Aturan eligibility",
      "Validasi dokumen pendukung",
    ],
  },
  "/org/hr/leave-quota": {
    title: "Kuota Cuti",
    description: "Ringkasan cuti disetujui sebagai acuan kuota berjalan.",
    domain: "Leave & Permission",
    checkpoints: [
      "Saldo kuota cuti",
      "Carry-over cuti",
      "Pemakaian kuota tahunan",
    ],
  },
  "/org/hr/leave-approval": {
    title: "Approval Flow Cuti",
    description: "Alur persetujuan cuti/izin untuk kebutuhan approval HR.",
    domain: "Leave & Permission",
    checkpoints: [
      "Tahapan approval",
      "Delegasi approver",
      "SLA persetujuan",
    ],
  },
  "/org/hr/leave-recap": {
    title: "Rekap Cuti",
    description: "Laporan cuti sebagai dasar monitoring HR.",
    domain: "Leave & Permission",
    checkpoints: [
      "Rekap permohonan cuti",
      "Distribusi jenis cuti",
      "Tren penggunaan cuti",
    ],
  },
  "/org/hr/leave-validity": {
    title: "Masa Berlaku Cuti",
    description: "Pengaturan masa berlaku kuota cuti dan aturan carry-over.",
    domain: "Leave & Permission",
    checkpoints: [
      "Aturan kadaluarsa kuota",
      "Carry-over tahunan",
      "Pengecualian kebijakan cuti",
    ],
  },
  "/org/hr/kpi": {
    title: "KPI",
    description: "Definisi KPI HR untuk evaluasi kinerja organisasi.",
    domain: "Performance Management",
    checkpoints: [
      "Daftar KPI aktif",
      "Bobot tiap KPI",
      "Target periode evaluasi",
    ],
  },
  "/org/hr/performance-periods": {
    title: "Periode Penilaian",
    description: "Pengaturan periode evaluasi kinerja HR.",
    domain: "Performance Management",
    checkpoints: [
      "Penetapan periode aktif",
      "Tanggal mulai/akhir penilaian",
      "Status periode evaluasi",
    ],
  },
  "/org/hr/performance-forms": {
    title: "Form Penilaian",
    description: "Template form evaluasi kinerja untuk proses penilaian.",
    domain: "Performance Management",
    checkpoints: [
      "Template pertanyaan penilaian",
      "Skala nilai",
      "Aturan wajib isi",
    ],
  },
  "/org/hr/review-360": {
    title: "360 Review",
    description: "Konfigurasi evaluasi multi-penilai dalam proses HR.",
    domain: "Performance Management",
    checkpoints: [
      "Penetapan reviewer",
      "Siklus review 360",
      "Kontrol kerahasiaan penilaian",
    ],
  },
  "/org/hr/evaluation-results": {
    title: "Hasil Evaluasi",
    description: "Ringkasan evaluasi performa melalui data rekap.",
    domain: "Performance Management",
    checkpoints: [
      "Ringkasan hasil penilaian",
      "Status periode evaluasi",
      "Aksi tindak lanjut HR",
    ],
  },
  "/org/hr/skill-matrix": {
    title: "Skill Matrix",
    description: "Referensi analitik mutasi/kompetensi untuk kebutuhan pengembangan.",
    domain: "Training & Development",
    checkpoints: [
      "Peta kompetensi tim",
      "Gap keterampilan",
      "Prioritas pengembangan",
    ],
  },
  "/org/hr/training-data": {
    title: "Data Training",
    description: "Manajemen data pelatihan internal untuk pengembangan pegawai.",
    domain: "Training & Development",
    checkpoints: [
      "Daftar program training",
      "Peserta training",
      "Status penyelesaian training",
    ],
  },
  "/org/hr/certifications": {
    title: "Sertifikasi",
    description: "Pencatatan sertifikasi pegawai dan masa berlaku sertifikat.",
    domain: "Training & Development",
    checkpoints: [
      "Daftar sertifikasi pegawai",
      "Tanggal kedaluwarsa sertifikat",
      "Kebutuhan perpanjangan",
    ],
  },
  "/org/hr/document-templates": {
    title: "Template Dokumen",
    description: "Pengelolaan template dokumen standar HR.",
    domain: "Document & Legal",
    checkpoints: [
      "Template surat standar",
      "Versi template aktif",
      "Kontrol perubahan template",
    ],
  },
  "/org/hr/warning-letters": {
    title: "Surat Peringatan",
    description: "Manajemen surat peringatan dan arsip tindak lanjut.",
    domain: "Document & Legal",
    checkpoints: [
      "Jenis surat peringatan",
      "Riwayat penerbitan surat",
      "Status tindak lanjut",
    ],
  },
  "/org/hr/contract-templates": {
    title: "Kontrak Template",
    description: "Pengelolaan template kontrak untuk kebutuhan HR.",
    domain: "Document & Legal",
    checkpoints: [
      "Template kontrak aktif",
      "Versi dan revisi kontrak",
      "Checklist legal kontrak",
    ],
  },
  "/org/hr/digital-signature": {
    title: "Digital Signature",
    description: "Pengaturan tanda tangan digital untuk dokumen HR.",
    domain: "Document & Legal",
    checkpoints: [
      "Metode tanda tangan digital",
      "Otorisasi penandatangan",
      "Audit jejak penandatanganan",
    ],
  },
  "/org/hr/users": {
    title: "User Management",
    description: "Kelola akun user yang memiliki akses ke modul organisasi.",
    domain: "User & Access Management",
    checkpoints: [
      "Daftar user HR",
      "Status akun dan akses",
      "Pemetaan user ke peran",
    ],
  },
  "/org/hr/roles": {
    title: "Role Management",
    description: "Kelola peran user untuk kebutuhan kontrol akses HR.",
    domain: "User & Access Management",
    checkpoints: [
      "Daftar role HR",
      "Scope kewenangan role",
      "Relasi role dan approval",
    ],
  },
  "/org/hr/permissions": {
    title: "Permission Setting",
    description: "Pengaturan permission user dan operator organisasi.",
    domain: "User & Access Management",
    checkpoints: [
      "Permission per fitur HR",
      "Pembatasan aksi kritikal",
      "Review permission berkala",
    ],
  },
  "/org/hr/approval-hierarchy": {
    title: "Approval Hierarchy",
    description: "Konfigurasi jalur persetujuan lintas proses HR.",
    domain: "User & Access Management",
    checkpoints: [
      "Rantai approval per proses",
      "Aturan eskalasi approval",
      "Delegasi approver cadangan",
    ],
  },
  "/org/hr/general-settings": {
    title: "General Settings HR",
    description: "Pengaturan umum modul HR organisasi.",
    domain: "System Settings",
    checkpoints: [
      "Parameter dasar modul HR",
      "Konfigurasi default proses",
      "Sinkronisasi kebijakan lintas menu",
    ],
  },
  "/org/hr/import-export": {
    title: "Import / Export Data",
    description: "Pengelolaan import data pegawai untuk sinkronisasi administrasi.",
    domain: "System Settings",
    checkpoints: [
      "Template import HR",
      "Validasi field wajib",
      "Jejak ekspor data",
    ],
  },
  "/org/hr/backup": {
    title: "Backup HR",
    description: "Pengaturan backup dan kesiapan pemulihan data HR.",
    domain: "System Settings",
    checkpoints: [
      "Jadwal backup data",
      "Validasi hasil backup",
      "Prosedur restore darurat",
    ],
  },
  "/org/hr/recruitment/jobs": {
    title: "Lowongan Kerja",
    description: "Scaffold ATS untuk publikasi lowongan dan kebutuhan rekrutmen.",
    domain: "Rekrutmen (ATS)",
    checkpoints: [
      "Draft lowongan aktif",
      "Kebutuhan posisi per unit",
      "Status publikasi lowongan",
    ],
  },
  "/org/hr/recruitment/candidates": {
    title: "Kandidat",
    description: "Scaffold ATS untuk manajemen kandidat dari pelamaran hingga seleksi.",
    domain: "Rekrutmen (ATS)",
    checkpoints: [
      "Daftar kandidat per lowongan",
      "Tahap seleksi kandidat",
      "Catatan hasil screening",
    ],
  },
  "/org/hr/recruitment/interviews": {
    title: "Tahap Interview",
    description: "Scaffold ATS untuk penjadwalan dan evaluasi interview kandidat.",
    domain: "Rekrutmen (ATS)",
    checkpoints: [
      "Jadwal interview kandidat",
      "Panel interviewer",
      "Hasil evaluasi interview",
    ],
  },
  "/org/hr/recruitment/offers": {
    title: "Penawaran Kerja",
    description: "Scaffold ATS untuk proses penawaran kerja dan status penerimaan kandidat.",
    domain: "Rekrutmen (ATS)",
    checkpoints: [
      "Draft penawaran kerja",
      "Status penerimaan kandidat",
      "Kesiapan onboarding kandidat",
    ],
  },
  "/org/hr/ess/requests": {
    title: "Pengajuan Saya",
    description: "Scaffold ESS untuk pengajuan mandiri karyawan secara end-to-end.",
    domain: "Layanan Mandiri Karyawan (ESS)",
    checkpoints: [
      "Daftar pengajuan aktif",
      "Status persetujuan pengajuan",
      "Riwayat pengajuan karyawan",
    ],
  },
  "/org/hr/ess/leave-requests": {
    title: "Cuti dan Izin Saya",
    description: "Scaffold ESS untuk pengajuan cuti/izin secara mandiri oleh karyawan.",
    domain: "Layanan Mandiri Karyawan (ESS)",
    checkpoints: [
      "Pengajuan cuti terbaru",
      "Saldo cuti pribadi",
      "Riwayat persetujuan cuti",
    ],
  },
  "/org/hr/ess/attendance": {
    title: "Kehadiran Saya",
    description: "Scaffold ESS untuk ringkasan kehadiran pribadi dan anomali absensi.",
    domain: "Layanan Mandiri Karyawan (ESS)",
    checkpoints: [
      "Riwayat hadir harian",
      "Catatan terlambat/lembur",
      "Permintaan koreksi absensi",
    ],
  },
  "/org/hr/ess/documents": {
    title: "Dokumen Saya",
    description: "Scaffold ESS untuk akses dokumen personal karyawan.",
    domain: "Layanan Mandiri Karyawan (ESS)",
    checkpoints: [
      "Dokumen kontrak pribadi",
      "Dokumen administrasi pribadi",
      "Status tanda tangan dokumen",
    ],
  },
  "/org/hr/ess/profile": {
    title: "Profil Saya",
    description: "Scaffold ESS untuk data pribadi dan pembaruan profil mandiri.",
    domain: "Layanan Mandiri Karyawan (ESS)",
    checkpoints: [
      "Data profil pribadi",
      "Kontak darurat",
      "Riwayat perubahan data profil",
    ],
  },
};

const ORGANIZATION_BRIDGE_ROUTES = new Set([
  "/org/hr/company",
  "/org/hr/departments",
  "/org/hr/divisions",
  "/org/hr/work-locations",
  "/org/hr/work-calendar",
]);

export default function OrgHRSectionBridge() {
  const location = useLocation();
  const [orgSnapshot, setOrgSnapshot] = useState<OrgSnapshot | null>(null);
  const [isOrgSnapshotLoading, setIsOrgSnapshotLoading] = useState(false);

  const config = useMemo<BridgeConfig | null>(() => BRIDGE_CONFIG[location.pathname] ?? null, [location.pathname]);
  const isOrganizationRoute = ORGANIZATION_BRIDGE_ROUTES.has(location.pathname);

  useEffect(() => {
    if (!isOrganizationRoute) return;
    let mounted = true;

    const loadOrgSnapshot = async () => {
      setIsOrgSnapshotLoading(true);
      try {
        const tenantId = await resolveOrgTenantId();
        if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        const [tenantRes, opdRes, unitRes, officeRes, positionRes] = await Promise.all([
          supabase.from("tenants").select("name, organization_type").eq("id", tenantId).maybeSingle(),
          supabase.from("opd").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("work_units").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("offices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("positions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        ]);

        if (tenantRes.error) throw tenantRes.error;
        if (opdRes.error) throw opdRes.error;
        if (unitRes.error) throw unitRes.error;
        if (officeRes.error) throw officeRes.error;
        if (positionRes.error) throw positionRes.error;

        if (!mounted) return;
        setOrgSnapshot({
          companyName: tenantRes.data?.name || "-",
          companyType: tenantRes.data?.organization_type || "-",
          opdCount: opdRes.count || 0,
          unitCount: unitRes.count || 0,
          officeCount: officeRes.count || 0,
          positionCount: positionRes.count || 0,
        });
      } catch (error) {
        const ref = reportError(error, "org.hr.section_bridge.org_snapshot.fetch", {
          pathname: location.pathname,
        });
        if (mounted) {
          setOrgSnapshot(null);
          toast.warning(appendErrorReference("Ringkasan data organisasi belum dapat dimuat.", ref));
        }
      } finally {
        if (mounted) setIsOrgSnapshotLoading(false);
      }
    };

    void loadOrgSnapshot();
    return () => {
      mounted = false;
    };
  }, [isOrganizationRoute, location.pathname]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">{config?.domain ?? "HR Module"}</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{config?.title ?? "Halaman HR"}</h1>
          <p className="text-sm text-muted-foreground">
            {config?.description ??
              "Halaman mandiri untuk fitur HR organisasi."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Checklist Implementasi</CardTitle>
            <CardDescription>
              Konfigurasi inti yang disarankan untuk modul ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {(config?.checkpoints ?? ["Siapkan konfigurasi modul", "Validasi akses pengguna", "Review kebijakan HR"]).map(
              (item) => (
                <div key={item} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {item}
                  </div>
                </div>
              ),
            )}
          </CardContent>
        </Card>

        {isOrganizationRoute ? (
          <Card>
            <CardHeader>
              <CardTitle>Ringkasan Data Organisasi</CardTitle>
              <CardDescription>Snapshot data aktual untuk menu organisasi HR.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {isOrgSnapshotLoading ? (
                <p className="text-sm text-muted-foreground">Memuat snapshot organisasi...</p>
              ) : (
                <>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Perusahaan</p>
                    <p className="text-sm font-medium">{orgSnapshot?.companyName || "-"}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Jenis Organisasi</p>
                    <p className="text-sm font-medium">{orgSnapshot?.companyType || "-"}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Total OPD</p>
                    <p className="text-sm font-medium">{orgSnapshot?.opdCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Total Satuan Kerja</p>
                    <p className="text-sm font-medium">{orgSnapshot?.unitCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Total Lokasi</p>
                    <p className="text-sm font-medium">{orgSnapshot?.officeCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Total Jabatan</p>
                    <p className="text-sm font-medium">{orgSnapshot?.positionCount ?? 0}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Status Halaman</CardTitle>
            <CardDescription>
              Halaman ini sengaja difokuskan ke konten modul agar tidak menduplikasi navigasi sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gunakan sidebar untuk berpindah antar menu/submenu HR.
            </p>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
