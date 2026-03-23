import { describe, expect, it } from "vitest";

import {
  applyEmployeeOpdChange,
  filterEmployeesByKeyword,
  getEmployeePayrollValidationErrors,
  getPayrollImpactGaps,
  sortEmployeesByPayrollGapSeverity,
  type EmployeeFormState,
  type EmployeeRow,
} from "@/lib/hrEmployees";

const buildEmployee = (overrides: Partial<EmployeeRow> = {}): EmployeeRow => ({
  id: "emp-1",
  name: "Budi Santoso",
  email: "budi@example.com",
  nik: "3174010101010001",
  nip: "198701012010011001",
  employee_category: "ASN",
  golongan: "III/a",
  position: "Analis SDM",
  position_id: "pos-1",
  opd_id: "opd-1",
  work_unit_id: "unit-1",
  office_id: "office-1",
  is_active: true,
  tenant_id: "tenant-1",
  user_id: "user-1",
  ...overrides,
});

describe("hrEmployees", () => {
  it("mencari pegawai juga berdasarkan NIK", () => {
    const rows = [
      buildEmployee(),
      buildEmployee({
        id: "emp-2",
        name: "Siti Aminah",
        email: "siti@example.com",
        nik: "3174010101010099",
      }),
    ];

    const result = filterEmployeesByKeyword(rows, "01010099");

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Siti Aminah");
  });

  it("mereset relasi turunan ketika OPD berubah", () => {
    const state: EmployeeFormState = {
      id: "emp-1",
      name: "Budi Santoso",
      email: "budi@example.com",
      nik: "3174010101010001",
      nip: "198701012010011001",
      employee_category: "ASN",
      golongan: "III/a",
      position: "Analis SDM",
      position_id: "pos-1",
      opd_id: "opd-lama",
      work_unit_id: "unit-lama",
      office_id: "office-lama",
      is_active: true,
    };

    const next = applyEmployeeOpdChange(state, "opd-baru");

    expect(next.opd_id).toBe("opd-baru");
    expect(next.work_unit_id).toBe("");
    expect(next.office_id).toBe("");
    expect(next.position_id).toBe("");
    expect(next.position).toBe("");
  });

  it("menghitung gap payroll-impact utama", () => {
    const gaps = getPayrollImpactGaps(
      buildEmployee({
        nik: "",
        employee_category: null,
        position: null,
        position_id: null,
        opd_id: null,
        work_unit_id: null,
        office_id: null,
      }),
    );

    expect(gaps).toEqual(["Kategori", "Jabatan", "NIK", "OPD", "Unit", "Lokasi"]);
  });

  it("mengurutkan pegawai berdasarkan severity gap payroll", () => {
    const sorted = sortEmployeesByPayrollGapSeverity([
      buildEmployee({
        id: "emp-1",
        name: "Budi Santoso",
      }),
      buildEmployee({
        id: "emp-2",
        name: "Andi Saputra",
        nik: "",
        employee_category: null,
        user_id: null,
      }),
      buildEmployee({
        id: "emp-3",
        name: "Citra Lestari",
        nik: "",
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["emp-2", "emp-3", "emp-1"]);
  });

  it("mewajibkan relasi payroll-impact saat menyimpan pegawai", () => {
    const errors = getEmployeePayrollValidationErrors({
      id: "",
      name: "Budi Santoso",
      email: "budi@example.com",
      nik: "3174010101010001",
      nip: "198701012010011001",
      employee_category: "ASN",
      golongan: "III/a",
      position: "Analis SDM",
      position_id: "",
      opd_id: "",
      work_unit_id: "",
      office_id: "",
      is_active: true,
    });

    expect(errors).toEqual([
      { field: "opd_id", message: "OPD pegawai wajib dipilih." },
      { field: "work_unit_id", message: "Unit kerja pegawai wajib dipilih." },
      { field: "office_id", message: "Lokasi kerja pegawai wajib dipilih." },
      { field: "position_id", message: "Jabatan master pegawai wajib dipilih." },
    ]);
  });
});
