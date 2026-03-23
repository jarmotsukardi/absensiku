import { describe, expect, it } from "vitest";
import { getTopupRequestIdFromErrorEntry, resolveTabForErrorEntry } from "@/lib/errorLogRouting";

describe("errorLogRouting", () => {
  it("extracts topup request id from metadata keys", () => {
    expect(getTopupRequestIdFromErrorEntry({ metadata: { topup_request_id: "abc-123" } })).toBe("abc-123");
    expect(getTopupRequestIdFromErrorEntry({ metadata: { request_id: "req-9" } })).toBe("req-9");
    expect(getTopupRequestIdFromErrorEntry({ metadata: { request_id: 123 } })).toBeNull();
  });

  it("resolves severity tab consistently", () => {
    expect(resolveTabForErrorEntry({ isArchived: true }, true)).toBe("archived_non_critical");
    expect(resolveTabForErrorEntry({ isArchived: true }, false)).toBe("archived_critical");
    expect(resolveTabForErrorEntry({ isResolved: true }, false)).toBe("resolved_critical");
    expect(resolveTabForErrorEntry({}, true)).toBe("non_critical");
    expect(resolveTabForErrorEntry({}, false)).toBe("critical");
  });
});

