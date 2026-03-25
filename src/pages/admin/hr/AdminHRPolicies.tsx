import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { getHrRoutePolicy } from "@/lib/hrRouteAccess";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  DEFAULT_HR_REVIEW360_SETTINGS,
  fetchTenantHrPerformanceForms,
  fetchTenantHrPerformanceKpis,
  fetchTenantHrPerformancePeriods,
  fetchTenantHrReview360Settings,
  saveTenantHrReview360Settings,
  type HrReview360Settings,
} from "@/lib/hrPerformanceSettings";
import {
  DEFAULT_HR_ESS_POLICY_SETTINGS,
  fetchTenantHrEssPolicySettings,
  saveTenantHrEssPolicySettings,
  type HrEssPolicySettings,
} from "@/lib/hrEssPolicySettings";
import {
  fetchTenantHrCertificationRules,
  fetchTenantHrSkillMatrixItems,
  fetchTenantHrTrainingPrograms,
  saveTenantHrCertificationRules,
  saveTenantHrSkillMatrixItems,
  saveTenantHrTrainingPrograms,
  type HrCertificationRule,
  type HrSkillMatrixItem,
  type HrTrainingProgram,
} from "@/lib/hrTrainingSettings";
import { toast } from "sonner";

type PolicyDomain = {
  title: string;
  description: string;
  readinessNote: string;
  adminFocus: string[];
  adminTargets: Array<{ label: string; path: string }>;
  orgTargets: Array<{ label: string; path: string }>;
};

type TenantOption = {
  id: string;
  name: string;
  code: string;
};

type TenantPolicySnapshot = {
  kpiCount: number;
  periodCount: number;
  formCount: number;
  trainingCount: number;
  certificationCount: number;
  skillMatrixCount: number;
};

const INITIAL_TRAINING_PROGRAM: HrTrainingProgram = {
  id: "",
  name: "",
  category: "Umum",
  provider: "Internal",
  durationHours: 8,
  participantTarget: 10,
  status: "draft",
  notes: "",
};

const INITIAL_CERTIFICATION_RULE: HrCertificationRule = {
  id: "",
  name: "",
  targetRole: "Semua Peran",
  validityMonths: 12,
  reminderDays: 30,
  mandatory: false,
  issuer: "Lembaga Internal",
};

const INITIAL_SKILL_MATRIX_ITEM: HrSkillMatrixItem = {
  id: "",
  skillName: "",
  targetFunction: "Umum",
  requiredLevel: "Dasar",
  currentCoverage: 0,
  gapCount: 0,
  linkedTraining: "-",
};

const getRouteStatusLabel = (path: string): string => {
  const policy = getHrRoutePolicy(path);
  if (policy.status === "redirect") return "Alias";
  if (policy.status === "internal") return "Internal";
  if (policy.status === "tunda") return "Tunda";
  return "Aktif";
};

const getRouteStatusVariant = (path: string): "default" | "secondary" | "outline" => {
  const policy = getHrRoutePolicy(path);
  return policy.status === "tampil" ? "secondary" : "outline";
};

const getDomainReadinessVariant = (nonFinalCount: number): "secondary" | "outline" => {
  return nonFinalCount === 0 ? "secondary" : "outline";
};

