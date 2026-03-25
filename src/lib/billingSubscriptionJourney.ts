export type BillingSubscriptionJourney = "activation_early" | "trial_streak" | "unknown";

const BILLING_JOURNEY_PREFIX = "Jalur billing:";

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const normalizeNotes = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getBillingSubscriptionJourneyFromInvoiceMetadata = (
  metadata: unknown,
): BillingSubscriptionJourney => {
  const record = toRecord(metadata);
  if (!record) return "unknown";
  if (record.billing_origin === "activation_early") return "activation_early";
  if (record.streak_billing === true) return "trial_streak";
  return "unknown";
};

export const getBillingSubscriptionJourneyLine = (
  journey: BillingSubscriptionJourney,
): string | null => {
  if (journey === "activation_early") {
    return "Jalur billing: Aktivasi awal. Invoice pertama dibuat sebelum tenant menunggu streak siap tagih.";
  }
  if (journey === "trial_streak") {
    return "Jalur billing: Trial & Streak Monitoring. Invoice pertama mengikuti jalur trial normal sampai siap ditagih.";
  }
  return null;
};

export const mergeBillingSubscriptionJourneyNotes = (
  currentNotes: string | null | undefined,
  metadataOrJourney: unknown,
): string | null => {
  const journey =
    metadataOrJourney === "activation_early" ||
    metadataOrJourney === "trial_streak" ||
    metadataOrJourney === "unknown"
      ? (metadataOrJourney as BillingSubscriptionJourney)
      : getBillingSubscriptionJourneyFromInvoiceMetadata(metadataOrJourney);
  const journeyLine = getBillingSubscriptionJourneyLine(journey);
  const normalizedCurrent = normalizeNotes(currentNotes);

  if (!journeyLine) return normalizedCurrent;

  const preservedLines = (normalizedCurrent || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(BILLING_JOURNEY_PREFIX));

  return [journeyLine, ...preservedLines].join("\n");
};

export const getBillingSubscriptionJourneyFromNotes = (
  notes: string | null | undefined,
): BillingSubscriptionJourney => {
  const normalized = normalizeNotes(notes);
  if (!normalized) return "unknown";
  if (normalized.includes("Jalur billing: Aktivasi awal.")) return "activation_early";
  if (normalized.includes("Jalur billing: Trial & Streak Monitoring.")) return "trial_streak";
  return "unknown";
};

export const getBillingSubscriptionJourneyUiCopy = (
  journey: BillingSubscriptionJourney,
): { label: string; description: string } => {
  if (journey === "activation_early") {
    return {
      label: "Aktivasi Awal",
      description:
        "Invoice pertama dibuat lebih awal karena organisasi sudah siap berlangganan sebelum streak siap tagih.",
    };
  }

  if (journey === "trial_streak") {
    return {
      label: "Trial & Streak Monitoring",
      description: "Invoice pertama mengikuti jalur trial normal sampai tenant dinilai siap ditagih.",
    };
  }

  return {
    label: "Mengikuti Invoice Terakhir",
    description: "Sistem menyelaraskan langganan berdasarkan invoice pembayaran terbaru yang sudah tervalidasi.",
  };
};
