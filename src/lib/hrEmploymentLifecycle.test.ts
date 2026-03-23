import { describe, expect, it } from "vitest";

import { validateContractForm, validateEmployeeStatusForm } from "@/lib/hrEmploymentLifecycle";

describe("hrEmploymentLifecycle", () => {
  it("menolak status efektif sebelum tanggal masuk pegawai", () => {
    expect(
      validateEmployeeStatusForm({
        employeeId: "emp-1",
        employeeName: "Budi Santoso",
        employeeCategory: "ASN",
        effectiveDate: "2026-03-10",
        reason: "Koreksi data",
        joinedDate: "2026-03-12T08:00:00.000Z",
      }),
    ).toBe("Tanggal efektif tidak boleh sebelum tanggal masuk pegawai.");
  });

  it("mewajibkan kategori pada perubahan status kepegawaian", () => {
    expect(
      validateEmployeeStatusForm({
        employeeId: "emp-1",
        employeeName: "Budi Santoso",
        employeeCategory: "",
        effectiveDate: "2026-03-12",
        reason: "Koreksi data",
        joinedDate: "2026-03-12T08:00:00.000Z",
      }),
    ).toBe("Kategori pegawai wajib diisi.");
  });

  it("menolak tanggal efektif kontrak di luar rentang kontrak aktif", () => {
    expect(
      validateContractForm({
        employeeId: "emp-1",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        status: "active",
        effectiveDate: "2026-04-01",
        statusReason: "",
      }),
    ).toBe("Tanggal efektif tidak boleh melewati tanggal berakhir kontrak");
  });

  it("mewajibkan alasan untuk kontrak berakhir", () => {
    expect(
      validateContractForm({
        employeeId: "emp-1",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        status: "ended",
        effectiveDate: "2026-03-31",
        statusReason: "",
      }),
    ).toBe("Alasan status wajib diisi untuk kontrak berakhir atau terminasi");
  });
});
