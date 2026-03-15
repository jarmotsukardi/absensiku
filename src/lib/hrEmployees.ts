import type { Database } from "@/integrations/supabase/types";

export type EmployeeRow = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  | "id"
  | "name"
  | "email"
  | "nik"
  | "nip"
  | "employee_category"
  | "golongan"
  | "position"
  | "position_id"
  | "opd_id"
  | "work_unit_id"
  | "office_id"
  | "is_active"
  | "tenant_id"
  | "user_id"
>;

export type MasterReference = {
  id: string;
  name: string;
  opd_id?: string | null;
};

export type EmployeeFormState = {
  id: string;
  name: string;
  email: string;
  nik: string;
  nip: string;
  employee_category: string;
  golongan: string;
  position: string;
  position_id: string;
  opd_id: string;
  work_unit_id: string;
  office_id: string;
  is_active: boolean;
};

export type EmployeePayrollValidationError = {
  field: string;
  message: string;
};

export const PAYROLL_GAP_LABELS = ["Kategori", "Jabatan", "NIK", "OPD", "Unit", "Lokasi"] as const;
export const EMPLOYEE_CATEGORY_OPTIONS = ["ASN", "P3K"] as const;

export const getPayrollImpactGaps = (row: EmployeeRow) => {
  const gaps: string[] = [];
  if (!row.employee_category?.trim()) gaps.push("Kategori");
  if (!row.position?.trim() && !row.position_id) gaps.push("Jabatan");
  if (!row.nik?.trim()) gaps.push("NIK");
  if (!row.opd_id) gaps.push("OPD");
  if (!row.work_unit_id) gaps.push("Unit");
  if (!row.office_id) gaps.push("Lokasi");
  return gaps;
};

export const sortEmployeesByPayrollGapSeverity = (rows: EmployeeRow[]) =>
  [...rows].sort((left, right) => {
    const leftGaps = getPayrollImpactGaps(left);
    const rightGaps = getPayrollImpactGaps(right);
    if (leftGaps.length !== rightGaps.length) return rightGaps.length - leftGaps.length;
    if (Boolean(left.user_id) !== Boolean(right.user_id)) return Number(Boolean(left.user_id)) - Number(Boolean(right.user_id));
    return left.name.localeCompare(right.name, "id-ID");
  });

export const getPayrollGapFieldId = (gap: string) => {
  switch (gap) {
    case "Kategori":
      return "employee-category";
    case "Jabatan":
      return "employee-position";
    case "NIK":
      return "employee-nik";
    case "OPD":
      return "employee-opd";
    case "Unit":
      return "employee-work-unit";
    case "Lokasi":
      return "employee-office";
    default:
      return "";
  }
};

export const filterEmployeesByKeyword = (rows: EmployeeRow[], keyword: string) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return rows;
  return rows.filter((item) =>
    [item.name, item.email, item.nik || "", item.nip || "", item.employee_category || "", item.golongan || ""]
      .join(" ")
      .toLowerCase()
      .includes(normalizedKeyword),
  );
};

export const applyEmployeeOpdChange = (state: EmployeeFormState, opdId: string): EmployeeFormState => ({
  ...state,
  opd_id: opdId,
  work_unit_id: "",
  office_id: "",
  position_id: "",
  position: "",
});

export const getEmployeePayrollValidationErrors = (state: EmployeeFormState): EmployeePayrollValidationError[] => {
  const errors: EmployeePayrollValidationError[] = [];

  if (!state.name.trim()) errors.push({ field: "name", message: "Nama pegawai wajib diisi." });
  if (!state.email.trim()) errors.push({ field: "email", message: "Email pegawai wajib diisi." });
  if (!state.nik.trim()) errors.push({ field: "nik", message: "NIK pegawai wajib diisi." });
  if (!state.employee_category.trim()) errors.push({ field: "employee_category", message: "Kategori pegawai wajib diisi." });
  if (!state.position.trim()) errors.push({ field: "position", message: "Jabatan pegawai wajib diisi." });
  if (!state.opd_id) errors.push({ field: "opd_id", message: "OPD pegawai wajib dipilih." });
  if (!state.work_unit_id) errors.push({ field: "work_unit_id", message: "Unit kerja pegawai wajib dipilih." });
  if (!state.office_id) errors.push({ field: "office_id", message: "Lokasi kerja pegawai wajib dipilih." });
  if (!state.position_id) errors.push({ field: "position_id", message: "Jabatan master pegawai wajib dipilih." });

  return errors;
};