const POLICY_DOMAINS: PolicyDomain[] = [
  {
    title: "Fondasi Organisasi",
    description: "Acuan bawaan struktur, jabatan, kontrak, dan dokumen yang menjadi tulang punggung area kerja HR tenant.",
    readinessNote: "Siap dipakai sebagai acuan bawaan master data tenant, namun masih perlu pengawasan untuk rute alias fondasi.",
    adminFocus: ["Konsistensi master pegawai", "Higiene struktur organisasi", "Standar dokumen dan kontrak"],
    adminTargets: [
      { label: "Matriks Cakupan", path: "/admin/hr/settings#coverage-map" },
      { label: "Tenant HR", path: "/admin/hr/tenants" },
    ],
    orgTargets: [
      { label: "Data Pegawai", path: "/org/hr/employees" },
      { label: "Struktur Organisasi", path: "/org/hr/structure" },
      { label: "Jabatan dan Grade", path: "/org/hr/position-grade" },
      { label: "Kontrak Kerja", path: "/org/hr/contracts" },
      { label: "Dokumen HR", path: "/org/hr/documents" },
      { label: "Status Kepegawaian", path: "/org/hr/employee-status" },
      { label: "Riwayat Jabatan", path: "/org/hr/job-history" },
      { label: "Templat Dokumen", path: "/org/hr/document-templates" },
    ],
  },
  {
    title: "Operasional SDM",
    description: "Kebijakan alur masuk/keluar pegawai, jam kerja, shift, keterlambatan, dan integrasi kehadiran.",
    readinessNote: "Operasional harian sudah aktif, dengan kebutuhan admin terbesar pada pemantauan integrasi dan disiplin kehadiran.",
    adminFocus: ["Ketahanan integrasi absensi", "Acuan bawaan jam kerja dan shift", "Pemantauan keterlambatan"],
    adminTargets: [
      { label: "Kebijakan & Acuan Bawaan", path: "/admin/hr/settings#coverage-map" },
      { label: "Audit HR", path: "/admin/hr/audit" },
    ],
    orgTargets: [
      { label: "Proses Masuk Pegawai", path: "/org/hr/onboarding" },
      { label: "Proses Keluar Pegawai", path: "/org/hr/offboarding" },
      { label: "Jam Kerja", path: "/org/hr/work-hours" },
      { label: "Pola Shift", path: "/org/hr/shifts" },
      { label: "Pengaturan Keterlambatan", path: "/org/hr/late-settings" },
      { label: "Analitik Kehadiran", path: "/org/hr/attendance-insights" },
      { label: "Integrasi Absensi", path: "/org/hr/attendance-integrations" },
    ],
  },
  {
    title: "Cuti dan Izin",
    description: "Pengaturan jenis cuti, kuota, approval, dan validitas cuti tenant, berikut dampaknya ke pelaporan.",
    readinessNote: "Domain cuti sudah siap sebagai acuan bawaan dan paling membutuhkan kontrol admin pada masa berlaku serta kualitas kuota.",
    adminFocus: ["Validitas kuota cuti", "Alur persetujuan cuti", "Pemantauan rekap cuti lintas tenant"],
    adminTargets: [
      { label: "Titik Kontrol Cakupan", path: "/admin/hr/settings#coverage-map" },
      { label: "Kebijakan Tiket", path: "/admin/hr/settings#ticket-defaults" },
    ],
    orgTargets: [
      { label: "Jenis Cuti", path: "/org/hr/leave-types" },
      { label: "Kuota Cuti", path: "/org/hr/leave-quota" },
      { label: "Alur Persetujuan Cuti", path: "/org/hr/leave-approval" },
      { label: "Masa Berlaku Cuti", path: "/org/hr/leave-validity" },
      { label: "Rekap Cuti", path: "/org/hr/leave-recap" },
    ],
  },
  {
    title: "Kinerja dan Pelatihan",
    description: "Domain evaluasi dan pengembangan kompetensi yang sekarang sudah aktif sebagai acuan bawaan tenant.",
    readinessNote: "Acuan bawaan kinerja dan pelatihan sudah aktif; admin perlu menjaga ritme evaluasi, templat, dan peta kompetensi tetap konsisten.",
    adminFocus: ["KPI dan periode evaluasi", "Kualitas templat penilaian", "Matriks keahlian dan pelatihan"],
    adminTargets: [
      { label: "Matriks Cakupan", path: "/admin/hr/settings#coverage-map" },
      { label: "Audit HR", path: "/admin/hr/audit" },
    ],
    orgTargets: [
      { label: "KPI", path: "/org/hr/kpi" },
      { label: "Periode Penilaian", path: "/org/hr/performance-periods" },
      { label: "Form Penilaian", path: "/org/hr/performance-forms" },
      { label: "Ulasan 360", path: "/org/hr/review-360" },
      { label: "Hasil Evaluasi", path: "/org/hr/evaluation-results" },
      { label: "Data Pelatihan", path: "/org/hr/training-data" },
      { label: "Sertifikasi", path: "/org/hr/certifications" },
      { label: "Matriks Keahlian", path: "/org/hr/skill-matrix" },
    ],
  },
  {
    title: "Rekrutmen dan ESS",
    description: "Jalur kebijakan untuk ATS dan layanan mandiri pegawai, dengan pemisahan yang jelas antara acuan bawaan admin dan pengalaman tenant.",
    readinessNote: "ATS dan ESS sudah aktif sebagai acuan bawaan tenant; admin berperan menjaga kualitas pipeline kandidat dan stabilitas layanan mandiri.",
    adminFocus: ["Pipeline ATS dan SLA seleksi", "Kualitas data personal ESS", "Konsistensi alur pengajuan mandiri"],
    adminTargets: [
      { label: "Bagian Rekrutmen ATS", path: "/admin/hr/sections/rekrutmen-ats" },
      { label: "Bagian ESS", path: "/admin/hr/sections/layanan-mandiri-karyawan" },
    ],
    orgTargets: [
      { label: "Lowongan ATS", path: "/org/hr/recruitment/jobs" },
      { label: "Kandidat ATS", path: "/org/hr/recruitment/candidates" },
      { label: "Wawancara ATS", path: "/org/hr/recruitment/interviews" },
      { label: "Penawaran ATS", path: "/org/hr/recruitment/offers" },
      { label: "Pengajuan ESS", path: "/org/hr/ess/requests" },
      { label: "Kehadiran ESS", path: "/org/hr/ess/attendance" },
      { label: "Dokumen ESS", path: "/org/hr/ess/documents" },
      { label: "Profil ESS", path: "/org/hr/ess/profile" },
    ],
  },
];

