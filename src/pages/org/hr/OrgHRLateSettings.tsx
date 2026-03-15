import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { Clock3, Pencil, TimerReset, Building2 } from "lucide-react";
import { toast } from "sonner";

type WorkHourRow = {
  id: string;
  tenant_id: string;
  institution_type: string;
  day_of_week: number;
  time_in: string;
  time_out: string;
  late_tolerance_minutes: number | null;
  is_active: boolean;
};

const DAY_LABELS: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

const INSTITUTION_LABELS: Record<string, string> = {
  pemerintahan: "Pemerintahan",
  rumah_sakit: "Rumah Sakit",
  puskesmas: "Puskesmas",
  sekolah: "Sekolah",
};

export default function OrgHRLateSettings() {
  const [rows, setRows] = useState<WorkHourRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterInstitution, setFilterInstitution] = useState<string>("all");
  const [editingRow, setEditingRow] = useState<WorkHourRow | null>(null);
  const [toleranceInput, setToleranceInput] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/late-settings");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data, error } = await supabase
        .from("work_hours")
        .select("id, tenant_id, institution_type, day_of_week, time_in, time_out, late_tolerance_minutes, is_active")
        .eq("tenant_id", tenantId)
        .order("institution_type", { ascending: true })
        .order("day_of_week", { ascending: true });

      if (error) throw error;
      setRows((data || []) as WorkHourRow[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.late-settings.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan keterlambatan", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    if (filterInstitution === "all") return rows;
    return rows.filter((item) => item.institution_type === filterInstitution);
  }, [filterInstitution, rows]);

  const summary = useMemo(() => {
    const activeRows = rows.filter((item) => item.is_active);
    const toleranceValues = activeRows.map((item) => item.late_tolerance_minutes || 0);
    const avgTolerance = toleranceValues.length
      ? Math.round(toleranceValues.reduce((sum, value) => sum + value, 0) / toleranceValues.length)
      : 0;

    return {
      totalTemplates: rows.length,
      activeTemplates: activeRows.length,
      avgTolerance,
      institutions: new Set(rows.map((item) => item.institution_type)).size,
    };
  }, [rows]);

  const handleOpenEdit = (row: WorkHourRow) => {
    if (!access.canConfigure) {
      toast.error("Aksi ubah toleransi hanya tersedia untuk admin organisasi.");
      return;
    }
    setEditingRow(row);
    setToleranceInput(String(row.late_tolerance_minutes ?? 0));
  };

  const handleSave = async () => {
    if (!access.canConfigure) {
      toast.error("Aksi simpan toleransi hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!editingRow) return;
    const tolerance = Math.max(0, Number.parseInt(toleranceInput, 10) || 0);
    setIsSaving(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const { error } = await supabase
        .from("work_hours")
        .update({ late_tolerance_minutes: tolerance })
        .eq("id", editingRow.id)
        .eq("tenant_id", tenantId);

      if (error) throw error;

      toast.success("Pengaturan keterlambatan berhasil diperbarui.");
      setEditingRow(null);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.late-settings.save", { work_hour_id: editingRow.id });
      toast.error(appendErrorReference("Gagal menyimpan pengaturan keterlambatan", ref));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kebijakan HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Pengaturan Keterlambatan</h1>
          <p className="text-sm text-muted-foreground">
            Atur toleransi keterlambatan per template jam kerja agar aturan kehadiran tetap konsisten lintas unit.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Templat Jam Kerja" value={summary.totalTemplates} icon={Clock3} description="Semua templat work_hours" />
          <StatCard title="Templat Aktif" value={summary.activeTemplates} icon={TimerReset} description="Aktif dipakai organisasi" />
          <StatCard title="Rata-rata Toleransi" value={summary.avgTolerance} icon={Clock3} description="Dalam menit" suffix=" menit" />
          <StatCard title="Tipe Instansi" value={summary.institutions} icon={Building2} description="Variasi template aktif" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Konfigurasi Toleransi</CardTitle>
                <CardDescription>
                  Toleransi diambil langsung dari `work_hours`. Pengaturan jam kerja dan hari kerja tetap bisa dibuka dari modul jadwal.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={filterInstitution} onValueChange={setFilterInstitution}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Semua tipe instansi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua tipe instansi</SelectItem>
                    {Object.entries(INSTITUTION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/work-hours">Buka Jam Kerja Lengkap</OrgHRContextLink>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : filteredRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Belum ada template jam kerja yang bisa dipakai untuk mengatur toleransi keterlambatan.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instansi</TableHead>
                    <TableHead>Hari</TableHead>
                    <TableHead>Jam Kerja</TableHead>
                    <TableHead>Toleransi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{INSTITUTION_LABELS[row.institution_type] || row.institution_type}</TableCell>
                      <TableCell>{DAY_LABELS[row.day_of_week] || `Hari ${row.day_of_week}`}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.time_in.slice(0, 5)} - {row.time_out.slice(0, 5)}
                      </TableCell>
                      <TableCell>{row.late_tolerance_minutes ?? 0} menit</TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? "default" : "secondary"}>
                          {row.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {access.canConfigure && (
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Ubah Toleransi Keterlambatan</DialogTitle>
              <DialogDescription>
                Perubahan ini langsung memengaruhi validasi keterlambatan untuk template jam kerja yang dipilih.
              </DialogDescription>
            </DialogHeader>
            {editingRow && (
              <div className="space-y-4 py-2">
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <div>{INSTITUTION_LABELS[editingRow.institution_type] || editingRow.institution_type}</div>
                  <div className="text-muted-foreground">
                    {DAY_LABELS[editingRow.day_of_week] || `Hari ${editingRow.day_of_week}`} • {editingRow.time_in.slice(0, 5)} - {editingRow.time_out.slice(0, 5)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="late_tolerance_minutes">Toleransi Keterlambatan (menit)</Label>
                  <Input
                    id="late_tolerance_minutes"
                    type="number"
                    min={0}
                    value={toleranceInput}
                    onChange={(event) => setToleranceInput(event.target.value)}
                    disabled={isSaving}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingRow(null)} disabled={isSaving}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !access.canConfigure}>
                {isSaving ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  suffix = "",
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
  suffix?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">
          {value}
          {suffix}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className="h-4 w-4 text-amber-600" />
        </div>
      </CardContent>
    </Card>
  );
}
