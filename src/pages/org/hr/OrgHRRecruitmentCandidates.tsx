import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Search, Trash2, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { logAuditIfEnabled } from "@/lib/auditLoggingPolicy";
import {
  buildInvitationLink,
  ensureIndividualEmployeeInvitation,
  logEmployeeInvitationFlowAudit,
} from "@/lib/employeeInvitations";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

type CandidateStage = "applied" | "screening" | "interview" | "offered" | "hired" | "rejected";

type CandidateRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  stage: CandidateStage;
  status: string;
  job_id: string | null;
  hired_employee_id: string | null;
  metadata: {
    onboarding_invitation_id?: string;
    onboarding_invitation_code?: string;
    onboarding_converted_at?: string;
  } | null;
  created_at: string;
};

type JobOption = {
  id: string;
  title: string;
};

type CandidateForm = {
  full_name: string;
  email: string;
  phone: string;
  job_id: string;
  stage: CandidateStage;
  status: "active" | "hold" | "withdrawn" | "hired" | "rejected";
};

const INITIAL_FORM: CandidateForm = {
  full_name: "",
  email: "",
  phone: "",
  job_id: "none",
  stage: "applied",
  status: "active",
};

const PAGE_SIZE = 10;

function getCandidateStageLabel(stage: CandidateStage): string {
  if (stage === "applied") return "Melamar";
  if (stage === "screening") return "Penyaringan";
  if (stage === "interview") return "Wawancara";
  if (stage === "offered") return "Penawaran";
  if (stage === "hired") return "Diterima";
  return "Ditolak";
}

function getCandidateStatusLabel(status: CandidateForm["status"] | string): string {
  if (status === "active") return "Aktif";
  if (status === "hold") return "Ditunda";
  if (status === "withdrawn") return "Mengundurkan Diri";
  if (status === "hired") return "Diterima";
  if (status === "rejected") return "Ditolak";
  return status;
}

