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
import { Briefcase, Plus, RefreshCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type JobStatus = "draft" | "published" | "closed" | "cancelled";
type EmploymentType = "full_time" | "part_time" | "contract" | "internship";

type JobRow = {
  id: string;
  title: string;
  department: string | null;
  employment_type: EmploymentType;
  location: string | null;
  opening_count: number;
  status: JobStatus;
  created_at: string;
};

type JobForm = {
  title: string;
  department: string;
  employment_type: EmploymentType;
  location: string;
  opening_count: number;
  status: JobStatus;
  description: string;
};

const INITIAL_FORM: JobForm = {
  title: "",
  department: "",
  employment_type: "full_time",
  location: "",
  opening_count: 1,
  status: "draft",
  description: "",
};

export default function OrgHRRecruitmentJobs() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<JobRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | JobStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobForm>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      let query = (supabase as any)
        .from("hr_recruitment_jobs")
        .select("id, title, department, employment_type, location, opening_count, status, created_at")
        .eq("tenant_id", resolvedTenantId)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data || []) as JobRow[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.jobs.fetch");
      toast.error(appendErrorReference("Gagal memuat lowongan rekrutmen", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, tenantId]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      `${row.title} ${row.department || ""} ${row.location || ""}`.toLowerCase().includes(keyword),
    );
  }, [rows, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: JobRow) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      department: row.department || "",
      employment_type: row.employment_type,
      location: row.location || "",
      opening_count: row.opening_count,
      status: row.status,
      description: "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan.");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Judul lowongan wajib diisi.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        title: form.title.trim(),
        department: form.department.trim() || null,
        employment_type: form.employment_type,
        location: form.location.trim() || null,
        opening_count: form.opening_count,
        status: form.status,
        description: form.description.trim() || null,
        updated_by: (await supabase.auth.getUser()).data.user?.id || null,
      };

      if (editingId) {
        const { error } = await (supabase as any).from("hr_recruitment_jobs").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Lowongan berhasil diperbarui.");
      } else {
        const { error } = await (supabase as any).from("hr_recruitment_jobs").insert({
          ...payload,
          created_by: payload.updated_by,
          published_at: form.status === "published" ? new Date().toISOString() : null,
        });
        if (error) throw error;
        toast.success("Lowongan berhasil ditambahkan.");
      }

      setDialogOpen(false);
      setForm(INITIAL_FORM);
      setEditingId(null);
      await fetchRows();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.jobs.save", { editing_id: editingId });
      toast.error(appendErrorReference("Gagal menyimpan lowongan", ref));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Rekrutmen (ATS)</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Lowongan Kerja</h1>
          <p className="text-sm text-muted-foreground">
            Kelola daftar lowongan dan status publikasi untuk proses rekrutmen.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4" />
              Manajemen Lowongan
            </CardTitle>
            <CardDescription>CRUD dasar ATS fase awal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Lowongan
              </Button>
              <Button variant="outline" onClick={() => void fetchRows()}>
                <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari judul, departemen, lokasi..."
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Dipublikasikan</SelectItem>
                  <SelectItem value="closed">Ditutup</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat lowongan...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul</TableHead>
                    <TableHead>Departemen</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Lokasi</TableHead>
                    <TableHead>Kuota</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Belum ada data lowongan.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.title}</TableCell>
                        <TableCell>{row.department || "-"}</TableCell>
                        <TableCell>{row.employment_type}</TableCell>
                        <TableCell>{row.location || "-"}</TableCell>
                        <TableCell>{row.opening_count}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                            Edit
                          </Button>
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
              <DialogTitle>{editingId ? "Edit Lowongan" : "Tambah Lowongan"}</DialogTitle>
              <DialogDescription>Isi data dasar lowongan rekrutmen.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="job_title">Judul</Label>
                <Input id="job_title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="job_department">Departemen</Label>
                <Input id="job_department" value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Tipe Kerja</Label>
                  <Select
                    value={form.employment_type}
                    onValueChange={(value) => setForm((p) => ({ ...p, employment_type: value as EmploymentType }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Penuh Waktu</SelectItem>
                      <SelectItem value="part_time">Paruh Waktu</SelectItem>
                      <SelectItem value="contract">Kontrak</SelectItem>
                      <SelectItem value="internship">Magang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="job_opening_count">Kuota</Label>
                  <Input
                    id="job_opening_count"
                    type="number"
                    min={1}
                    value={form.opening_count}
                    onChange={(e) => setForm((p) => ({ ...p, opening_count: Number(e.target.value || 1) }))}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="job_location">Lokasi</Label>
                  <Input id="job_location" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value as JobStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Dipublikasikan</SelectItem>
                      <SelectItem value="closed">Ditutup</SelectItem>
                      <SelectItem value="cancelled">Dibatalkan</SelectItem>
                    </SelectContent>
                  </Select>
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
