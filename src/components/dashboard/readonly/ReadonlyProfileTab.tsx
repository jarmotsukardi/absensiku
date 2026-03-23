import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MutationSection } from "@/components/employee/MutationSection";
import {
  DEFAULT_ORG_MASTER_DATA_MODULES,
  fetchTenantOrgMasterDataModules,
} from "@/lib/orgMasterDataModules";

interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  nik?: string | null;
  nip?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  gender?: string | null;
  golongan?: string | null;
  employee_category?: string | null;
  position?: string | null;
  is_active?: boolean | null;
  tenant_id?: string | null;
  office_id?: string | null;
  opd_id?: string | null;
  work_unit_id?: string | null;
  offices?: { id?: string | null; name?: string | null; address?: string | null } | null;
  opd?: { id?: string | null; name?: string | null; code?: string | null } | null;
  work_unit?: { id?: string | null; name?: string | null } | null;
}

interface ReadonlyProfileTabProps {
  panelClass: string;
  employee: EmployeeProfile | null;
  onForgotPassword: () => void;
  onRefreshData: () => void;
}

export function ReadonlyProfileTab({
  panelClass,
  employee,
  onForgotPassword,
  onRefreshData,
}: ReadonlyProfileTabProps) {
  const [masterDataModules, setMasterDataModules] = useState(DEFAULT_ORG_MASTER_DATA_MODULES);

  useEffect(() => {
    let isActive = true;
    const loadMasterDataModules = async () => {
      if (!employee?.tenant_id) {
        if (isActive) setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
        return;
      }
      try {
        const moduleSetting = await fetchTenantOrgMasterDataModules(employee.tenant_id);
        if (isActive) {
          setMasterDataModules(moduleSetting.modules);
        }
      } catch {
        if (isActive) {
          setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
        }
      }
    };

    void loadMasterDataModules();
    return () => {
      isActive = false;
    };
  }, [employee?.tenant_id]);

  const showPositionField = masterDataModules.positions;
  const showGolonganField = masterDataModules.employee_golongan;
  const showCategoryField = masterDataModules.employee_categories;

  return (
    <div className="space-y-4">
      <Card className={panelClass}>
        <CardHeader>
          <CardTitle>Profil Pegawai</CardTitle>
          <CardDescription>Informasi akun dan identitas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{employee?.is_active === false ? "Nonaktif" : "Aktif"}</Badge>
            {showCategoryField && employee?.employee_category ? (
              <Badge variant="secondary">{employee.employee_category}</Badge>
            ) : null}
            {showGolonganField && employee?.golongan ? (
              <Badge variant="secondary">Gol. {employee.golongan}</Badge>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoItem label="Nama" value={employee?.name} />
            <InfoItem label="Email" value={employee?.email} />
            <InfoItem label="NIP" value={employee?.nip} />
            <InfoItem label="WhatsApp" value={employee?.whatsapp} />
            <InfoItem label="No. Telepon" value={employee?.phone} />
            <InfoItem label="Jenis Kelamin" value={employee?.gender} />
            <InfoItem label="Alamat" value={employee?.address} />
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Informasi Kepegawaian</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {showPositionField ? <InfoItem label="Jabatan" value={employee?.position} /> : null}
              <InfoItem label="Instansi/OPD" value={employee?.opd?.name} />
              <InfoItem label="Unit Kerja" value={employee?.work_unit?.name} />
              <InfoItem label="Kantor" value={employee?.offices?.name} />
              <InfoItem label="Alamat Kantor" value={employee?.offices?.address} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" className="hover:border-blue-300 hover:bg-blue-50" onClick={onForgotPassword}>Ganti Password</Button>
            <Button variant="outline" className="hover:border-blue-300 hover:bg-blue-50" onClick={onRefreshData}>Refresh Data</Button>
          </div>
        </CardContent>
      </Card>

      <MutationSection
        employee={employee ? {
          id: employee.id,
          tenant_id: employee.tenant_id || undefined,
          name: employee.name,
          nip: employee.nip || undefined,
          nik: employee.nik || "",
          email: employee.email,
          phone: employee.phone || undefined,
          whatsapp: employee.whatsapp || undefined,
          address: employee.address || undefined,
          gender: employee.gender || undefined,
          golongan: employee.golongan || undefined,
          position: employee.position || undefined,
          employee_category: employee.employee_category || undefined,
          opd_id: employee.opd_id || undefined,
          work_unit_id: employee.work_unit_id || undefined,
          office_id: employee.office_id || undefined,
          opd: employee.opd ? {
            id: employee.opd.id || undefined,
            name: employee.opd.name || "",
            code: employee.opd.code || undefined,
          } : null,
          work_unit: employee.work_unit ? {
            id: employee.work_unit.id || undefined,
            name: employee.work_unit.name || "",
          } : null,
          offices: employee.offices ? {
            id: employee.offices.id || undefined,
            name: employee.offices.name || "",
          } : null,
        } : null}
        onRefresh={onRefreshData}
      />
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value || "-"}</p>
    </div>
  );
}