export default function OrgHRRecruitmentCandidates() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CandidateForm>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [isConvertingId, setIsConvertingId] = useState<string | null>(null);
  const [inviteDialog, setInviteDialog] = useState<{ open: boolean; name: string; code: string | null }>({
    open: false,
    name: "",
    code: null,
  });
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const confirmDialog = useConfirmDialog();
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/recruitment/candidates");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const keyword = search.trim();
      let candidatesQuery = supabase
        .from("hr_recruitment_candidates")
        .select("id, full_name, email, phone, stage, status, job_id, hired_employee_id, metadata, created_at", { count: "exact" })
        .eq("tenant_id", resolvedTenantId)
        .order("created_at", { ascending: false });

      if (keyword) {
        const escapedKeyword = keyword.replace(/[%_,]/g, "\\$&");
        candidatesQuery = candidatesQuery.or(
          `full_name.ilike.%${escapedKeyword}%,email.ilike.%${escapedKeyword}%,phone.ilike.%${escapedKeyword}%`,
        );
      }

      const [{ data: jobsData, error: jobsError }, { data: filteredCandidates, error: filteredError, count }] = await Promise.all([
        supabase
          .from("hr_recruitment_jobs")
          .select("id, title")
          .eq("tenant_id", resolvedTenantId)
          .order("title", { ascending: true }),
        candidatesQuery.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
      ]);
      if (jobsError) throw jobsError;
      if (filteredError) throw filteredError;

      setRows((filteredCandidates || []) as CandidateRow[]);
      setJobs((jobsData || []) as JobOption[]);
      setTotalItems(count || 0);
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.candidates.fetch");
      toast.error(appendErrorReference("Gagal memuat kandidat rekrutmen", ref));
      setRows([]);
      setJobs([]);
      setTotalItems(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, search, tenantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const jobMap = useMemo(() => new Map(jobs.map((job) => [job.id, job.title])), [jobs]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const openCreate = () => {
    if (!access.canEdit) {
      toast.error("Aksi tambah kandidat hanya tersedia untuk admin organisasi.");
      return;
    }
    setEditingId(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: CandidateRow) => {
    if (!access.canEdit) {
      toast.error("Aksi ubah kandidat hanya tersedia untuk admin organisasi.");
      return;
    }
    setEditingId(row.id);
    setForm({
      full_name: row.full_name,
      email: row.email || "",
      phone: row.phone || "",
      job_id: row.job_id || "none",
      stage: row.stage,
      status: (row.status as CandidateForm["status"]) || "active",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!access.canEdit) {
      toast.error("Aksi simpan kandidat hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan.");
      return;
    }
    if (!form.full_name.trim()) {
      toast.error("Nama kandidat wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = {
        tenant_id: tenantId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        job_id: form.job_id === "none" ? null : form.job_id,
        stage: form.stage,
        status: form.status,
        updated_by: user?.id || null,
      };

      if (editingId) {
        const previousRow = rows.find((item) => item.id === editingId) || null;
        const { error } = await supabase
          .from("hr_recruitment_candidates")
          .update(payload)
          .eq("id", editingId)
          .eq("tenant_id", tenantId);
        if (error) throw error;
        const { error: auditError } = await logAuditIfEnabled({
          tenantId,
          payload: {
            tenant_id: tenantId,
            user_id: user?.id || null,
            action: "ats_candidate_update",
            table_name: "hr_recruitment_candidates",
            record_id: editingId,
            old_values: previousRow,
            new_values: payload,
          },
        });
        if (auditError) throw auditError;
        toast.success("Data kandidat berhasil diperbarui.");
      } else {
        const { data: insertedRows, error } = await supabase.from("hr_recruitment_candidates").insert({
          ...payload,
          created_by: payload.updated_by,
          applied_at: new Date().toISOString(),
        }).select("id");
        if (error) throw error;
        const { error: auditError } = await logAuditIfEnabled({
          tenantId,
          payload: {
            tenant_id: tenantId,
            user_id: user?.id || null,
            action: "ats_candidate_create",
            table_name: "hr_recruitment_candidates",
            record_id: insertedRows?.[0]?.id || null,
            old_values: null,
            new_values: payload,
          },
        });
        if (auditError) throw auditError;
        toast.success("Kandidat berhasil ditambahkan.");
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm(INITIAL_FORM);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.candidates.save", { editing_id: editingId });
      toast.error(appendErrorReference("Gagal menyimpan data kandidat", ref));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConvertToOnboarding = async (row: CandidateRow) => {
    if (!access.canEdit) {
      toast.error("Aksi konversi kandidat hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan.");
      return;
    }
    const email = row.email?.trim().toLowerCase();
    if (!email) {
      toast.error("Email kandidat wajib diisi sebelum konversi ke proses masuk.");
      return;
    }
    if (row.hired_employee_id) {
      toast.info("Kandidat ini sudah terhubung ke data pegawai.");
      return;
    }
    if (row.metadata?.onboarding_invitation_id && row.metadata?.onboarding_invitation_code) {
      setInviteDialog({
        open: true,
        name: row.full_name,
        code: row.metadata.onboarding_invitation_code,
      });
      toast.info("Undangan proses masuk sudah tersedia.");
      return;
    }

    setIsConvertingId(row.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User belum login.");

      const { data: actorEmployee, error: actorError } = await supabase
        .from("employees")
        .select("id, tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (actorError) throw actorError;

      const { data: existingEmployee, error: existingError } = await supabase
        .from("employees")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("email", email)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existingEmployee?.id) {
        const { error: updateError } = await supabase
          .from("hr_recruitment_candidates")
          .update({
            stage: "hired",
            status: "hired",
            hired_employee_id: existingEmployee.id,
            updated_by: user.id,
            metadata: {
              ...(row.metadata || {}),
              onboarding_converted_at: new Date().toISOString(),
            },
          })
          .eq("id", row.id)
          .eq("tenant_id", tenantId);
        if (updateError) throw updateError;
        const { error: auditError } = await logAuditIfEnabled({
          tenantId,
          payload: {
            tenant_id: tenantId,
            user_id: user.id,
            employee_id: existingEmployee.id,
            action: "ats_candidate_convert_existing_employee",
            table_name: "hr_recruitment_candidates",
            record_id: row.id,
            old_values: row,
            new_values: {
              stage: "hired",
              status: "hired",
              hired_employee_id: existingEmployee.id,
            },
          },
        });
        if (auditError) throw auditError;

        toast.success("Kandidat sudah menjadi pegawai aktif. Relasi berhasil diperbarui.");
        await fetchData();
        return;
      }

      const invitationResult = await ensureIndividualEmployeeInvitation({
        tenantId,
        email,
        name: row.full_name,
        nik: `ATS-${Date.now().toString().slice(-8)}`,
        phone: row.phone || null,
        invitedByEmployeeId: actorEmployee?.id || null,
      });

      try {
        await logEmployeeInvitationFlowAudit({
          tenantId,
          invitationId: invitationResult.invitation.id,
          event: invitationResult.reused ? "INVITATION_REUSE_EXISTING" : "INVITATION_CREATE_NEW",
          payload: {
            source: "org_hr_recruitment_candidates",
            candidate_id: row.id,
            candidate_email: email,
          },
        });
      } catch (auditError) {
        reportError(auditError, "org.hr.recruitment.candidates.convert.audit", { candidate_id: row.id });
      }

      const { error: updateError } = await supabase
        .from("hr_recruitment_candidates")
        .update({
          stage: "hired",
          status: "hired",
          updated_by: user.id,
          metadata: {
            ...(row.metadata || {}),
            onboarding_invitation_id: invitationResult.invitation.id,
            onboarding_invitation_code: invitationResult.invitation.invitation_code,
            onboarding_converted_at: new Date().toISOString(),
          },
        })
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (updateError) throw updateError;
      const { error: auditError } = await logAuditIfEnabled({
        tenantId,
        payload: {
          tenant_id: tenantId,
          user_id: user.id,
          action: "ats_candidate_convert_onboarding",
          table_name: "hr_recruitment_candidates",
          record_id: row.id,
          old_values: row,
          new_values: {
            stage: "hired",
            status: "hired",
            onboarding_invitation_id: invitationResult.invitation.id,
            onboarding_invitation_code: invitationResult.invitation.invitation_code,
          },
        },
      });
      if (auditError) throw auditError;

      setInviteDialog({
        open: true,
        name: row.full_name,
        code: invitationResult.invitation.invitation_code,
      });
      if (invitationResult.reused) {
        toast.info("Undangan proses masuk aktif sudah ada.");
      } else {
        toast.success("Undangan proses masuk kandidat berhasil dibuat.");
      }
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.candidates.convert", {
        candidate_id: row.id,
        candidate_email: row.email,
      });
      toast.error(appendErrorReference("Gagal mengonversi kandidat ke proses masuk", ref));
    } finally {
      setIsConvertingId(null);
    }
  };

  const handleDelete = async (row: CandidateRow) => {
    if (!access.canEdit) {
      toast.error("Aksi hapus kandidat hanya tersedia untuk admin organisasi.");
      return;
    }
    const confirmed = await confirmDialog({
      title: "Hapus Kandidat",
      description: `Kandidat "${row.full_name}" akan dihapus dari ATS.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("hr_recruitment_candidates")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const { error: auditError } = await logAuditIfEnabled({
        tenantId,
        payload: {
          tenant_id: tenantId,
          user_id: user?.id || null,
          action: "ats_candidate_delete",
          table_name: "hr_recruitment_candidates",
          record_id: row.id,
          old_values: row,
          new_values: null,
        },
      });
      if (auditError) throw auditError;
      toast.success("Kandidat berhasil dihapus.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.candidates.delete", { candidate_id: row.id });
      toast.error(appendErrorReference("Gagal menghapus kandidat", ref));
    }
  };

  const copyInviteLink = async () => {
    if (!inviteDialog.code) return;
    try {
      const link = buildInvitationLink(inviteDialog.code);
      await navigator.clipboard.writeText(link);
      setCopiedInvite(true);
      toast.success("Link undangan berhasil disalin.");
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.candidates.copy_invite_link");
      toast.error(appendErrorReference("Gagal menyalin link undangan", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Rekrutmen (ATS)</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Kandidat</h1>
          <p className="text-sm text-muted-foreground">
            Kelola kandidat dari tahap melamar hingga keputusan akhir.
          </p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "mode baca saja"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Manajemen Kandidat
            </CardTitle>
            <CardDescription>Relasi kandidat ke lowongan rekrutmen yang tersedia.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={openCreate}>
                <UserPlus className="mr-2 h-4 w-4" /> Tambah Kandidat
              </Button>
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari kandidat, email, nomor telepon, lowongan..."
                />
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat kandidat...</p>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kontak</TableHead>
                    <TableHead>Lowongan</TableHead>
                    <TableHead>Tahap</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Belum ada data kandidat.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id} data-testid={`org-hr-ats-candidate-row-${row.id}`}>
                        <TableCell>{row.full_name}</TableCell>
                        <TableCell className="text-sm">
                          <div>{row.email || "-"}</div>
                          <div className="text-muted-foreground">{row.phone || "-"}</div>
                        </TableCell>
                        <TableCell>{row.job_id ? jobMap.get(row.job_id) || "-" : "-"}</TableCell>
                        <TableCell>{getCandidateStageLabel(row.stage)}</TableCell>
                        <TableCell>{getCandidateStatusLabel(row.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                              Ubah
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void handleDelete(row)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Hapus
                            </Button>
                            {(row.stage === "hired" || row.status === "hired") && (
                              <Button
                                size="sm"
                                onClick={() => void handleConvertToOnboarding(row)}
                                disabled={isConvertingId === row.id}
                              >
                                {isConvertingId === row.id ? "Memproses..." : "Konversi ke Proses Masuk"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safePage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={PAGE_SIZE}
                itemLabel="kandidat"
                onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              />
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Ubah Kandidat" : "Tambah Kandidat"}</DialogTitle>
              <DialogDescription>Isi data dasar kandidat untuk proses ATS.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="candidate_name">Nama Lengkap</Label>
                <Input id="candidate_name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="candidate_email">Email</Label>
                  <Input id="candidate_email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="candidate_phone">Telepon</Label>
                  <Input id="candidate_phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Lowongan</Label>
                  <Select value={form.job_id} onValueChange={(value) => setForm((p) => ({ ...p, job_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih lowongan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa Lowongan</SelectItem>
                      {jobs.map((job) => (
                        <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tahap</Label>
                  <Select value={form.stage} onValueChange={(value) => setForm((p) => ({ ...p, stage: value as CandidateStage }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applied">Melamar</SelectItem>
                      <SelectItem value="screening">Penyaringan</SelectItem>
                      <SelectItem value="interview">Wawancara</SelectItem>
                      <SelectItem value="offered">Penawaran</SelectItem>
                      <SelectItem value="hired">Diterima</SelectItem>
                      <SelectItem value="rejected">Ditolak</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value as CandidateForm["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="hold">Ditunda</SelectItem>
                    <SelectItem value="withdrawn">Mengundurkan Diri</SelectItem>
                    <SelectItem value="hired">Diterima</SelectItem>
                    <SelectItem value="rejected">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={inviteDialog.open} onOpenChange={(open) => setInviteDialog((prev) => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Undangan Proses Masuk Kandidat</DialogTitle>
              <DialogDescription>
                Kandidat <span className="font-medium">{inviteDialog.name}</span> siap diarahkan ke proses masuk pegawai.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Kode Undangan</p>
                <p className="font-mono text-base font-semibold">{inviteDialog.code || "-"}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Link Aktivasi</p>
                <p className="break-all font-mono text-xs">{inviteDialog.code ? buildInvitationLink(inviteDialog.code) : "-"}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => void copyInviteLink()}>
                <Copy className="mr-2 h-4 w-4" />
                {copiedInvite ? "Tersalin" : "Salin Link"}
              </Button>
              <Button onClick={() => setInviteDialog({ open: false, name: "", code: null })}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}
