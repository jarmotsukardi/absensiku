import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Download, Printer, Search, UserCog } from "lucide-react";
import { toast } from "sonner";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { RequestReportsTabs } from "@/components/org/reports/RequestReportsTabs";

type MutationRequestRow = Tables<"mutation_requests">;
type OPD = Tables<"opd">;
type WorkUnit = Tables<"work_units">;

type MutationStatus = "menunggu" | "disetujui" | "ditolak";
type MutationType = "profile_change" | "transfer";

interface EmployeeLite {
  id: string;
  name: string | null;
  nip: string | null;
  opd_id: string | null;
  work_unit_id: string | null;
}

interface MutationQueryRow extends MutationRequestRow {
  employees: EmployeeLite | null;
}

interface MutationRecord extends MutationRequestRow {
  employees: EmployeeLite | null;
  requested_changes_record: Record<string, Json | undefined>;
  original_data_record: Record<string, Json | undefined>;
}

const ITEMS_PER_PAGE = 20;
const FETCH_CHUNK = 500;

const toJsonRecord = (value: Json | null): Record<string, Json | undefined> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json | undefined>;
  }
  return {};
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getMutationTypeLabel = (type: string): string =>
  type === "profile_change" ? "Perubahan Profil" : "Mutasi/Pindah";

const getStatusLabel = (status: string): string => {
  if (status === "menunggu") return "Menunggu";
  if (status === "disetujui") return "Disetujui";
  if (status === "ditolak") return "Ditolak";
  return status;
};

const getStatusBadge = (status: string) => {
  if (status === "menunggu") return <Badge variant="secondary">Menunggu</Badge>;
  if (status === "disetujui") return <Badge className="bg-green-500 hover:bg-green-600">Disetujui</Badge>;
  if (status === "ditolak") return <Badge variant="destructive">Ditolak</Badge>;
  return <Badge variant="outline">{status}</Badge>;
};

const getFieldLabel = (field: string): string => {
  const labels: Record<string, string> = {
    email: "Email",
    phone: "No. Telepon",
    whatsapp: "WhatsApp",
    address: "Alamat",
    gender: "Jenis Kelamin",
    golongan: "Golongan",
    position: "Jabatan",
    opd_id: "OPD",
    work_unit_id: "Satuan Kerja",
    office_id: "Lokasi Kerja",
  };
  return labels[field] || field;
};

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return JSON.stringify(value);
};

