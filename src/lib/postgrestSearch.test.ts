import { describe, expect, it } from "vitest";
import { buildPostgrestOrClause, sanitizeOrKeyword } from "@/lib/postgrestSearch";

describe("postgrestSearch", () => {
  it("normalizes special chars that can break PostgREST or filters", () => {
    expect(sanitizeOrKeyword("abc,def(ghi)%jkl")).toBe("abc def ghi jkl");
    expect(sanitizeOrKeyword("O'Reilly`name\"test")).toBe("O Reilly name test");
  });

  it("keeps identifier chars that are meaningful in search tokens", () => {
    expect(sanitizeOrKeyword("E2E-AUDIT_HR.2026@example.com")).toBe("E2E-AUDIT_HR.2026@example.com");
  });

  it("collapses repeated whitespace and trims edges", () => {
    expect(sanitizeOrKeyword("   alpha    beta   ")).toBe("alpha beta");
    expect(sanitizeOrKeyword("\nfoo\t\tbar  baz\n")).toBe("foo bar baz");
  });

  it("returns empty string when input is empty or only blocked chars", () => {
    expect(sanitizeOrKeyword("")).toBe("");
    expect(sanitizeOrKeyword(" ,()%\"'` ")).toBe("");
  });

  it("builds postgrest or clause from ilike and optional in filters", () => {
    expect(
      buildPostgrestOrClause({
        keyword: " kontrak-aktif ",
        ilikeFields: ["contract_number", "notes"],
        inFilters: [{ field: "employee_id", values: ["emp-1", "emp-2"] }],
      }),
    ).toBe("contract_number.ilike.%kontrak-aktif%,notes.ilike.%kontrak-aktif%,employee_id.in.(emp-1,emp-2)");
  });

  it("sanitizes and deduplicates in filter values", () => {
    expect(
      buildPostgrestOrClause({
        keyword: "cek",
        ilikeFields: ["notes"],
        inFilters: [{ field: "employee_id", values: ["emp-1", "emp(1)", " emp-1 ", " , ", "emp_2"] }],
      }),
    ).toBe("notes.ilike.%cek%,employee_id.in.(emp-1,emp1,emp_2)");
  });

  it("returns null when keyword or ilike fields are invalid", () => {
    expect(buildPostgrestOrClause({ keyword: "   ", ilikeFields: ["notes"] })).toBeNull();
    expect(buildPostgrestOrClause({ keyword: "x", ilikeFields: [] })).toBeNull();
  });
});
