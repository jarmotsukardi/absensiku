import { describe, expect, it } from "vitest";

import { formatDateKeyInTimezone } from "./timezone";

describe("formatDateKeyInTimezone", () => {
  it("keeps the same date when UTC time is still the same calendar day in Jakarta", () => {
    expect(formatDateKeyInTimezone("2026-03-09T16:30:00.000Z", "Asia/Jakarta")).toBe("2026-03-09");
  });

  it("rolls over to the next local date after midnight in Jakarta", () => {
    expect(formatDateKeyInTimezone("2026-03-09T17:30:00.000Z", "Asia/Jakarta")).toBe("2026-03-10");
  });
});
