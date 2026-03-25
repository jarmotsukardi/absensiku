import { format, type FormatOptions } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

export type AdminAttendanceRecordRow = Tables<"attendance_records_partitioned">;
export type AdminAttendanceEmployeeRow = Pick<Tables<"employees">, "id" | "name" | "nip" | "opd_id">;
export type AdminAttendanceOfficeRow = Pick<Tables<"offices">, "id" | "name">;
export type AdminAttendanceOpdRow = Pick<Tables<"opd">, "id" | "code" | "name">;

export type AdminAttendanceRecord = AdminAttendanceRecordRow & {
  employee?: AdminAttendanceEmployeeRow & { opd?: AdminAttendanceOpdRow };
  office?: AdminAttendanceOfficeRow;
};

const csvEscape = (value: string | number | null | undefined) => {
  const text = String(value ?? "-");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

const parseDateOnly = (dateValue: string) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

export const formatAdminAttendanceDate = (dateValue: string, pattern: string, options?: FormatOptions) => {
  return format(parseDateOnly(dateValue), pattern, options);
};

export function enrichAdminAttendanceRecords({
  records,
  employees,
  offices,
  opds,
}: {
  records: AdminAttendanceRecordRow[];
  employees: AdminAttendanceEmployeeRow[];
  offices: AdminAttendanceOfficeRow[];
  opds: AdminAttendanceOpdRow[];
}): AdminAttendanceRecord[] {
  const opdById = new Map(opds.map((item) => [item.id, item]));
  const employeeById = new Map(
    employees.map((item) => [
      item.id,
      {
        ...item,
        opd: item.opd_id ? opdById.get(item.opd_id) : undefined,
      },
    ]),
  );
  const officeById = new Map(offices.map((item) => [item.id, item]));

  return records.map((record) => ({
    ...record,
    employee: employeeById.get(record.employee_id),
    office: officeById.get(record.office_id),
  }));
}

export function buildAdminAttendanceCsv(records: AdminAttendanceRecord[]) {
  const headers = ["No", "Tanggal", "NIP", "Nama", "OPD", "Lokasi", "Jam Masuk", "Jam Keluar", "Status"];
  const rows = records.map((record, index) => [
    index + 1,
    formatAdminAttendanceDate(record.date, "dd/MM/yyyy"),
    record.employee?.nip || "-",
    record.employee?.name || "-",
    record.employee?.opd?.code || "-",
    record.office?.name || "-",
    record.check_in_time ? format(new Date(record.check_in_time), "HH:mm") : "-",
    record.check_out_time ? format(new Date(record.check_out_time), "HH:mm") : "-",
    record.status || "-",
  ]);

  return [headers, ...rows].map((row) => row.map((value) => csvEscape(value)).join(",")).join("\n");
}
