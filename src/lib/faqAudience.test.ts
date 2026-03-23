import { describe, expect, it } from "vitest";
import { isFaqVisibleToPublic } from "@/lib/faqAudience";

describe("faqAudience", () => {
  it("marks public audience as visible on public surfaces", () => {
    expect(isFaqVisibleToPublic({ audience: "public" })).toBe(true);
  });

  it("marks employee audience as visible on public surfaces", () => {
    expect(isFaqVisibleToPublic({ audience: "employee" })).toBe(true);
  });

  it("does not show org admin audience on public surfaces", () => {
    expect(isFaqVisibleToPublic({ audience: "org_admin" })).toBe(false);
  });

  it("supports legacy items without explicit audience", () => {
    expect(
      isFaqVisibleToPublic({
        category: "Keamanan Pegawai",
        question: "Apakah ada validasi perangkat?",
        answer: "Ya, tersedia validasi perangkat untuk employee.",
      }),
    ).toBe(true);
  });
});
