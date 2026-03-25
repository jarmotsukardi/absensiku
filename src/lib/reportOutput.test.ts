import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auditLoggingPolicy", () => ({
  logAuditIfEnabled: vi.fn(),
}));

vi.mock("@/lib/errorLogger", () => ({
  reportError: vi.fn(),
}));

import { buildReportCsv, createReportTraceId } from "@/lib/reportOutput";

describe("reportOutput", () => {
  it("builds csv with BOM and escapes commas and quotes", () => {
    const csv = buildReportCsv({
      columns: [
        { header: "Nama", value: (row: { name: string }) => row.name },
        { header: "Catatan", value: (row: { note: string }) => row.note },
      ],
      rows: [
        {
          name: 'Dinas "A"',
          note: "Baris, penting",
        },
      ],
    });

    expect(csv.startsWith("\uFEFFNama,Catatan")).toBe(true);
    expect(csv).toContain('"Dinas ""A"""');
    expect(csv).toContain('"Baris, penting"');
  });

  it("normalizes null and boolean values in csv output", () => {
    const csv = buildReportCsv({
      columns: [
        { header: "Aktif", value: (row: { active: boolean }) => row.active },
        { header: "Keterangan", value: (row: { note: null }) => row.note },
      ],
      rows: [{ active: true, note: null }],
    });

    expect(csv).toContain("Ya,-");
  });

  it("creates trace ids with requested prefix", () => {
    const traceId = createReportTraceId("HR-RPT");
    expect(traceId).toMatch(/^HR-RPT-\d{13}-[A-Z0-9]{6}$/);
  });
});
