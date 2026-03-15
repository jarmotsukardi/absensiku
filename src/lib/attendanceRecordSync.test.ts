import { describe, expect, it } from "vitest";

import { reconcileTodayAttendance } from "./attendanceRecordSync";

interface TestAttendanceRecord {
  id: string;
  check_in_time: string | null;
  check_out_time: string | null;
}

describe("reconcileTodayAttendance", () => {
  it("preserves local check-in when server record is still empty", () => {
    const localRecord: TestAttendanceRecord = {
      id: "idb-local-check-in",
      check_in_time: "2026-03-09T01:02:03.000Z",
      check_out_time: null,
    };

    expect(reconcileTodayAttendance<TestAttendanceRecord>(null, localRecord)).toEqual(localRecord);
  });

  it("prefers server record when it is equally complete", () => {
    const localRecord: TestAttendanceRecord = {
      id: "idb-local-check-in",
      check_in_time: "2026-03-09T01:02:03.000Z",
      check_out_time: null,
    };
    const serverRecord: TestAttendanceRecord = {
      id: "server-check-in",
      check_in_time: "2026-03-09T01:02:03.000Z",
      check_out_time: null,
    };

    expect(reconcileTodayAttendance(serverRecord, localRecord)).toEqual(serverRecord);
  });

  it("preserves the more complete local check-out state until server catches up", () => {
    const localRecord: TestAttendanceRecord = {
      id: "idb-local-check-out",
      check_in_time: "2026-03-09T01:02:03.000Z",
      check_out_time: "2026-03-09T09:10:11.000Z",
    };
    const serverRecord: TestAttendanceRecord = {
      id: "server-check-in",
      check_in_time: "2026-03-09T01:02:03.000Z",
      check_out_time: null,
    };

    expect(reconcileTodayAttendance(serverRecord, localRecord)).toEqual(localRecord);
  });
});