export default function AdminHRPolicies() {
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [isTenantPanelLoading, setIsTenantPanelLoading] = useState(true);
  const [isSavingReview360, setIsSavingReview360] = useState(false);
  const [isTrainingDialogOpen, setIsTrainingDialogOpen] = useState(false);
  const [isSavingTrainingProgram, setIsSavingTrainingProgram] = useState(false);
  const [editingTrainingProgramId, setEditingTrainingProgramId] = useState<string | null>(null);
  const [isCertificationDialogOpen, setIsCertificationDialogOpen] = useState(false);
  const [isSavingCertificationRule, setIsSavingCertificationRule] = useState(false);
  const [editingCertificationId, setEditingCertificationId] = useState<string | null>(null);
  const [isSkillDialogOpen, setIsSkillDialogOpen] = useState(false);
  const [isSavingSkillMatrixItem, setIsSavingSkillMatrixItem] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [isSavingEssPolicy, setIsSavingEssPolicy] = useState(false);
  const [review360Settings, setReview360Settings] = useState<HrReview360Settings>(DEFAULT_HR_REVIEW360_SETTINGS);
  const [essPolicySettings, setEssPolicySettings] = useState<HrEssPolicySettings>(DEFAULT_HR_ESS_POLICY_SETTINGS);
  const [trainingPrograms, setTrainingPrograms] = useState<HrTrainingProgram[]>([]);
  const [trainingForm, setTrainingForm] = useState<HrTrainingProgram>(INITIAL_TRAINING_PROGRAM);
  const [certificationRules, setCertificationRules] = useState<HrCertificationRule[]>([]);
  const [certificationForm, setCertificationForm] = useState<HrCertificationRule>(INITIAL_CERTIFICATION_RULE);
  const [skillMatrixItems, setSkillMatrixItems] = useState<HrSkillMatrixItem[]>([]);
  const [skillMatrixForm, setSkillMatrixForm] = useState<HrSkillMatrixItem>(INITIAL_SKILL_MATRIX_ITEM);
  const [tenantSnapshot, setTenantSnapshot] = useState<TenantPolicySnapshot>({
    kpiCount: 0,
    periodCount: 0,
    formCount: 0,
    trainingCount: 0,
    certificationCount: 0,
    skillMatrixCount: 0,
  });

  const selectedTenant = tenantOptions.find((tenant) => tenant.id === selectedTenantId) || null;
  const visibleTrainingPrograms = [...trainingPrograms].reverse();
  const visibleCertificationRules = [...certificationRules].reverse();
  const visibleSkillMatrixItems = [...skillMatrixItems].reverse();

  const totalOrgTargets = POLICY_DOMAINS.reduce((sum, domain) => sum + domain.orgTargets.length, 0);
  const activeOrgTargets = POLICY_DOMAINS.reduce(
    (sum, domain) => sum + domain.orgTargets.filter((target) => getHrRoutePolicy(target.path).status === "tampil").length,
    0,
  );
  const nonFinalOrgTargets = totalOrgTargets - activeOrgTargets;

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("id, name, code")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(200);

        if (error) throw error;

        const tenants = (data || []) as TenantOption[];
        setTenantOptions(tenants);
        if (tenants.length > 0) {
          setSelectedTenantId((current) => current || tenants[0].id);
        } else {
          setIsTenantPanelLoading(false);
        }
      } catch (error) {
        const ref = reportError(error, "admin.hr.policies.tenants");
        toast.error(appendErrorReference("Gagal memuat tenant HR", ref));
        setIsTenantPanelLoading(false);
      }
    };

    void loadTenants();
  }, []);

  useEffect(() => {
    if (!selectedTenantId) return;

    const loadTenantPanel = async () => {
      setIsTenantPanelLoading(true);
      try {
        const [kpis, periods, forms, review360, trainingPrograms, certifications, skillMatrix, essPolicy] = await Promise.all([
          fetchTenantHrPerformanceKpis(selectedTenantId),
          fetchTenantHrPerformancePeriods(selectedTenantId),
          fetchTenantHrPerformanceForms(selectedTenantId),
          fetchTenantHrReview360Settings(selectedTenantId),
          fetchTenantHrTrainingPrograms(selectedTenantId),
          fetchTenantHrCertificationRules(selectedTenantId),
          fetchTenantHrSkillMatrixItems(selectedTenantId),
          fetchTenantHrEssPolicySettings(selectedTenantId),
        ]);

        setTenantSnapshot({
          kpiCount: kpis.length,
          periodCount: periods.length,
          formCount: forms.length,
          trainingCount: trainingPrograms.length,
          certificationCount: certifications.length,
          skillMatrixCount: skillMatrix.length,
        });
        setReview360Settings(review360);
        setEssPolicySettings(essPolicy);
        setTrainingPrograms(trainingPrograms);
        setCertificationRules(certifications);
        setSkillMatrixItems(skillMatrix);
      } catch (error) {
        const ref = reportError(error, "admin.hr.policies.tenant-panel");
        toast.error(appendErrorReference("Gagal memuat panel kebijakan tenant HR", ref));
      } finally {
        setIsTenantPanelLoading(false);
      }
    };

    void loadTenantPanel();
  }, [selectedTenantId]);

  const handleTenantChange = (tenantId: string) => {
    setIsTenantPanelLoading(true);
    setSelectedTenantId(tenantId);
  };

  const handleSaveReview360 = async () => {
    if (!selectedTenantId) return;

    setIsSavingReview360(true);
    try {
      await saveTenantHrReview360Settings(selectedTenantId, review360Settings);
      toast.success("Acuan bawaan Ulasan 360 berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.save-review360");
      toast.error(appendErrorReference("Gagal menyimpan acuan bawaan Ulasan 360", ref));
    } finally {
      setIsSavingReview360(false);
    }
  };

  const handleSaveEssPolicy = async () => {
    if (!selectedTenantId) return;

    setIsSavingEssPolicy(true);
    try {
      await saveTenantHrEssPolicySettings(selectedTenantId, essPolicySettings);
      toast.success("Acuan bawaan ESS berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.save-ess");
      toast.error(appendErrorReference("Gagal menyimpan acuan bawaan ESS", ref));
    } finally {
      setIsSavingEssPolicy(false);
    }
  };

  const openTrainingDialog = (program?: HrTrainingProgram) => {
    if (program) {
      setEditingTrainingProgramId(program.id);
      setTrainingForm(program);
    } else {
      setEditingTrainingProgramId(null);
      setTrainingForm(INITIAL_TRAINING_PROGRAM);
    }
    setIsTrainingDialogOpen(true);
  };

  const handleSaveTrainingProgram = async () => {
    if (!selectedTenantId) return;
    if (!trainingForm.name.trim()) {
      toast.error("Nama program pelatihan wajib diisi.");
      return;
    }

    setIsSavingTrainingProgram(true);
    try {
      const nextProgram: HrTrainingProgram = {
        ...trainingForm,
        id: editingTrainingProgramId || crypto.randomUUID(),
        name: trainingForm.name.trim(),
        category: trainingForm.category.trim() || "Umum",
        provider: trainingForm.provider.trim() || "Internal",
        notes: trainingForm.notes.trim(),
      };

      const nextPrograms = editingTrainingProgramId
        ? trainingPrograms.map((item) => (item.id === editingTrainingProgramId ? nextProgram : item))
        : [...trainingPrograms, nextProgram];

      await saveTenantHrTrainingPrograms(selectedTenantId, nextPrograms);
      setTrainingPrograms(nextPrograms);
      setTenantSnapshot((prev) => ({
        ...prev,
        trainingCount: nextPrograms.length,
      }));
      setIsTrainingDialogOpen(false);
      toast.success(`Program pelatihan berhasil ${editingTrainingProgramId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.save-training");
      toast.error(appendErrorReference("Gagal menyimpan acuan bawaan pelatihan", ref));
    } finally {
      setIsSavingTrainingProgram(false);
    }
  };

  const handleDeleteTrainingProgram = async (program: HrTrainingProgram) => {
    if (!selectedTenantId) return;
    if (!confirm(`Hapus program "${program.name}"?`)) return;

    try {
      const nextPrograms = trainingPrograms.filter((item) => item.id !== program.id);
      await saveTenantHrTrainingPrograms(selectedTenantId, nextPrograms);
      setTrainingPrograms(nextPrograms);
      setTenantSnapshot((prev) => ({
        ...prev,
        trainingCount: nextPrograms.length,
      }));
      toast.success("Program pelatihan berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.delete-training", { training_id: program.id });
      toast.error(appendErrorReference("Gagal menghapus acuan bawaan pelatihan", ref));
    }
  };

  const openCertificationDialog = (rule?: HrCertificationRule) => {
    if (rule) {
      setEditingCertificationId(rule.id);
      setCertificationForm(rule);
    } else {
      setEditingCertificationId(null);
      setCertificationForm(INITIAL_CERTIFICATION_RULE);
    }
    setIsCertificationDialogOpen(true);
  };

  const handleSaveCertificationRule = async () => {
    if (!selectedTenantId) return;
    if (!certificationForm.name.trim()) {
      toast.error("Nama sertifikasi wajib diisi.");
      return;
    }

    setIsSavingCertificationRule(true);
    try {
      const nextRule: HrCertificationRule = {
        ...certificationForm,
        id: editingCertificationId || crypto.randomUUID(),
        name: certificationForm.name.trim(),
        targetRole: certificationForm.targetRole.trim() || "Semua Peran",
        issuer: certificationForm.issuer.trim() || "Lembaga Internal",
      };

      const nextRules = editingCertificationId
        ? certificationRules.map((item) => (item.id === editingCertificationId ? nextRule : item))
        : [...certificationRules, nextRule];

      await saveTenantHrCertificationRules(selectedTenantId, nextRules);
      setCertificationRules(nextRules);
      setTenantSnapshot((prev) => ({
        ...prev,
        certificationCount: nextRules.length,
      }));
      setIsCertificationDialogOpen(false);
      toast.success(`Aturan sertifikasi berhasil ${editingCertificationId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.save-certification");
      toast.error(appendErrorReference("Gagal menyimpan acuan bawaan sertifikasi", ref));
    } finally {
      setIsSavingCertificationRule(false);
    }
  };

  const handleDeleteCertificationRule = async (rule: HrCertificationRule) => {
    if (!selectedTenantId) return;
    if (!confirm(`Hapus sertifikasi "${rule.name}"?`)) return;

    try {
      const nextRules = certificationRules.filter((item) => item.id !== rule.id);
      await saveTenantHrCertificationRules(selectedTenantId, nextRules);
      setCertificationRules(nextRules);
      setTenantSnapshot((prev) => ({
        ...prev,
        certificationCount: nextRules.length,
      }));
      toast.success("Aturan sertifikasi berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.delete-certification", { certification_id: rule.id });
      toast.error(appendErrorReference("Gagal menghapus acuan bawaan sertifikasi", ref));
    }
  };

  const openSkillDialog = (item?: HrSkillMatrixItem) => {
    if (item) {
      setEditingSkillId(item.id);
      setSkillMatrixForm(item);
    } else {
      setEditingSkillId(null);
      setSkillMatrixForm(INITIAL_SKILL_MATRIX_ITEM);
    }
    setIsSkillDialogOpen(true);
  };

  const handleSaveSkillMatrixItem = async () => {
    if (!selectedTenantId) return;
    if (!skillMatrixForm.skillName.trim()) {
      toast.error("Nama skill wajib diisi.");
      return;
    }

    setIsSavingSkillMatrixItem(true);
    try {
      const nextItem: HrSkillMatrixItem = {
        ...skillMatrixForm,
        id: editingSkillId || crypto.randomUUID(),
        skillName: skillMatrixForm.skillName.trim(),
        targetFunction: skillMatrixForm.targetFunction.trim() || "Umum",
        linkedTraining: skillMatrixForm.linkedTraining.trim() || "-",
      };

      const nextItems = editingSkillId
        ? skillMatrixItems.map((item) => (item.id === editingSkillId ? nextItem : item))
        : [...skillMatrixItems, nextItem];

      await saveTenantHrSkillMatrixItems(selectedTenantId, nextItems);
      setSkillMatrixItems(nextItems);
      setTenantSnapshot((prev) => ({
        ...prev,
        skillMatrixCount: nextItems.length,
      }));
      setIsSkillDialogOpen(false);
      toast.success(`Skill matrix berhasil ${editingSkillId ? "diperbarui" : "ditambahkan"}.`);
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.save-skill-matrix");
      toast.error(appendErrorReference("Gagal menyimpan acuan bawaan matriks keahlian", ref));
    } finally {
      setIsSavingSkillMatrixItem(false);
    }
  };

  const handleDeleteSkillMatrixItem = async (item: HrSkillMatrixItem) => {
    if (!selectedTenantId) return;
    if (!confirm(`Hapus skill "${item.skillName}"?`)) return;

    try {
      const nextItems = skillMatrixItems.filter((row) => row.id !== item.id);
      await saveTenantHrSkillMatrixItems(selectedTenantId, nextItems);
      setSkillMatrixItems(nextItems);
      setTenantSnapshot((prev) => ({
        ...prev,
        skillMatrixCount: nextItems.length,
      }));
      toast.success("Skill matrix berhasil dihapus.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.policies.delete-skill-matrix", { skill_id: item.id });
      toast.error(appendErrorReference("Gagal menghapus acuan bawaan matriks keahlian", ref));
    }
  };

  return (
    <AdminHRPageShell
      title="Kebijakan HR"
      subtitle="Acuan bawaan kebijakan lintas tenant"
      description="Pusat kontrol kebijakan HR untuk membaca domain aktif, melihat status rute org, dan masuk ke titik kontrol admin yang relevan."
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Domain Kebijakan</CardTitle>
              <CardDescription>Blok kebijakan aktif yang saat ini dipantau admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{POLICY_DOMAINS.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rute Org Aktif</CardTitle>
              <CardDescription>Target org yang sudah tampil sebagai halaman kerja.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{activeOrgTargets}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rute Non-Final</CardTitle>
              <CardDescription>Alias atau rute internal yang masih butuh konteks admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{nonFinalOrgTargets}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Kontrol Domain Tenant</CardTitle>
            <CardDescription>
              Panel sadar-tenant untuk mengubah acuan bawaan kinerja dan membaca kesiapan pelatihan serta ESS tanpa keluar dari kebijakan admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[280px,1fr]">
              <div className="space-y-2">
                <Label htmlFor="tenant-policy-selector">Tenant HR</Label>
                <Select value={selectedTenantId} onValueChange={handleTenantChange} disabled={tenantOptions.length === 0}>
                  <SelectTrigger id="tenant-policy-selector">
                    <SelectValue placeholder="Pilih tenant HR" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantOptions.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Gunakan tenant ini untuk membaca snapshot acuan bawaan aktif dan mengubah pengaturan Ulasan 360.
                </p>
                <div
                  data-testid="admin-hr-policy-selected-tenant"
                  className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                >
                  {selectedTenant
                    ? `Tenant aktif: ${selectedTenant.name} (${selectedTenant.code})`
                    : "Tenant aktif: belum dipilih"}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Acuan Bawaan Ulasan 360</CardTitle>
                    <CardDescription>Editor ringan untuk bobot ulasan dan aturan umpan balik per tenant.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 grid-cols-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">KPI</p>
                        <p className="mt-2 text-xl font-semibold">{tenantSnapshot.kpiCount}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Periode</p>
                        <p className="mt-2 text-xl font-semibold">{tenantSnapshot.periodCount}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Form</p>
                        <p className="mt-2 text-xl font-semibold">{tenantSnapshot.formCount}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">Aktifkan Ulasan 360</p>
                        <p className="text-sm text-muted-foreground">Menjadikan Ulasan 360 sebagai acuan bawaan evaluasi tenant.</p>
                      </div>
                      <Switch
                        data-testid="admin-hr-policy-review360-enabled"
                        checked={review360Settings.enabled}
                        onCheckedChange={(checked) => setReview360Settings((prev) => ({ ...prev, enabled: checked }))}
                        disabled={isTenantPanelLoading}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">Umpan Balik Anonim</p>
                        <p className="text-sm text-muted-foreground">Aktifkan anonimitas untuk penilai rekan dan bawahan.</p>
                      </div>
                      <Switch
                        data-testid="admin-hr-policy-review360-anonymous"
                        checked={review360Settings.anonymousFeedback}
                        onCheckedChange={(checked) =>
                          setReview360Settings((prev) => ({ ...prev, anonymousFeedback: checked }))
                        }
                        disabled={isTenantPanelLoading}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="review360-peer-count">Minimal Penilai Rekan</Label>
                        <Input
                          id="review360-peer-count"
                          data-testid="admin-hr-policy-review360-peer-count"
                          type="number"
                          min={0}
                          value={review360Settings.minPeerReviewers}
                          onChange={(event) =>
                            setReview360Settings((prev) => ({
                              ...prev,
                              minPeerReviewers: Number(event.target.value || 0),
                            }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="review360-manager-weight">Bobot Manajer (%)</Label>
                        <Input
                          id="review360-manager-weight"
                          data-testid="admin-hr-policy-review360-manager-weight"
                          type="number"
                          min={0}
                          max={100}
                          value={review360Settings.managerWeight}
                          onChange={(event) =>
                            setReview360Settings((prev) => ({
                              ...prev,
                              managerWeight: Number(event.target.value || 0),
                            }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="review360-peer-weight">Bobot Rekan (%)</Label>
                        <Input
                          id="review360-peer-weight"
                          type="number"
                          min={0}
                          max={100}
                          value={review360Settings.peerWeight}
                          onChange={(event) =>
                            setReview360Settings((prev) => ({
                              ...prev,
                              peerWeight: Number(event.target.value || 0),
                            }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="review360-self-weight">Bobot Penilaian Diri (%)</Label>
                        <Input
                          id="review360-self-weight"
                          type="number"
                          min={0}
                          max={100}
                          value={review360Settings.selfWeight}
                          onChange={(event) =>
                            setReview360Settings((prev) => ({
                              ...prev,
                              selfWeight: Number(event.target.value || 0),
                            }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>
                    </div>

                    <Button
                      data-testid="admin-hr-policy-save-review360"
                      onClick={handleSaveReview360}
                      disabled={!selectedTenantId || isSavingReview360 || isTenantPanelLoading}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Simpan Acuan Bawaan Ulasan 360
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Kesiapan Pelatihan</CardTitle>
                    <CardDescription>Snapshot tenant untuk program pelatihan, sertifikasi, dan matriks keahlian.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 grid-cols-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Program</p>
                        <p className="mt-2 text-xl font-semibold">{tenantSnapshot.trainingCount}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Sertifikasi</p>
                        <p className="mt-2 text-xl font-semibold">{tenantSnapshot.certificationCount}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Skill Matrix</p>
                        <p className="mt-2 text-xl font-semibold">{tenantSnapshot.skillMatrixCount}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="font-medium">Arah Admin</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Gunakan snapshot ini untuk menilai apakah tenant butuh intervensi di acuan bawaan pelatihan atau cukup diawasi lewat audit.
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Program Pelatihan Tenant</p>
                        <p className="text-xs text-muted-foreground">Editor ringan ini memakai acuan bawaan yang sama dengan area kerja organisasi. Item terbaru ditampilkan paling atas.</p>
                      </div>
                      <Button size="sm" data-testid="admin-hr-policy-add-training" onClick={() => openTrainingDialog()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Tambah Program
                      </Button>
                    </div>
                    {trainingPrograms.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Belum ada program pelatihan untuk tenant ini.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Program</TableHead>
                            <TableHead>Durasi</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-24">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleTrainingPrograms.map((program) => (
                            <TableRow key={program.id} data-testid={`admin-hr-policy-training-row-${program.id}`}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="font-medium">{program.name}</div>
                                  <div className="text-xs text-muted-foreground">{program.provider}</div>
                                </div>
                              </TableCell>
                              <TableCell>{program.durationHours} jam</TableCell>
                              <TableCell>{program.participantTarget} orang</TableCell>
                              <TableCell>
                                <Badge variant={program.status === "running" ? "default" : "secondary"}>
                                  {program.status === "planned"
                                    ? "Terjadwal"
                                    : program.status === "running"
                                      ? "Berjalan"
                                      : program.status === "completed"
                                        ? "Selesai"
                                        : "Draf"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`admin-hr-policy-training-edit-${program.id}`}
                                    onClick={() => openTrainingDialog(program)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`admin-hr-policy-training-delete-${program.id}`}
                                    onClick={() => void handleDeleteTrainingProgram(program)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Aturan Sertifikasi Tenant</p>
                        <p className="text-xs text-muted-foreground">Editor ringan ini menyimpan acuan bawaan sertifikasi tenant di sumber data yang sama. Item terbaru ditampilkan paling atas.</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="admin-hr-policy-add-certification"
                        onClick={() => openCertificationDialog()}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Tambah Sertifikasi
                      </Button>
                    </div>
                    {certificationRules.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Belum ada aturan sertifikasi untuk tenant ini.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sertifikasi</TableHead>
                            <TableHead>Peran</TableHead>
                            <TableHead>Validitas</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-24">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleCertificationRules.map((rule) => (
                            <TableRow key={rule.id} data-testid={`admin-hr-policy-certification-row-${rule.id}`}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="font-medium">{rule.name}</div>
                                  <div className="text-xs text-muted-foreground">{rule.issuer}</div>
                                </div>
                              </TableCell>
                              <TableCell>{rule.targetRole}</TableCell>
                              <TableCell>{rule.validityMonths} bulan</TableCell>
                              <TableCell>
                                <Badge variant={rule.mandatory ? "default" : "secondary"}>
                                  {rule.mandatory ? "Wajib" : "Opsional"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`admin-hr-policy-certification-edit-${rule.id}`}
                                    onClick={() => openCertificationDialog(rule)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`admin-hr-policy-certification-delete-${rule.id}`}
                                    onClick={() => void handleDeleteCertificationRule(rule)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Skill Matrix Tenant</p>
                        <p className="text-xs text-muted-foreground">Editor ringan ini menyimpan acuan bawaan matriks keahlian tenant di sumber data yang sama. Item terbaru ditampilkan paling atas.</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="admin-hr-policy-add-skill"
                        onClick={() => openSkillDialog()}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Tambah Skill
                      </Button>
                    </div>
                    {skillMatrixItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Belum ada item skill matrix untuk tenant ini.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Skill</TableHead>
                            <TableHead>Fungsi</TableHead>
                            <TableHead>Cakupan</TableHead>
                            <TableHead>Gap</TableHead>
                            <TableHead className="w-24">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleSkillMatrixItems.map((item) => (
                            <TableRow key={item.id} data-testid={`admin-hr-policy-skill-row-${item.id}`}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="font-medium">{item.skillName}</div>
                                  <div className="text-xs text-muted-foreground">{item.linkedTraining}</div>
                                </div>
                              </TableCell>
                              <TableCell>{item.targetFunction}</TableCell>
                              <TableCell>{item.currentCoverage}%</TableCell>
                              <TableCell>{item.gapCount}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`admin-hr-policy-skill-edit-${item.id}`}
                                    onClick={() => openSkillDialog(item)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`admin-hr-policy-skill-delete-${item.id}`}
                                    onClick={() => void handleDeleteSkillMatrixItem(item)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/admin/hr/audit">Buka Audit HR</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/admin/hr/settings#coverage-map">Buka Matriks Cakupan</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Kontrol ESS</CardTitle>
                    <CardDescription>Kontrol acuan bawaan layanan mandiri yang harus stabil di tenant terpilih.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">Pengajuan ESS</p>
                          <p className="text-sm text-muted-foreground">Menampilkan ringkasan pengajuan mandiri lintas modul.</p>
                        </div>
                        <Switch
                          data-testid="admin-hr-policy-ess-requests"
                          checked={essPolicySettings.enableRequestsOverview}
                          onCheckedChange={(checked) =>
                            setEssPolicySettings((prev) => ({ ...prev, enableRequestsOverview: checked }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">Kehadiran ESS</p>
                          <p className="text-sm text-muted-foreground">Kontrol visibilitas riwayat kehadiran pribadi untuk akun yang terhubung.</p>
                        </div>
                        <Switch
                          data-testid="admin-hr-policy-ess-attendance"
                          checked={essPolicySettings.enableAttendanceView}
                          onCheckedChange={(checked) =>
                            setEssPolicySettings((prev) => ({ ...prev, enableAttendanceView: checked }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">Dokumen ESS</p>
                          <p className="text-sm text-muted-foreground">Kontrol tampilan arsip dokumen personal di layanan mandiri.</p>
                        </div>
                        <Switch
                          data-testid="admin-hr-policy-ess-documents"
                          checked={essPolicySettings.enableDocumentsView}
                          onCheckedChange={(checked) =>
                            setEssPolicySettings((prev) => ({ ...prev, enableDocumentsView: checked }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">Profil ESS</p>
                          <p className="text-sm text-muted-foreground">Kontrol akses ringkasan profil pribadi di tenant aktif.</p>
                        </div>
                        <Switch
                          data-testid="admin-hr-policy-ess-profile"
                          checked={essPolicySettings.enableProfileView}
                          onCheckedChange={(checked) =>
                            setEssPolicySettings((prev) => ({ ...prev, enableProfileView: checked }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="ess-lookback-days">Jangkauan Riwayat Kehadiran (hari)</Label>
                        <Input
                          id="ess-lookback-days"
                          data-testid="admin-hr-policy-ess-lookback-days"
                          type="number"
                          min={1}
                          max={90}
                          value={essPolicySettings.attendanceLookbackDays}
                          onChange={(event) =>
                            setEssPolicySettings((prev) => ({
                              ...prev,
                              attendanceLookbackDays: Number(event.target.value) || 1,
                            }))
                          }
                          disabled={isTenantPanelLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Sumber Dokumen ESS</Label>
                        <Select
                          value={essPolicySettings.documentSource}
                          onValueChange={(value) =>
                            setEssPolicySettings((prev) => ({
                              ...prev,
                              documentSource: value as HrEssPolicySettings["documentSource"],
                            }))
                          }
                          disabled={isTenantPanelLoading}
                        >
                          <SelectTrigger data-testid="admin-hr-policy-ess-document-source">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Kontrak Kerja">Kontrak Kerja</SelectItem>
                            <SelectItem value="Dokumen HR">Dokumen HR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">Kontak Profil Dapat Diedit</p>
                        <p className="text-sm text-muted-foreground">Menentukan apakah kontak profil ESS boleh diarahkan ke mode edit.</p>
                      </div>
                      <Switch
                        data-testid="admin-hr-policy-ess-profile-editable-contact"
                        checked={essPolicySettings.profileEditableContact}
                        onCheckedChange={(checked) =>
                          setEssPolicySettings((prev) => ({ ...prev, profileEditableContact: checked }))
                        }
                        disabled={isTenantPanelLoading}
                      />
                    </div>

                    <Button
                      data-testid="admin-hr-policy-save-ess"
                      onClick={handleSaveEssPolicy}
                      disabled={!selectedTenantId || isSavingEssPolicy || isTenantPanelLoading}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Simpan Acuan Bawaan ESS
                    </Button>

                    {[
                      { label: "Pengajuan ESS", path: "/org/hr/ess/requests" },
                      { label: "Cuti & Izin ESS", path: "/org/hr/ess/leave-requests" },
                      { label: "Kehadiran ESS", path: "/org/hr/ess/attendance" },
                      { label: "Dokumen ESS", path: "/org/hr/ess/documents" },
                      { label: "Profil ESS", path: "/org/hr/ess/profile" },
                    ].map((item) => (
                      <div key={item.path} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{item.label}</p>
                          <Badge variant={getRouteStatusVariant(item.path)}>{getRouteStatusLabel(item.path)}</Badge>
                        </div>
                        <p className="mt-2 font-mono text-xs text-muted-foreground">{item.path}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isTrainingDialogOpen} onOpenChange={setIsTrainingDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingTrainingProgramId ? "Edit Program Pelatihan" : "Tambah Program Pelatihan"}</DialogTitle>
              <DialogDescription>
                Program yang disimpan di sini langsung menjadi acuan bawaan tenant untuk domain pelatihan di area kerja HR.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="admin-training-name">Nama Program</Label>
                <Input
                  id="admin-training-name"
                  value={trainingForm.name}
                  onChange={(event) => setTrainingForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-training-category">Kategori</Label>
                <Input
                  id="admin-training-category"
                  value={trainingForm.category}
                  onChange={(event) => setTrainingForm((prev) => ({ ...prev, category: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-training-provider">Penyedia</Label>
                <Input
                  id="admin-training-provider"
                  value={trainingForm.provider}
                  onChange={(event) => setTrainingForm((prev) => ({ ...prev, provider: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-training-duration">Durasi (jam)</Label>
                <Input
                  id="admin-training-duration"
                  type="number"
                  min={1}
                  value={trainingForm.durationHours}
                  onChange={(event) =>
                    setTrainingForm((prev) => ({ ...prev, durationHours: Number(event.target.value) || 1 }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-training-target">Target Peserta</Label>
                <Input
                  id="admin-training-target"
                  type="number"
                  min={1}
                  value={trainingForm.participantTarget}
                  onChange={(event) =>
                    setTrainingForm((prev) => ({ ...prev, participantTarget: Number(event.target.value) || 1 }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Status</Label>
                <Select
                  value={trainingForm.status}
                  onValueChange={(value) =>
                    setTrainingForm((prev) => ({ ...prev, status: value as HrTrainingProgram["status"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draf</SelectItem>
                    <SelectItem value="planned">Terjadwal</SelectItem>
                    <SelectItem value="running">Berjalan</SelectItem>
                    <SelectItem value="completed">Selesai</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="admin-training-notes">Catatan</Label>
                <Textarea
                  id="admin-training-notes"
                  rows={3}
                  value={trainingForm.notes}
                  onChange={(event) => setTrainingForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTrainingDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSaveTrainingProgram} disabled={isSavingTrainingProgram || !selectedTenantId}>
                <BookOpen className="mr-2 h-4 w-4" />
                Simpan Program
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isCertificationDialogOpen} onOpenChange={setIsCertificationDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCertificationId ? "Edit Sertifikasi" : "Tambah Sertifikasi"}</DialogTitle>
              <DialogDescription>
                Sertifikasi yang disimpan di sini langsung menjadi acuan bawaan tenant untuk domain pengembangan SDM.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="admin-cert-name">Nama Sertifikasi</Label>
                <Input
                  id="admin-cert-name"
                  value={certificationForm.name}
                  onChange={(event) => setCertificationForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-cert-role">Peran Target</Label>
                <Input
                  id="admin-cert-role"
                  value={certificationForm.targetRole}
                  onChange={(event) => setCertificationForm((prev) => ({ ...prev, targetRole: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-cert-issuer">Penerbit</Label>
                <Input
                  id="admin-cert-issuer"
                  value={certificationForm.issuer}
                  onChange={(event) => setCertificationForm((prev) => ({ ...prev, issuer: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-cert-validity">Validitas (bulan)</Label>
                <Input
                  id="admin-cert-validity"
                  type="number"
                  min={1}
                  value={certificationForm.validityMonths}
                  onChange={(event) =>
                    setCertificationForm((prev) => ({ ...prev, validityMonths: Number(event.target.value) || 1 }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-cert-reminder">Reminder (hari)</Label>
                <Input
                  id="admin-cert-reminder"
                  type="number"
                  min={1}
                  value={certificationForm.reminderDays}
                  onChange={(event) =>
                    setCertificationForm((prev) => ({ ...prev, reminderDays: Number(event.target.value) || 1 }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                <div>
                  <div className="text-sm font-medium">Wajib untuk role target</div>
                  <div className="text-xs text-muted-foreground">Gunakan untuk sertifikasi yang wajib dipenuhi tenant.</div>
                </div>
                <Switch
                  checked={certificationForm.mandatory}
                  onCheckedChange={(checked) => setCertificationForm((prev) => ({ ...prev, mandatory: checked }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCertificationDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSaveCertificationRule} disabled={isSavingCertificationRule || !selectedTenantId}>
                <Save className="mr-2 h-4 w-4" />
                Simpan Sertifikasi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isSkillDialogOpen} onOpenChange={setIsSkillDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingSkillId ? "Edit Skill Matrix" : "Tambah Skill Matrix"}</DialogTitle>
              <DialogDescription>
                Matriks keahlian yang disimpan di sini langsung menjadi acuan bawaan tenant untuk domain pengembangan SDM.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="admin-skill-name">Nama Skill</Label>
                <Input
                  id="admin-skill-name"
                  value={skillMatrixForm.skillName}
                  onChange={(event) => setSkillMatrixForm((prev) => ({ ...prev, skillName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-skill-function">Fungsi Target</Label>
                <Input
                  id="admin-skill-function"
                  value={skillMatrixForm.targetFunction}
                  onChange={(event) => setSkillMatrixForm((prev) => ({ ...prev, targetFunction: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Level Minimal</Label>
                <Select
                  value={skillMatrixForm.requiredLevel}
                  onValueChange={(value) =>
                    setSkillMatrixForm((prev) => ({ ...prev, requiredLevel: value as HrSkillMatrixItem["requiredLevel"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dasar">Dasar</SelectItem>
                    <SelectItem value="Menengah">Menengah</SelectItem>
                    <SelectItem value="Mahir">Mahir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-skill-coverage">Cakupan Saat Ini (%)</Label>
                <Input
                  id="admin-skill-coverage"
                  type="number"
                  min={0}
                  max={100}
                  value={skillMatrixForm.currentCoverage}
                  onChange={(event) =>
                    setSkillMatrixForm((prev) => ({ ...prev, currentCoverage: Number(event.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-skill-gap">Gap Pegawai</Label>
                <Input
                  id="admin-skill-gap"
                  type="number"
                  min={0}
                  value={skillMatrixForm.gapCount}
                  onChange={(event) =>
                    setSkillMatrixForm((prev) => ({ ...prev, gapCount: Number(event.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="admin-skill-linked-training">Pelatihan Terkait</Label>
                <Input
                  id="admin-skill-linked-training"
                  value={skillMatrixForm.linkedTraining}
                  onChange={(event) => setSkillMatrixForm((prev) => ({ ...prev, linkedTraining: event.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSkillDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSaveSkillMatrixItem} disabled={isSavingSkillMatrixItem || !selectedTenantId}>
                <Save className="mr-2 h-4 w-4" />
                Simpan Skill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {POLICY_DOMAINS.map((domain) => (
          <Card key={domain.title}>
            <CardHeader className="space-y-3">
              {(() => {
                const activeCount = domain.orgTargets.filter((target) => getHrRoutePolicy(target.path).status === "tampil").length;
                const nonFinalCount = domain.orgTargets.length - activeCount;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Acuan Bawaan Aktif</Badge>
                    <Badge variant={getDomainReadinessVariant(nonFinalCount)}>
                      {nonFinalCount === 0 ? "Siap Operasional" : `${nonFinalCount} Rute Non-Final`}
                    </Badge>
                  </div>
                );
              })()}
              <CardTitle>{domain.title}</CardTitle>
              <CardDescription>{domain.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const activeCount = domain.orgTargets.filter((target) => getHrRoutePolicy(target.path).status === "tampil").length;
                const nonFinalCount = domain.orgTargets.length - activeCount;
                return (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Aktif</p>
                      <p className="mt-2 text-2xl font-semibold">{activeCount}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rute Non-Final</p>
                      <p className="mt-2 text-2xl font-semibold">{nonFinalCount}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arah Admin</p>
                      <p className="mt-2 text-sm text-muted-foreground">{domain.readinessNote}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fokus Admin</p>
                <div className="flex flex-wrap gap-2">
                  {domain.adminFocus.map((focus) => (
                    <Badge key={focus} variant="outline">
                      {focus}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Titik Kontrol Admin</p>
                <div className="flex flex-wrap gap-2">
                  {domain.adminTargets.map((target) => (
                    <Button key={target.path} asChild variant="outline" size="sm">
                      <Link to={target.path}>{target.label}</Link>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Org</p>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {domain.orgTargets.map((target) => (
                    <div key={target.path} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{target.label}</p>
                        <Badge variant={getRouteStatusVariant(target.path)}>{getRouteStatusLabel(target.path)}</Badge>
                      </div>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">{target.path}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminHRPageShell>
  );
}
