import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, UserCog } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface Employee {
  id: string;
  name: string;
  nip?: string;
  tenant_id: string;
  opd_id?: string;
  work_unit_id?: string;
  office_id?: string;
  opd?: { id: string; name: string } | null;
  work_unit?: { id: string; name: string } | null;
  offices?: { id: string; name: string } | null;
}

interface AdminMutationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  onSuccess?: () => void;
}

interface OPD {
  id: string;
  name: string;
}

interface WorkUnit {
  id: string;
  name: string;
  opd_id: string;
}

interface Office {
  id: string;
  name: string;
  opd_id?: string;
}

export function AdminMutationForm({ open, onOpenChange, employee, onSuccess }: AdminMutationFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedOpdId, setSelectedOpdId] = useState<string>("");
  const [selectedWorkUnitId, setSelectedWorkUnitId] = useState<string>("");
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>("");
  
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  
  const [filteredWorkUnits, setFilteredWorkUnits] = useState<WorkUnit[]>([]);
  const [filteredOffices, setFilteredOffices] = useState<Office[]>([]);

  const tenantId = employee?.tenant_id ?? null;

  const fetchMasterData = useCallback(async () => {
    if (!tenantId) return;

    setIsLoading(true);
    try {
      const [opdRes, workUnitRes, officeRes] = await withTimeout(
        () =>
          Promise.all([
            supabase.from("opd").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
            supabase
              .from("work_units")
              .select("id, name, opd_id")
              .eq("tenant_id", tenantId)
              .eq("is_active", true)
              .order("name"),
            supabase
              .from("offices")
              .select("id, name, opd_id")
              .eq("tenant_id", tenantId)
              .eq("is_active", true)
              .order("name"),
          ]),
        12000,
      );

      if (opdRes.error) throw opdRes.error;
      if (workUnitRes.error) throw workUnitRes.error;
      if (officeRes.error) throw officeRes.error;

      setOpdList(opdRes.data || []);
      setWorkUnits(workUnitRes.data || []);
      setOffices(officeRes.data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.admin_mutation.fetch_master_data", {
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal memuat data mutasi", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (open && tenantId) {
      void fetchMasterData();
      // Set initial values from employee data
      setSelectedOpdId(employee?.opd_id || "");
      setSelectedWorkUnitId(employee?.work_unit_id || "");
      setSelectedOfficeId(employee?.office_id || "");
    }
  }, [open, employee, fetchMasterData, tenantId]);

  useEffect(() => {
    if (selectedOpdId) {
      setFilteredWorkUnits(workUnits.filter((wu) => wu.opd_id === selectedOpdId));
      setFilteredOffices(offices.filter((o) => o.opd_id === selectedOpdId));
    } else {
      setFilteredWorkUnits([]);
      setFilteredOffices([]);
    }
  }, [selectedOpdId, workUnits, offices]);

  const handleSubmit = async () => {
    if (!employee || !reason.trim()) {
      toast.error("Alasan mutasi harus diisi");
      return;
    }

    const hasChanges =
      selectedOpdId !== (employee.opd_id || "") ||
      selectedWorkUnitId !== (employee.work_unit_id || "") ||
      selectedOfficeId !== (employee.office_id || "");

    if (!hasChanges) {
      toast.error("Tidak ada perubahan yang dilakukan");
      return;
    }

    setIsSaving(true);
    try {
      // Prepare changes
      const requestedChanges: Record<string, string> = {};
      const originalData: Record<string, string> = {};

      if (selectedOpdId !== (employee.opd_id || "")) {
        requestedChanges.opd_id = selectedOpdId;
        originalData.opd_id = employee.opd?.name || "-";
      }
      if (selectedWorkUnitId !== (employee.work_unit_id || "")) {
        requestedChanges.work_unit_id = selectedWorkUnitId;
        originalData.work_unit_id = employee.work_unit?.name || "-";
      }
      if (selectedOfficeId !== (employee.office_id || "")) {
        requestedChanges.office_id = selectedOfficeId;
        originalData.office_id = employee.offices?.name || "-";
      }

      // Directly update employee (admin-initiated mutation)
      const { error: updateError } = await withTimeout(
        () => supabase.from("employees").update(requestedChanges).eq("id", employee.id),
        12000,
      );

      if (updateError) throw updateError;

      // Log the mutation in mutation_requests as "disetujui" (admin action)
      const { error: logError } = await withTimeout(
        () =>
          supabase.from("mutation_requests").insert({
            tenant_id: employee.tenant_id,
            employee_id: employee.id,
            mutation_type: "transfer",
            requested_changes: requestedChanges,
            original_data: originalData,
            reason: `[Admin] ${reason}`,
            status: "disetujui",
            approved_at: new Date().toISOString(),
          }),
        12000,
      );

      if (logError) throw logError;

      // Create notification for employee
      const { data: empUser, error: empUserError } = await withTimeout(
        () => supabase.from("employees").select("user_id").eq("id", employee.id).single(),
        12000,
      );
      if (empUserError) throw empUserError;

      if (empUser?.user_id) {
        const { error: notifError } = await withTimeout(
          () =>
            supabase.from("notifications").insert({
              user_id: empUser.user_id,
              title: "Anda Dimutasi",
              message: `Admin telah memutasi Anda dengan alasan: ${reason}`,
              type: "info",
              related_id: employee.id,
              related_type: "mutation",
            }),
          12000,
        );
        if (notifError) throw notifError;
      }

      toast.success("Mutasi berhasil dilakukan");
      onOpenChange(false);
      setReason("");
      onSuccess?.();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.admin_mutation.process", {
        employee_id: employee.id,
        tenant_id: employee.tenant_id,
      });
      const errorMessage = error instanceof Error ? error.message : "Gagal melakukan mutasi";
      toast.error("Gagal melakukan mutasi", {
        description: appendErrorReference(errorMessage, errorRef),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpdChange = (value: string) => {
    setSelectedOpdId(value);
    setSelectedWorkUnitId("");
    setSelectedOfficeId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Mutasi Pegawai
          </DialogTitle>
          <DialogDescription>
            {employee?.name} ({employee?.nip || "-"})
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>OPD Tujuan</Label>
              <Select value={selectedOpdId} onValueChange={handleOpdChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih OPD" />
                </SelectTrigger>
                <SelectContent>
                  {opdList.map((opd) => (
                    <SelectItem key={opd.id} value={opd.id}>
                      {opd.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employee?.opd && (
                <p className="text-xs text-muted-foreground">
                  Saat ini: {employee.opd.name}
                </p>
              )}
            </div>

            {selectedOpdId && (
              <>
                <div className="space-y-2">
                  <Label>Satuan Kerja Tujuan</Label>
                  <Select value={selectedWorkUnitId || "_none_"} onValueChange={(val) => setSelectedWorkUnitId(val === "_none_" ? "" : val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Satuan Kerja" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none_">- Tidak Ada -</SelectItem>
                      {filteredWorkUnits.map((wu) => (
                        <SelectItem key={wu.id} value={wu.id}>
                          {wu.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Lokasi Kerja Tujuan</Label>
                  <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih Lokasi Kerja" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredOffices.map((office) => (
                        <SelectItem key={office.id} value={office.id}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Alasan Mutasi *</Label>
              <Textarea
                placeholder="Jelaskan alasan mutasi..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !reason.trim()}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Simpan Mutasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
