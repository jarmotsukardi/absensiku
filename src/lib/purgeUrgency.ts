export interface PurgeUrgency {
  daysLeft: number | null;
  sortKey: number;
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function toUtcDayEpoch(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function parseUtcDayEpoch(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toUtcDayEpoch(parsed);
}

export function getPurgeUrgency(purgeAt: string | null, now: Date = new Date()): PurgeUrgency {
  const targetDay = parseUtcDayEpoch(purgeAt);
  if (targetDay === null) {
    return { daysLeft: null, sortKey: Number.MAX_SAFE_INTEGER, label: "Tanpa Jadwal", variant: "outline" };
  }

  const nowDay = toUtcDayEpoch(now);
  const daysLeft = Math.floor((targetDay - nowDay) / DAY_IN_MS);

  if (daysLeft < 0) {
    return { daysLeft, sortKey: daysLeft, label: `Lewat ${Math.abs(daysLeft)} hari`, variant: "destructive" };
  }
  if (daysLeft === 0) {
    return { daysLeft, sortKey: daysLeft, label: "Hari Ini", variant: "destructive" };
  }
  if (daysLeft === 1) {
    return { daysLeft, sortKey: daysLeft, label: "H-1", variant: "destructive" };
  }
  if (daysLeft <= 3) {
    return { daysLeft, sortKey: daysLeft, label: `H-${daysLeft}`, variant: "secondary" };
  }
  return { daysLeft, sortKey: daysLeft, label: `H-${daysLeft}`, variant: "outline" };
}
