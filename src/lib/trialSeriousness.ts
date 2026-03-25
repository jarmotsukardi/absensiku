import type { BillingSubscriptionJourney } from "@/lib/billingSubscriptionJourney";

export type TrialSeriousnessStatus =
  | "pasif"
  | "evaluasi_aktif"
  | "serius"
  | "siap_ditagih"
  | "aktivasi_awal";

export interface TrialSeriousnessInput {
  streakCount: number;
  streakThreshold: number;
  streakStatus: string;
  reachedTarget: boolean;
  lastActivityDate: string | null;
  subscriptionStatus: string | null;
  invoiceStatus: string | null;
  billingJourney: BillingSubscriptionJourney;
  isNonActive: boolean;
}

export interface TrialSeriousnessSignal {
  status: TrialSeriousnessStatus;
  label: string;
  description: string;
  summary: string;
  score: number;
  badgeClassName: string;
  cardClassName: string;
}

export const TRIAL_SERIOUSNESS_ORDER: TrialSeriousnessStatus[] = [
  "pasif",
  "evaluasi_aktif",
  "serius",
  "siap_ditagih",
  "aktivasi_awal",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getDaysSinceLastActivity = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - parsed.getTime()) / MS_PER_DAY));
};

export const getTrialSeriousnessStatusUi = (
  status: TrialSeriousnessStatus,
): Omit<TrialSeriousnessSignal, "status" | "score"> => {
  switch (status) {
    case "aktivasi_awal":
      return {
        label: "Aktivasi Awal",
        description: "Organisasi sudah meminta invoice lebih awal tanpa menunggu threshold streak penuh.",
        summary: "Sudah bergerak ke jalur aktivasi awal.",
        badgeClassName: "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
        cardClassName: "border-blue-200/70 bg-blue-50/70 dark:border-blue-900/70 dark:bg-blue-950/20",
      };
    case "siap_ditagih":
      return {
        label: "Siap Ditagih",
        description: "Trial sudah mencapai ambang billing atau sedang masuk fase penagihan normal.",
        summary: "Trial sudah cukup kuat untuk masuk penagihan.",
        badgeClassName: "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
        cardClassName: "border-green-200/70 bg-green-50/70 dark:border-green-900/70 dark:bg-green-950/20",
      };
    case "serius":
      return {
        label: "Serius",
        description: "Pemakaian trial konsisten, progres streak tinggi, dan aktivitas masih berjalan.",
        summary: "Pemakaian trial terlihat konsisten.",
        badgeClassName: "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
        cardClassName: "border-sky-200/70 bg-sky-50/70 dark:border-sky-900/70 dark:bg-sky-950/20",
      };
    case "evaluasi_aktif":
      return {
        label: "Evaluasi Awal",
        description: "Tenant masih mencoba dan ada progres, tetapi sinyalnya belum cukup kuat untuk ditagih.",
        summary: "Ada progres awal, tetapi trial belum cukup kuat.",
        badgeClassName: "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        cardClassName: "border-amber-200/70 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20",
      };
    case "pasif":
    default:
      return {
        label: "Coba-coba",
        description: "Aktivitas trial belum cukup konsisten atau jeda penggunaannya sudah terlalu lama.",
        summary: "Jejak trial masih tipis.",
        badgeClassName: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
        cardClassName: "border-slate-200/70 bg-slate-50/70 dark:border-slate-800/70 dark:bg-slate-900/20",
      };
  }
};

export const getTrialSeriousnessSignal = (
  input: TrialSeriousnessInput,
): TrialSeriousnessSignal => {
  const threshold = input.streakThreshold > 0 ? input.streakThreshold : 30;
  const normalizedStreakStatus = (input.streakStatus || "").toLowerCase();
  const normalizedSubscriptionStatus = (input.subscriptionStatus || "").toLowerCase();
  const normalizedInvoiceStatus = (input.invoiceStatus || "").toUpperCase();
  const daysSinceLastActivity = getDaysSinceLastActivity(input.lastActivityDate);
  const hasRecentActivity = daysSinceLastActivity !== null && daysSinceLastActivity <= 3;
  const hasThisWeekActivity = daysSinceLastActivity !== null && daysSinceLastActivity <= 7;
  const progressScore = clamp(Math.round((input.streakCount / threshold) * 55), 0, 55);

  if (input.billingJourney === "activation_early") {
    return {
      status: "aktivasi_awal",
      score: 95,
      ...getTrialSeriousnessStatusUi("aktivasi_awal"),
    };
  }

  if (
    input.reachedTarget ||
    normalizedStreakStatus === "ready_for_invoicing" ||
    normalizedStreakStatus === "grace_period" ||
    normalizedSubscriptionStatus === "awaiting_activation" ||
    normalizedInvoiceStatus === "PENDING" ||
    normalizedInvoiceStatus === "AWAITING_VERIFICATION" ||
    normalizedInvoiceStatus === "OVERDUE"
  ) {
    return {
      status: "siap_ditagih",
      score: clamp(progressScore + 35, 85, 100),
      ...getTrialSeriousnessStatusUi("siap_ditagih"),
    };
  }

  if (input.isNonActive) {
    return {
      status: "pasif",
      score: 10,
      ...getTrialSeriousnessStatusUi("pasif"),
    };
  }

  const strongProgress = input.streakCount >= Math.max(Math.ceil(threshold * 0.6), 5);
  const activeProgress = input.streakCount >= Math.max(Math.ceil(threshold * 0.2), 2);

  if (strongProgress && hasThisWeekActivity) {
    return {
      status: "serius",
      score: clamp(progressScore + (hasRecentActivity ? 20 : 12), 70, 84),
      ...getTrialSeriousnessStatusUi("serius"),
    };
  }

  if (activeProgress && (hasThisWeekActivity || normalizedSubscriptionStatus === "trial")) {
    return {
      status: "evaluasi_aktif",
      score: clamp(progressScore + (hasRecentActivity ? 18 : 10), 40, 69),
      ...getTrialSeriousnessStatusUi("evaluasi_aktif"),
    };
  }

  return {
    status: "pasif",
    score: clamp(progressScore + (hasThisWeekActivity ? 5 : 0), 12, 39),
    ...getTrialSeriousnessStatusUi("pasif"),
  };
};