export default function OrgMutationReport() {
  const [tenantId, setTenantId] = useState<string | null | undefined>(undefined);
  const [records, setRecords] = useState<MutationRecord[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MutationStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | MutationType>("all");
  const [opdFilter, setOpdFilter] = useState<string>("all");
  const [workUnitFilter, setWorkUnitFilter] = useState<string>("all");

  useEffect(() => {
    const init = async () => {
      try {
        setLoadError(null);
        const resolvedTenantId = await resolveOrgTenantId();
        setTenantId(resolvedTenantId);
        if (!resolvedTenantId) return;

        const [opdRes, workUnitRes] = await Promise.all([
          supabase.from("opd").select("*").eq("tenant_id", resolvedTenantId).order("name"),
          supabase.from("work_units").select("*").eq("tenant_id", resolvedTenantId).order("name"),
        ]);

        if (opdRes.error) throw opdRes.error;
        if (workUnitRes.error) throw workUnitRes.error;

        setOpds(opdRes.data || []);
        setWorkUnits(workUnitRes.data || []);
      } catch (error) {
        const errorRef = reportError(error, "org.reports.mutations.init");
        const message = appendErrorReference("Gagal memuat data awal laporan mutasi", errorRef);
        setLoadError(message);
        toast.error(message);
      }
    };

    void init();
  }, []);

  const opdMap = useMemo(() => {
    const map = new Map<string, OPD>();
    opds.forEach((item) => map.set(item.id, item));
    return map;
  }, [opds]);

  const workUnitMap = useMemo(() => {
    const map = new Map<string, WorkUnit>();
    workUnits.forEach((item) => map.set(item.id, item));
    return map;
  }, [workUnits]);

  const resolveNamedValue = useCallback(
    (field: string, value: Json | undefined): string => {
      if (field === "opd_id" && typeof value === "string") {
        const opd = opdMap.get(value);
        return opd ? `${opd.code} - ${opd.name}` : value;
      }
      if (field === "work_unit_id" && typeof value === "string") {
        const workUnit = workUnitMap.get(value);
        return workUnit ? workUnit.name : value;
      }
      return normalizeText(value);
    },
    [opdMap, workUnitMap]
  );

  const getChangeSummary = useCallback(
    (record: MutationRecord): string => {
      const entries = Object.entries(record.requested_changes_record || {});
      if (entries.length === 0) return "-";
      const summary = entries
        .slice(0, 2)
        .map(([field, value]) => `${getFieldLabel(field)}: ${resolveNamedValue(field, value)}`)
        .join(" | ");
      return entries.length > 2 ? `${summary} (+${entries.length - 2} perubahan)` : summary;
    },
    [resolveNamedValue]
  );

  const resolveOpdAndUnit = useCallback(
    (record: MutationRecord) => {
      const currentOpdId = record.employees?.opd_id || null;
      const currentWorkUnitId = record.employees?.work_unit_id || null;
      const targetOpdId =
        typeof record.requested_changes_record.opd_id === "string"
          ? record.requested_changes_record.opd_id
          : null;
      const targetWorkUnitId =
        typeof record.requested_changes_record.work_unit_id === "string"
          ? record.requested_changes_record.work_unit_id
          : null;

      return {
        currentOpdLabel: currentOpdId ? `${opdMap.get(currentOpdId)?.code || "-"} - ${opdMap.get(currentOpdId)?.name || currentOpdId}` : "-",
        currentWorkUnitLabel: currentWorkUnitId ? workUnitMap.get(currentWorkUnitId)?.name || currentWorkUnitId : "-",
        targetOpdLabel: targetOpdId ? `${opdMap.get(targetOpdId)?.code || "-"} - ${opdMap.get(targetOpdId)?.name || targetOpdId}` : "-",
        targetWorkUnitLabel: targetWorkUnitId ? workUnitMap.get(targetWorkUnitId)?.name || targetWorkUnitId : "-",
      };
    },
    [opdMap, workUnitMap]
  );

  const fetchMutations = useCallback(async () => {
    if (!tenantId) {
      setRecords([]);
      return;
    }

    setIsLoading(true);
    try {
      setLoadError(null);

      const allRows: MutationRecord[] = [];
      let offset = 0;

      while (true) {
        let query = supabase
          .from("mutation_requests")
          .select("id, employee_id, mutation_type, requested_changes, original_data, reason, status, rejection_reason, created_at, approved_at, approved_by, attachment_url, updated_at, tenant_id, employees!mutation_requests_employee_id_fkey(id, name, nip, opd_id, work_unit_id)")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .range(offset, offset + FETCH_CHUNK - 1);

        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }
        if (typeFilter !== "all") {
          query = query.eq("mutation_type", typeFilter);
        }
        if (startDate) {
          query = query.gte("created_at", `${startDate}T00:00:00`);
        }
        if (endDate) {
          query = query.lte("created_at", `${endDate}T23:59:59.999`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const chunk = ((data || []) as MutationQueryRow[]).map((row) => ({
          ...row,
          employees: row.employees || null,
          requested_changes_record: toJsonRecord(row.requested_changes),
          original_data_record: toJsonRecord(row.original_data),
        }));

        allRows.push(...chunk);
        if (chunk.length < FETCH_CHUNK) break;
        offset += FETCH_CHUNK;
      }

      setRecords(allRows);
    } catch (error) {
      const errorRef = reportError(error, "org.reports.mutations.fetch", {
        tenant_id: tenantId,
        status: statusFilter,
        type: typeFilter,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      const message = appendErrorReference("Gagal memuat riwayat mutasi", errorRef);
      setLoadError(message);
      toast.error(message);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, startDate, statusFilter, tenantId, typeFilter]);

  const filteredRecords = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();

    return records.filter((record) => {
      if (opdFilter !== "all") {
        const currentOpd = record.employees?.opd_id;
        const targetOpd = typeof record.requested_changes_record.opd_id === "string"
          ? record.requested_changes_record.opd_id
          : null;
        if (currentOpd !== opdFilter && targetOpd !== opdFilter) return false;
      }

      if (workUnitFilter !== "all") {
        const currentWorkUnit = record.employees?.work_unit_id;
        const targetWorkUnit = typeof record.requested_changes_record.work_unit_id === "string"
          ? record.requested_changes_record.work_unit_id
          : null;
        if (currentWorkUnit !== workUnitFilter && targetWorkUnit !== workUnitFilter) return false;
      }

      if (!needle) return true;
      const searchable = [
        record.employees?.name || "",
        record.employees?.nip || "",
        record.reason || "",
        record.rejection_reason || "",
        getMutationTypeLabel(record.mutation_type),
        getStatusLabel(record.status),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(needle);
    });
  }, [records, opdFilter, searchTerm, workUnitFilter]);

  const totalRows = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, opdFilter, workUnitFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, filteredRecords]);

  const handleShow = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan. Muat ulang halaman.");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast.error("Tanggal mulai tidak boleh melebihi tanggal akhir.");
      return;
    }

    setHasQueried(true);
    setCurrentPage(1);
    await fetchMutations();
  };

  const handleExport = async () => {
    if (!hasQueried) {
      toast.error("Klik Tampilkan terlebih dahulu");
      return;
    }
    if (filteredRecords.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }

    try {
      const csv = [
        [
          "No",
          "Tanggal Pengajuan",
          "Nama Pegawai",
          "NIP",
          "Tipe",
          "Status",
          "OPD Saat Ini",
          "Unit Saat Ini",
          "OPD Tujuan",
          "Unit Tujuan",
          "Alasan",
          "Catatan Penolakan",
          "Ringkasan Perubahan",
        ].join(","),
        ...filteredRecords.map((record, idx) => {
          const unit = resolveOpdAndUnit(record);
          return [
            idx + 1,
            format(new Date(record.created_at), "yyyy-MM-dd HH:mm"),
            `"${(record.employees?.name || "-").replace(/"/g, '""')}"`,
            record.employees?.nip || "-",
            getMutationTypeLabel(record.mutation_type),
            getStatusLabel(record.status),
            `"${unit.currentOpdLabel.replace(/"/g, '""')}"`,
            `"${unit.currentWorkUnitLabel.replace(/"/g, '""')}"`,
            `"${unit.targetOpdLabel.replace(/"/g, '""')}"`,
            `"${unit.targetWorkUnitLabel.replace(/"/g, '""')}"`,
            `"${(record.reason || "-").replace(/"/g, '""')}"`,
            `"${(record.rejection_reason || "-").replace(/"/g, '""')}"`,
            `"${getChangeSummary(record).replace(/"/g, '""')}"`,
          ].join(",");
        }),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `riwayat-mutasi-${startDate || "all"}-${endDate || "all"}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Export berhasil");
    } catch (error) {
      const errorRef = reportError(error, "org.reports.mutations.export");
      toast.error(appendErrorReference("Gagal export riwayat mutasi", errorRef));
    }
  };

  const handlePrintPdf = async () => {
    if (!hasQueried) {
      toast.error("Klik Tampilkan terlebih dahulu");
      return;
    }
    if (filteredRecords.length === 0) {
      toast.error("Tidak ada data untuk dicetak");
      return;
    }

    try {
      const periodLabel = startDate && endDate ? `${startDate} s/d ${endDate}` : "Semua periode";
      const printedAt = format(new Date(), "d MMMM yyyy HH:mm", { locale: localeId });
      const rowsHtml = filteredRecords
        .map((record, idx) => {
          const unit = resolveOpdAndUnit(record);
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(format(new Date(record.created_at), "d MMM yyyy HH:mm", { locale: localeId }))}</td>
              <td>${escapeHtml(record.employees?.name || "-")}</td>
              <td>${escapeHtml(record.employees?.nip || "-")}</td>
              <td>${escapeHtml(getMutationTypeLabel(record.mutation_type))}</td>
              <td>${escapeHtml(getStatusLabel(record.status))}</td>
              <td>${escapeHtml(unit.currentOpdLabel)}</td>
              <td>${escapeHtml(unit.targetOpdLabel)}</td>
              <td>${escapeHtml(getChangeSummary(record))}</td>
            </tr>
          `;
        })
        .join("");

      const printWindow = window.open("", "_blank", "width=1200,height=800");
      if (!printWindow) {
        toast.error("Popup diblokir browser. Izinkan popup untuk cetak PDF.");
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>Laporan Riwayat Mutasi</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
              h1 { margin: 0 0 8px; font-size: 20px; }
              .meta { margin: 0 0 16px; font-size: 12px; color: #444; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
              th { background: #f3f4f6; }
              .footer { margin-top: 12px; font-size: 11px; color: #666; }
            </style>
          </head>
          <body>
            <h1>Laporan Riwayat Mutasi Pegawai</h1>
            <p class="meta">Periode: ${escapeHtml(periodLabel)} | Total: ${filteredRecords.length} data | Dicetak: ${escapeHtml(printedAt)}</p>
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Nama</th>
                  <th>NIP</th>
                  <th>Tipe</th>
                  <th>Status</th>
                  <th>OPD Saat Ini</th>
                  <th>OPD Tujuan</th>
                  <th>Ringkasan Perubahan</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <p class="footer">Sumber: AbsensiKu /org/reports/mutations</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } catch (error) {
      const errorRef = reportError(error, "org.reports.mutations.print");
      toast.error(appendErrorReference("Gagal menyiapkan print PDF", errorRef));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserCog className="h-6 w-6" />
              Laporan Riwayat Mutasi
            </h1>
            <p className="text-muted-foreground">Riwayat pengajuan perubahan profil dan mutasi pegawai</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrintPdf} disabled={filteredRecords.length === 0 || isLoading}>
              <Printer className="mr-2 h-4 w-4" /> Print PDF
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={filteredRecords.length === 0 || isLoading}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <RequestReportsTabs />

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter Laporan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label>Tanggal Mulai</Label>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Tanggal Akhir</Label>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | MutationStatus)}>
                  <SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    <SelectItem value="menunggu">Menunggu</SelectItem>
                    <SelectItem value="disetujui">Disetujui</SelectItem>
                    <SelectItem value="ditolak">Ditolak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Jenis Mutasi</Label>
                <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | MutationType)}>
                  <SelectTrigger><SelectValue placeholder="Semua jenis" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua jenis</SelectItem>
                    <SelectItem value="profile_change">Perubahan Profil</SelectItem>
                    <SelectItem value="transfer">Mutasi/Pindah</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Filter OPD</Label>
                <Select value={opdFilter} onValueChange={setOpdFilter}>
                  <SelectTrigger><SelectValue placeholder="Semua OPD" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua OPD</SelectItem>
                    {opds.map((opd) => (
                      <SelectItem key={opd.id} value={opd.id}>
                        {opd.code} - {opd.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Filter Satuan Kerja</Label>
                <Select value={workUnitFilter} onValueChange={setWorkUnitFilter}>
                  <SelectTrigger><SelectValue placeholder="Semua satuan kerja" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua satuan kerja</SelectItem>
                    {workUnits.map((workUnit) => (
                      <SelectItem key={workUnit.id} value={workUnit.id}>
                        {workUnit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Pencarian</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Cari nama, NIP, alasan, tipe, atau status..."
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleShow} className="w-full" disabled={isLoading}>
                  {isLoading ? "Memuat..." : "Tampilkan"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hasil Laporan</CardTitle>
            <CardDescription>Total {totalRows} data mutasi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>OPD Saat Ini</TableHead>
                    <TableHead>OPD Tujuan</TableHead>
                    <TableHead>Ringkasan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
                      </TableCell>
                    </TableRow>
                  ) : !hasQueried ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Pilih filter lalu klik Tampilkan
                      </TableCell>
                    </TableRow>
                  ) : pagedRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Tidak ada data riwayat mutasi pada filter saat ini
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRecords.map((record, index) => {
                      const unit = resolveOpdAndUnit(record);
                      return (
                        <TableRow key={record.id}>
                          <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                          <TableCell>{format(new Date(record.created_at), "d MMM yyyy HH:mm", { locale: localeId })}</TableCell>
                          <TableCell>{record.employees?.name || "-"}</TableCell>
                          <TableCell className="font-mono text-sm">{record.employees?.nip || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{getMutationTypeLabel(record.mutation_type)}</Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(record.status)}</TableCell>
                          <TableCell>{unit.currentOpdLabel}</TableCell>
                          <TableCell>{unit.targetOpdLabel}</TableCell>
                          <TableCell className="max-w-[320px] truncate" title={getChangeSummary(record)}>
                            {getChangeSummary(record)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {hasQueried && totalRows > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalRows)} dari {totalRows} data
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Halaman {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_report_mutation" />
      </div>
    </OrganizationLayout>
  );
}
