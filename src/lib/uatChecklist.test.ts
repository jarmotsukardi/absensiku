import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPassedStatus, parseUatChecklist } from "@/lib/uatChecklist";

describe("parseUatChecklist", () => {
  it("membaca checklist UAT utama dan menghasilkan ringkasan yang konsisten", () => {
    const markdown = readFileSync(resolve(process.cwd(), "docs/checklist-uji-aplikasi.md"), "utf8");
    const parsed = parseUatChecklist(markdown);

    expect(parsed.sections.length).toBeGreaterThanOrEqual(10);
    expect(parsed.summary.total).toBeGreaterThan(0);
    expect(parsed.summary.passed).toBeGreaterThan(0);
    expect(parsed.summary.pending).toBeGreaterThan(0);
    expect(parsed.summary.total).toBe(parsed.summary.passed + parsed.summary.pending);
    expect(parsed.logEntries.length).toBeGreaterThan(0);

    const nativeLoginSection = parsed.sections.find((section) => section.title.includes("Native Login Android"));
    expect(nativeLoginSection).toBeDefined();
    expect(nativeLoginSection?.passedCount).toBeGreaterThan(0);
  });

  it("tetap membaca metadata fleksibel dan tidak menghitung status parsial sebagai lolos penuh", () => {
    const parsed = parseUatChecklist(`
## 1. Contoh
Status seksi: \`Belum diuji\` | Prioritas default: \`P0\` | Metode umum: \`Manual\`
- [ ] Flow A. \`Status: Sudah diuji 2026-03-20 | Prioritas: P0 | Metode: Manual\`
- [ ] Flow B. \`Status: Sudah diuji sebagian | Prioritas: P1 | Metode: Manual\`
`);

    expect(parsed.summary.total).toBe(2);
    expect(parsed.summary.passed).toBe(1);
    expect(parsed.summary.pending).toBe(1);
    expect(parsed.sections[0]?.items[0]?.status).toBe("Sudah diuji 2026-03-20");
    expect(parsed.sections[0]?.items[1]?.status).toBe("Sudah diuji sebagian");
    expect(isPassedStatus("Sudah diuji 2026-03-20")).toBe(true);
    expect(isPassedStatus("Sudah diuji sebagian")).toBe(false);
  });
});
