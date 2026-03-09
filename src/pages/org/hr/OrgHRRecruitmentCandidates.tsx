import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Search, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  buildInvitationLink,
  ensureIndividualEmployeeInvitation,
  logEmployeeInvitationFlowAudit,
} from "@/lib/employeeInvitations";
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

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [candidatesRes, jobsRes] = await Promise.all([
        (supabase as any)
          .from("hr_recruitment_candidates")
          .select("id, full_name, email, phone, stage, status, job_id, hired_employee_id, metadata, created_at")
          .eq("tenant_id", resolvedTenantId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("hr_recruitment_jobs")
          .select("id, title")
          .eq("tenant_id", resolvedTenantId)
          .order("title", { ascending: true }),
      ]);

      if (candidatesRes.error) throw candidatesRes.error;
      if (jobsRes.error) throw jobsRes.error;

      setRows((candidatesRes.data || []) as CandidateRow[]);
      setJobs((jobsRes.data || []) as JobOption[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.candidates.fetch");
      toast.error(appendErrorReference("Gagal memuat kandidat rekrutmen", ref));
      setRows([]);
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const jobMap = useMemo(() => new Map(jobs.map((job) => [job.id, job.title])), [jobs]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      `${row.full_name} ${row.email || ""} ${row.phone || ""} ${jobMap.get(row.job_id || "") || ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [rows, search, jobMap]);

  const openCreate = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: CandidateRow) => {
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
      const payload = {
        tenant_id: tenantId,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        job_id: form.job_id === "none" ? null : form.job_id,
        stage: form.stage,
        status: form.status,
        updated_by: (await supabase.auth.getUser()).data.user?.id || null,
      };

      if (editingId) {
        const { error } = await (supabase as any)
          .from("hr_recruitment_candidates")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Data kandidat berhasil diperbarui.");
      } else {
        const { error } = await (supabase as any).from("hr_recruitment_candidates").insert({
          ...payload,
          created_by: payload.updated_by,
          applied_at: new Date().toISOString(),
        });
        if (error) throw error;
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
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan.");
      return;
    }
    const email = row.email?.trim().toLowerCase();
    if (!email) {
      toast.error("Email kandidat wajib diisi sebelum konversi ke onboarding.");
      return;
    }
    if (row.hired_employee_id) {
      toast.info("Kandidat ini sudah terhubung ke data karyawan.");
      return;
    }
    if (row.metadata?.onboarding_invitation_id && row.metadata?.onboarding_invitation_code) {
      setInviteDialog({
        open: true,
        name: row.full_name,
        code: row.metadata.onboarding_invitation_code,
      });
      toast.info("Undangan onboarding sudah tersedia.");
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
        const { error: updateError } = await (supabase as any)
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
          .eq("id", row.id);
        if (updateError) throw updateError;

        toast.success("Kandidat sudah menjadi karyawan aktif. Relasi berhasil diperbarui.");
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

      const { error: updateError } = await (supabase as any)
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
        .eq("id", row.id);
      if (updateError) throw updateError;

      setInviteDialog({
        open: true,
        name: row.full_name,
        code: invitationResult.invitation.invitation_code,
      });
      if (invitationResult.reused) {
        toast.info("Undangan onboarding aktif sudah ada.");
      } else {
        toast.success("Undangan onboarding kandidat berhasil dibuat.");
      }
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.candidates.convert", {
        candidate_id: row.id,
        candidate_email: row.email,
      });
      toast.error(appendErrorReference("Gagal mengonversi kandidat ke onboarding", ref));
    } finally {
      setIsConvertingId(null);
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
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Belum ada data kandidat.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.full_name}</TableCell>
                        <TableCell className="text-sm">
                          <div>{row.email || "-"}</div>
                          <div className="text-muted-foreground">{row.phone || "-"}</div>
                        </TableCell>
                        <TableCell>{row.job_id ? jobMap.get(row.job_id) || "-" : "-"}</TableCell>
                        <TableCell>{row.stage}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                              Edit
                            </Button>
                            {(row.stage === "hired" || row.status === "hired") && (
                              <Button
                                size="sm"
                                onClick={() => void handleConvertToOnboarding(row)}
                                disabled={isConvertingId === row.id}
                              >
                                {isConvertingId === row.id ? "Memproses..." : "Konversi Onboarding"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Kandidat" : "Tambah Kandidat"}</DialogTitle>
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
                      <SelectItem value="screening">Screening</SelectItem>
                      <SelectItem value="interview">Interview</SelectItem>
                      <SelectItem value="offered">Offer</SelectItem>
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
              <DialogTitle>Undangan Onboarding Kandidat</DialogTitle>
              <DialogDescription>
                Kandidat <span className="font-medium">{inviteDialog.name}</span> siap diarahkan ke onboarding pegawai.
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
