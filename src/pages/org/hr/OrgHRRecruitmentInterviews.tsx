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
import { CalendarCheck2, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
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

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [interviewsRes, candidatesRes] = await Promise.all([
        (supabase as any)
          .from("hr_recruitment_interviews")
          .select("id, candidate_id, interview_round, scheduled_at, interviewer_name, mode, status, score")
          .eq("tenant_id", resolvedTenantId)
          .order("created_at", { ascending: false }),
        (supabase as any)
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
      toast.error(appendErrorReference("Gagal memuat data interview", ref));
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

  const openCreate = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: InterviewRow) => {
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
        updated_by: (await supabase.auth.getUser()).data.user?.id || null,
      };

      if (editingId) {
        const { error } = await (supabase as any).from("hr_recruitment_interviews").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Data interview berhasil diperbarui.");
      } else {
        const { error } = await (supabase as any).from("hr_recruitment_interviews").insert({
          ...payload,
          created_by: payload.updated_by,
        });
        if (error) throw error;
        toast.success("Interview berhasil ditambahkan.");
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm(INITIAL_FORM);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.interviews.save", { editing_id: editingId });
      toast.error(appendErrorReference("Gagal menyimpan interview", ref));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Rekrutmen (ATS)</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Tahap Interview</h1>
          <p className="text-sm text-muted-foreground">Kelola jadwal dan hasil interview kandidat.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck2 className="h-4 w-4" />
              Manajemen Interview
            </CardTitle>
            <CardDescription>CRUD dasar untuk tahap interview ATS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Interview
              </Button>
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari kandidat, ronde, mode, status..."
                />
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat data interview...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kandidat</TableHead>
                    <TableHead>Ronde</TableHead>
                    <TableHead>Jadwal</TableHead>
                    <TableHead>Interviewer</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Belum ada data interview.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{candidateMap.get(row.candidate_id) || row.candidate_id}</TableCell>
                        <TableCell>{row.interview_round}</TableCell>
                        <TableCell>{row.scheduled_at ? new Date(row.scheduled_at).toLocaleString("id-ID") : "-"}</TableCell>
                        <TableCell>{row.interviewer_name || "-"}</TableCell>
                        <TableCell>{row.mode}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>Edit</Button>
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
              <DialogTitle>{editingId ? "Edit Interview" : "Tambah Interview"}</DialogTitle>
              <DialogDescription>Isi data jadwal interview kandidat.</DialogDescription>
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
                  <Label htmlFor="interviewer_name">Interviewer</Label>
                  <Input id="interviewer_name" value={form.interviewer_name} onChange={(e) => setForm((p) => ({ ...p, interviewer_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="interviewer_email">Email Interviewer</Label>
                  <Input id="interviewer_email" value={form.interviewer_email} onChange={(e) => setForm((p) => ({ ...p, interviewer_email: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(value) => setForm((p) => ({ ...p, mode: value as InterviewMode }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value as InterviewStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="rescheduled">Rescheduled</SelectItem>
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
