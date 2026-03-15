import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { CalendarCheck2, Plus, Search } from "lucide-react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { logAuditIfEnabled } from "@/lib/auditLoggingPolicy";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

type InterviewMode = "online" | "offline" | "hybrid";
type InterviewStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";

type CandidateOption = { id: string; full_name: string };

type InterviewRow = {
  id: string;
  candidate_id: string;
  interview_round: string;
  scheduled_at: string | null;
  interviewer_name: string | null;
  mode: InterviewMode;
  status: InterviewStatus;
  score: number | null;
};

type InterviewForm = {
  candidate_id: string;
  interview_round: string;
  scheduled_at: string;
  interviewer_name: string;
  interviewer_email: string;
  location: string;
  mode: InterviewMode;
  status: InterviewStatus;
  score: string;
  feedback: string;
};

const INITIAL_FORM: InterviewForm = {
  candidate_id: "",
  interview_round: "round_1",
  scheduled_at: "",
  interviewer_name: "",
  interviewer_email: "",
  location: "",
  mode: "online",
  status: "scheduled",
  score: "",
  feedback: "",
};

const PAGE_SIZE = 10;

function getInterviewModeLabel(mode: InterviewMode): string {
  if (mode === "online") return "Daring";
  if (mode === "offline") return "Luring";
  return "Hibrida";
}

function getInterviewStatusLabel(status: InterviewStatus): string {
  if (status === "scheduled") return "Terjadwal";
  if (status === "completed") return "Selesai";
  if (status === "cancelled") return "Dibatalkan";
  return "Dijadwalkan Ulang";
}

