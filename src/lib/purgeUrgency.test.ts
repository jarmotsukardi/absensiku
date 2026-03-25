import { describe, expect, it } from "vitest";
import { getPurgeUrgency } from "@/lib/purgeUrgency";

describe("purgeUrgency", () => {
  it("returns fallback when purge date is missing or invalid", () => {
    expect(getPurgeUrgency(null)).toMatchObject({ daysLeft: null, label: "Tanpa Jadwal", variant: "outline" });
    expect(getPurgeUrgency("invalid-date")).toMatchObject({ daysLeft: null, label: "Tanpa Jadwal", variant: "outline" });
  });

  it("uses UTC day cutoff to avoid timezone drift", () => {
    const now = new Date("2026-03-04T23:00:00+07:00");
    const urgency = getPurgeUrgency("2026-03-04T01:00:00Z", now);
    expect(urgency.daysLeft).toBe(0);
    expect(urgency.label).toBe("Hari Ini");
    expect(urgency.variant).toBe("destructive");
  });

  it("shows exact H-minus labels for near purge", () => {
    const now = new Date("2026-03-04T08:00:00Z");
    expect(getPurgeUrgency("2026-03-05T00:00:00Z", now)).toMatchObject({ daysLeft: 1, label: "H-1", variant: "destructive" });
    expect(getPurgeUrgency("2026-03-06T00:00:00Z", now)).toMatchObject({ daysLeft: 2, label: "H-2", variant: "secondary" });
    expect(getPurgeUrgency("2026-03-14T00:00:00Z", now)).toMatchObject({ daysLeft: 10, label: "H-10", variant: "outline" });
  });

  it("marks past purge as overdue", () => {
    const now = new Date("2026-03-04T08:00:00Z");
    const urgency = getPurgeUrgency("2026-03-01T00:00:00Z", now);
    expect(urgency.daysLeft).toBe(-3);
    expect(urgency.label).toBe("Lewat 3 hari");
    expect(urgency.variant).toBe("destructive");
  });
});
