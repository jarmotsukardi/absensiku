export type EmployeeStatusValidationInput = {
  employeeId: string;
  employeeName: string;
  employeeCategory: string;
  effectiveDate: string;
  reason: string;
  joinedDate?: string | null;
};

export type ContractValidationInput = {
  employeeId: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "ended" | "terminated";
  effectiveDate: string;
  statusReason: string;
};

const NORMALIZED_MAX_DATE = "9999-12-31";

export const isDateInsideRange = (date: string, startDate: string, endDate: string | null) => {
  const normalizedEndDate = endDate || NORMALIZED_MAX_DATE;
  return date >= startDate && date <= normalizedEndDate;
};

export const validateEmployeeStatusForm = (input: EmployeeStatusValidationInput): string | null => {
  if (!input.employeeId) {
    return "Pegawai tidak valid.";
  }
  if (!input.employeeCategory.trim()) {
    return "Kategori pegawai wajib diisi.";
  }
  if (!input.effectiveDate) {
    return "Tanggal efektif wajib diisi.";
  }
  if (input.joinedDate && input.effectiveDate < input.joinedDate.slice(0, 10)) {
    return "Tanggal efektif tidak boleh sebelum tanggal masuk pegawai.";
  }
  if (!input.reason.trim()) {
    return "Alasan perubahan status wajib diisi.";
  }
  return null;
};

export const validateContractForm = (input: ContractValidationInput): string | null => {
  if (!input.employeeId) {
    return "Pegawai wajib dipilih";
  }
  if (!input.startDate) {
    return "Tanggal mulai kontrak wajib diisi";
  }
  if (input.endDate && input.endDate < input.startDate) {
    return "Tanggal berakhir tidak boleh sebelum tanggal mulai";
  }
  if (!input.effectiveDate) {
    return "Tanggal efektif kontrak wajib diisi";
  }
  if (input.effectiveDate < input.startDate) {
    return "Tanggal efektif tidak boleh sebelum tanggal mulai kontrak";
  }
  if ((input.status === "ended" || input.status === "terminated") && !input.endDate) {
    return "Tanggal berakhir wajib diisi untuk kontrak berakhir atau terminasi";
  }
  if ((input.status === "ended" || input.status === "terminated") && !input.statusReason.trim()) {
    return "Alasan status wajib diisi untuk kontrak berakhir atau terminasi";
  }
  if (input.endDate && input.effectiveDate > input.endDate) {
    return "Tanggal efektif tidak boleh melewati tanggal berakhir kontrak";
  }
  if (input.status === "active" && !isDateInsideRange(input.effectiveDate, input.startDate, input.endDate || null)) {
    return "Kontrak aktif harus punya tanggal efektif di dalam rentang kontrak";
  }
  return null;
};
