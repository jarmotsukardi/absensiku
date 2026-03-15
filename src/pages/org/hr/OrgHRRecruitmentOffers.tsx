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
import { FileCheck2, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { logAuditIfEnabled } from "@/lib/auditLoggingPolicy";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

type OfferStatus = "draft" | "sent" | "accepted" | "declined" | "expired" | "cancelled";

type CandidateOption = { id: string; full_name: string };

type OfferRow = {
  id: string;
  candidate_id: string;
  offered_position: string | null;
  offered_salary: number | null;
  currency: string;
  offered_at: string | null;
  expiry_at: string | null;
  status: OfferStatus;
};

type OfferForm = {
  candidate_id: string;
  offered_position: string;
  offered_salary: string;
  currency: string;
  offered_at: string;
  expiry_at: string;
  status: OfferStatus;
  notes: string;
};

const INITIAL_FORM: OfferForm = {
  candidate_id: "",
  offered_position: "",
  offered_salary: "",
  currency: "IDR",
  offered_at: "",
  expiry_at: "",
  status: "draft",
  notes: "",
};

const PAGE_SIZE = 10;

function getOfferStatusLabel(status: OfferStatus): string {
  if (status === "draft") return "Draf";
  if (status === "sent") return "Dikirim";
  if (status === "accepted") return "Diterima";
  if (status === "declined") return "Ditolak";
  if (status === "expired") return "Kedaluwarsa";
  return "Dibatalkan";
}

export default function OrgHRRecruitmentOffers() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OfferForm>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const confirmDialog = useConfirmDialog();
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/recruitment/offers");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [offersRes, candidatesRes] = await Promise.all([
        supabase
          .from("hr_recruitment_offers")
          .select("id, candidate_id, offered_position, offered_salary, currency, offered_at, expiry_at, status")
          .eq("tenant_id", resolvedTenantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("hr_recruitment_candidates")
          .select("id, full_name")
          .eq("tenant_id", resolvedTenantId)
          .order("full_name", { ascending: true }),
      ]);

      if (offersRes.error) throw offersRes.error;
      if (candidatesRes.error) throw candidatesRes.error;

      setRows((offersRes.data || []) as OfferRow[]);
      setCandidates((candidatesRes.data || []) as CandidateOption[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.offers.fetch");
      toast.error(appendErrorReference("Gagal memuat penawaran kerja", ref));
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
      return `${candidateName} ${row.offered_position || ""} ${row.status} ${row.currency}`.toLowerCase().includes(keyword);
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
      toast.error("Aksi tambah penawaran hanya tersedia untuk admin organisasi.");
      return;
    }
    setEditingId(null);
    setForm(INITIAL_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: OfferRow) => {
    if (!access.canEdit) {
      toast.error("Aksi ubah penawaran hanya tersedia untuk admin organisasi.");
      return;
    }
    setEditingId(row.id);
    setForm({
      candidate_id: row.candidate_id,
      offered_position: row.offered_position || "",
      offered_salary: row.offered_salary === null ? "" : String(row.offered_salary),
      currency: row.currency,
      offered_at: row.offered_at ? row.offered_at.slice(0, 16) : "",
      expiry_at: row.expiry_at ? row.expiry_at.slice(0, 16) : "",
      status: row.status,
      notes: "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!access.canEdit) {
      toast.error("Aksi simpan penawaran hanya tersedia untuk admin organisasi.");
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
        offered_position: form.offered_position.trim() || null,
        offered_salary: form.offered_salary.trim() ? Number(form.offered_salary) : null,
        currency: form.currency.trim() || "IDR",
        offered_at: form.offered_at ? new Date(form.offered_at).toISOString() : null,
        expiry_at: form.expiry_at ? new Date(form.expiry_at).toISOString() : null,
        status: form.status,
        notes: form.notes.trim() || null,
        updated_by: user?.id || null,
      };

      if (editingId) {
        const previousRow = rows.find((item) => item.id === editingId) || null;
        const { error } = await supabase
          .from("hr_recruitment_offers")
          .update(payload)
          .eq("id", editingId)
          .eq("tenant_id", tenantId);
        if (error) throw error;
        const { error: auditError } = await logAuditIfEnabled({
          tenantId,
          payload: {
            tenant_id: tenantId,
            user_id: user?.id || null,
            action: "ats_offer_update",
            table_name: "hr_recruitment_offers",
            record_id: editingId,
            old_values: previousRow,
            new_values: payload,
          },
        });
        if (auditError) throw auditError;
        toast.success("Penawaran kerja berhasil diperbarui.");
      } else {
        const { data: insertedRows, error } = await supabase.from("hr_recruitment_offers").insert({
          ...payload,
          created_by: payload.updated_by,
        }).select("id");
        if (error) throw error;
        const { error: auditError } = await logAuditIfEnabled({
          tenantId,
          payload: {
            tenant_id: tenantId,
            user_id: user?.id || null,
            action: "ats_offer_create",
            table_name: "hr_recruitment_offers",
            record_id: insertedRows?.[0]?.id || null,
            old_values: null,
            new_values: payload,
          },
        });
        if (auditError) throw auditError;
        toast.success("Penawaran kerja berhasil ditambahkan.");
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm(INITIAL_FORM);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.offers.save", { editing_id: editingId });
      toast.error(appendErrorReference("Gagal menyimpan penawaran kerja", ref));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: OfferRow) => {
    if (!access.canEdit) {
      toast.error("Aksi hapus penawaran hanya tersedia untuk admin organisasi.");
      return;
    }
    const confirmed = await confirmDialog({
      title: "Hapus Penawaran",
      description: `Penawaran untuk kandidat "${candidateMap.get(row.candidate_id) || row.candidate_id}" akan dihapus.`,
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
        .from("hr_recruitment_offers")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const { error: auditError } = await logAuditIfEnabled({
        tenantId,
        payload: {
          tenant_id: tenantId,
          user_id: user?.id || null,
          action: "ats_offer_delete",
          table_name: "hr_recruitment_offers",
          record_id: row.id,
          old_values: row,
          new_values: null,
        },
      });
      if (auditError) throw auditError;
      toast.success("Penawaran kerja berhasil dihapus.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.recruitment.offers.delete", { offer_id: row.id });
      toast.error(appendErrorReference("Gagal menghapus penawaran kerja", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Rekrutmen (ATS)</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Penawaran Kerja</h1>
          <p className="text-sm text-muted-foreground">Kelola penawaran kerja kandidat sampai status diterima/ditolak.</p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "mode baca saja"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-4 w-4" />
              Manajemen Penawaran
            </CardTitle>
            <CardDescription>CRUD dasar penawaran kerja pada ATS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Penawaran
              </Button>
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari kandidat, posisi, status..."
                />
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat data penawaran...</p>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kandidat</TableHead>
                    <TableHead>Posisi</TableHead>
                    <TableHead>Gaji</TableHead>
                    <TableHead>Tanggal Penawaran</TableHead>
                    <TableHead>Berakhir</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Belum ada data penawaran.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((row) => (
                      <TableRow key={row.id} data-testid={`org-hr-ats-offer-row-${row.id}`}>
                        <TableCell>{candidateMap.get(row.candidate_id) || row.candidate_id}</TableCell>
                        <TableCell>{row.offered_position || "-"}</TableCell>
                        <TableCell>
                          {row.offered_salary === null
                            ? "-"
                            : `${row.currency} ${new Intl.NumberFormat("id-ID").format(row.offered_salary)}`}
                        </TableCell>
                        <TableCell>{row.offered_at ? new Date(row.offered_at).toLocaleString("id-ID") : "-"}</TableCell>
                        <TableCell>{row.expiry_at ? new Date(row.expiry_at).toLocaleString("id-ID") : "-"}</TableCell>
                        <TableCell>{getOfferStatusLabel(row.status)}</TableCell>
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
                itemLabel="penawaran"
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
              <DialogTitle>{editingId ? "Ubah Penawaran" : "Tambah Penawaran"}</DialogTitle>
              <DialogDescription>Isi data penawaran kerja untuk kandidat.</DialogDescription>
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
                  <Label htmlFor="offered_position">Posisi</Label>
                  <Input id="offered_position" value={form.offered_position} onChange={(e) => setForm((p) => ({ ...p, offered_position: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offered_salary">Gaji Ditawarkan</Label>
                  <Input id="offered_salary" type="number" min={0} value={form.offered_salary} onChange={(e) => setForm((p) => ({ ...p, offered_salary: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="currency">Mata Uang</Label>
                  <Input id="currency" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offered_at">Tanggal Penawaran</Label>
                  <Input id="offered_at" type="datetime-local" value={form.offered_at} onChange={(e) => setForm((p) => ({ ...p, offered_at: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="expiry_at">Tanggal Kedaluwarsa</Label>
                  <Input id="expiry_at" type="datetime-local" value={form.expiry_at} onChange={(e) => setForm((p) => ({ ...p, expiry_at: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value as OfferStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draf</SelectItem>
                    <SelectItem value="sent">Dikirim</SelectItem>
                    <SelectItem value="accepted">Diterima</SelectItem>
                    <SelectItem value="declined">Ditolak</SelectItem>
                    <SelectItem value="expired">Kedaluwarsa</SelectItem>
                    <SelectItem value="cancelled">Dibatalkan</SelectItem>
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
      </div>
    </OrganizationLayout>
  );
}