export default function OrgHRRecruitmentInterviews() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InterviewForm>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const confirmDialog = useConfirmDialog();
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/recruitment/interviews");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [interviewsRes, candidatesRes] = await Promise.all([
        supabase
          .from("hr_recruitment_interviews")
          .select("id, candidate_id, interview_round, scheduled_at, interviewer_name, mode, status, score")
          .eq("tenant_id", resolvedTenantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("hr_recruitment_candidates")
          .select("id, full_name")
          .eq("tenant_id", resolvedTenantId)
          .order("full_name", { ascending: true }),
      ]);

      if (interviewsRes.error) throw interviewsRes.error;
      if (candidatesRes.error) throw candidatesRes.error;

      setRows((interviewsRes.data || []) as InterviewRow[]);
      setCandidates((candidatesRes.data || []) as CandidateOption[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.interviews.fetch");
      toast.error(appendErrorReference("Gagal memuat data wawancara", ref));
      setRows([]);
      setCandidates([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const candidateMap = useMemo(() => new Map(candidates.map((item) => [item.id, item.full_name])), [candidates]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const candidateName = candidateMap.get(row.candidate_id) || "";
      return `${candidateName} ${row.interview_round} ${row.status} ${row.mode}`.toLowerCase().includes(keyword);
    });
  }, [rows, search, candidateMap]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(from, from + PAGE_SIZE);
  }, [filteredRows, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const openCreate = () => {
    if (!access.canEdit) {
      toast.error("Aksi tambah wawancara hanya tersedia untuk admin organisasi.");
      return;
    }
    setEditingId(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: InterviewRow) => {
    if (!access.canEdit) {
      toast.error("Aksi ubah wawancara hanya tersedia untuk admin organisasi.");
      return;
    }
    setEditingId(row.id);
    setForm({
      candidate_id: row.candidate_id,
      interview_round: row.interview_round,
      scheduled_at: row.scheduled_at ? row.scheduled_at.slice(0, 16) : "",
      interviewer_name: row.interviewer_name || "",
      interviewer_email: "",
      location: "",
      mode: row.mode,
      status: row.status,
      score: row.score === null ? "" : String(row.score),
      feedback: "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!access.canEdit) {
      toast.error("Aksi simpan wawancara hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan.");
      return;
    }
    if (!form.candidate_id) {
      toast.error("Kandidat wajib dipilih.");
      return;
    }

    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = {
        tenant_id: tenantId,
        candidate_id: form.candidate_id,
        interview_round: form.interview_round.trim() || "round_1",
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        interviewer_name: form.interviewer_name.trim() || null,
        interviewer_email: form.interviewer_email.trim() || null,
        location: form.location.trim() || null,
        mode: form.mode,
        status: form.status,
        score: form.score.trim() ? Number(form.score) : null,
        feedback: form.feedback.trim() || null,
        updated_by: user?.id || null,
      };

      if (editingId) {
        const previousRow = rows.find((item) => item.id === editingId) || null;
        const { error } = await supabase
          .from("hr_recruitment_interviews")
          .update(payload)
          .eq("id", editingId)
          .eq("tenant_id", tenantId);
        if (error) throw error;
        const { error: auditError } = await logAuditIfEnabled({
          tenantId,
          payload: {
            tenant_id: tenantId,
            user_id: user?.id || null,
            action: "ats_interview_update",
            table_name: "hr_recruitment_interviews",
            record_id: editingId,
            old_values: previousRow,
            new_values: payload,
          },
        });
        if (auditError) throw auditError;
        toast.success("Data interview berhasil diperbarui.");
      } else {
        const { data: insertedRows, error } = await supabase.from("hr_recruitment_interviews").insert({
          ...payload,
          created_by: payload.updated_by,
        }).select("id");
        if (error) throw error;
        const { error: auditError } = await logAuditIfEnabled({
          tenantId,
          payload: {
            tenant_id: tenantId,
            user_id: user?.id || null,
            action: "ats_interview_create",
            table_name: "hr_recruitment_interviews",
            record_id: insertedRows?.[0]?.id || null,
            old_values: null,
            new_values: payload,
          },
        });
        if (auditError) throw auditError;
        toast.success("Wawancara berhasil ditambahkan.");
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm(INITIAL_FORM);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.interviews.save", { editing_id: editingId });
      toast.error(appendErrorReference("Gagal menyimpan wawancara", ref));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: InterviewRow) => {
    if (!access.canEdit) {
      toast.error("Aksi hapus wawancara hanya tersedia untuk admin organisasi.");
      return;
    }
    const confirmed = await confirmDialog({
      title: "Hapus Wawancara",
      description: `Jadwal wawancara untuk kandidat "${candidateMap.get(row.candidate_id) || row.candidate_id}" akan dihapus.`,
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
        .from("hr_recruitment_interviews")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const { error: auditError } = await logAuditIfEnabled({
        tenantId,
        payload: {
          tenant_id: tenantId,
          user_id: user?.id || null,
          action: "ats_interview_delete",
          table_name: "hr_recruitment_interviews",
          record_id: row.id,
          old_values: row,
          new_values: null,
        },
      });
      if (auditError) throw auditError;
      toast.success("Wawancara berhasil dihapus.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.interviews.delete", { interview_id: row.id });
      toast.error(appendErrorReference("Gagal menghapus wawancara", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Rekrutmen (ATS)</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Tahap Wawancara</h1>
          <p className="text-sm text-muted-foreground">Kelola jadwal dan hasil wawancara kandidat.</p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "mode baca saja"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck2 className="h-4 w-4" />
              Manajemen Wawancara
            </CardTitle>
            <CardDescription>CRUD dasar untuk tahap wawancara ATS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Wawancara
              </Button>
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari kandidat, ronde, moda, status..."
                />
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat data wawancara...</p>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kandidat</TableHead>
                    <TableHead>Ronde</TableHead>
                    <TableHead>Jadwal</TableHead>
                    <TableHead>Pewawancara</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Belum ada data wawancara.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((row) => (
                      <TableRow key={row.id} data-testid={`org-hr-ats-interview-row-${row.id}`}>
                        <TableCell>{candidateMap.get(row.candidate_id) || row.candidate_id}</TableCell>
                        <TableCell>{row.interview_round}</TableCell>
                        <TableCell>{row.scheduled_at ? new Date(row.scheduled_at).toLocaleString("id-ID") : "-"}</TableCell>
                        <TableCell>{row.interviewer_name || "-"}</TableCell>
                        <TableCell>{getInterviewModeLabel(row.mode)}</TableCell>
                        <TableCell>{getInterviewStatusLabel(row.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(row)}>Ubah</Button>
                            <Button size="sm" variant="outline" onClick={() => void handleDelete(row)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Hapus
                            </Button>
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
                totalItems={filteredRows.length}
                pageSize={PAGE_SIZE}
                itemLabel="wawancara"
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
              <DialogTitle>{editingId ? "Ubah Wawancara" : "Tambah Wawancara"}</DialogTitle>
              <DialogDescription>Isi data jadwal wawancara kandidat.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label>Kandidat</Label>
                <Select value={form.candidate_id} onValueChange={(value) => setForm((p) => ({ ...p, candidate_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih kandidat" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="interview_round">Ronde</Label>
                  <Input id="interview_round" value={form.interview_round} onChange={(e) => setForm((p) => ({ ...p, interview_round: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="scheduled_at">Jadwal</Label>
                  <Input id="scheduled_at" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="interviewer_name">Pewawancara</Label>
                  <Input id="interviewer_name" value={form.interviewer_name} onChange={(e) => setForm((p) => ({ ...p, interviewer_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="interviewer_email">Email Pewawancara</Label>
                  <Input id="interviewer_email" value={form.interviewer_email} onChange={(e) => setForm((p) => ({ ...p, interviewer_email: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(value) => setForm((p) => ({ ...p, mode: value as InterviewMode }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Daring</SelectItem>
                      <SelectItem value="offline">Luring</SelectItem>
                      <SelectItem value="hybrid">Hibrida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value as InterviewStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Terjadwal</SelectItem>
                      <SelectItem value="completed">Selesai</SelectItem>
                      <SelectItem value="cancelled">Dibatalkan</SelectItem>
                      <SelectItem value="rescheduled">Dijadwalkan Ulang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="score">Skor</Label>
                  <Input id="score" type="number" min={0} max={100} value={form.score} onChange={(e) => setForm((p) => ({ ...p, score: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}
