import { describe, expect, it } from "vitest";
import {
  buildAdminAttendanceCsv,
  enrichAdminAttendanceRecords,
  formatAdminAttendanceDate,
} from "@/lib/adminAttendanceReport";

describe("adminAttendanceReport", () => {
  it("enriches attendance rows with employee, office, and opd data", () => {
    const result = enrichAdminAttendanceRecords({
      records: [
        {
          id: "att-1",
          employee_id: "emp-1",
          office_id: "office-1",
          date: "2026-03-23",
          check_in_time: null,
          check_out_time: null,
          status: "hadir",
          check_in_distance_meters: null,
          check_in_latitude: null,
          check_in_longitude: null,
          check_out_distance_meters: null,
          check_out_latitude: null,
          check_out_longitude: null,
          created_at: null,
          flexible_attendance_reason: null,
          is_corrected: null,
          is_flexible_attendance: null,
          is_wfh: null,
          notes: null,
          original_shift_id: null,
          shift_change_reason: null,
          shift_changed_at: null,
          shift_id: null,
          updated_at: null,
        },
      ],
      employees: [{ id: "emp-1", name: "Nadia", nip: "1987", opd_id: "opd-1" }],
      offices: [{ id: "office-1", name: "Kantor Pusat" }],
      opds: [{ id: "opd-1", code: "BKD", name: "Badan Kepegawaian" }],
    });

    expect(result[0]?.employee?.name).toBe("Nadia");
    expect(result[0]?.employee?.opd?.code).toBe("BKD");
    expect(result[0]?.office?.name).toBe("Kantor Pusat");
  });

  it("builds csv with enriched values and safe date formatting", () => {
    const csv = buildAdminAttendanceCsv([
      {
        id: "att-1",
        employee_id: "emp-1",
        office_id: "office-1",
        date: "2026-03-23",
        check_in_time: null,
        check_out_time: null,
        status: "hadir",
        check_in_distance_meters: null,
        check_in_latitude: null,
        check_in_longitude: null,
        check_out_distance_meters: null,
        check_out_latitude: null,
        check_out_longitude: null,
        created_at: null,
        flexible_attendance_reason: null,
        is_corrected: null,
        is_flexible_attendance: null,
        is_wfh: null,
        notes: null,
        original_shift_id: null,
        shift_change_reason: null,
        shift_changed_at: null,
        shift_id: null,
        updated_at: null,
        employee: {
          id: "emp-1",
          name: "Nadia",
          nip: "1987",
          opd_id: "opd-1",
          opd: { id: "opd-1", code: "BKD", name: "Badan Kepegawaian" },
        },
        office: { id: "office-1", name: "Kantor Pusat" },
      },
    ]);

    expect(csv).toContain("23/03/2026");
    expect(csv).toContain("Nadia");
    expect(csv).toContain("BKD");
    expect(csv).toContain("Kantor Pusat");
  });

  it("formats date-only strings without timezone drift", () => {
    expect(formatAdminAttendanceDate("2026-03-23", "dd/MM/yyyy")).toBe("23/03/2026");
  });
});
