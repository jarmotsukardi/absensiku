import type { TenantHrPayrollAccessState } from "@/lib/hrPayrollAccessPolicy";

export type TenantTrialStatus =
  | "coba_coba"
  | "evaluasi_awal"
  | "serius"
  | "siap_aktivasi_awal"
  | "langganan_aktif"
  | "perlu_tindak_lanjut";

export interface TenantTrialSignal {
  status: TenantTrialStatus;
  label: string;
  description: string;
  summary: string;
  nextStep: string;
  score: number;
  completedIndicators: string[];
  pendingIndicators: string[];
  badgeClassName: string;
  cardClassName: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const getTenantTrialSignal = (
  accessState: TenantHrPayrollAccessState | null,
  subscriptionStatus: string | null | undefined,
): TenantTrialSignal => {
  const normalizedStatus = (subscriptionStatus || accessState?.subscriptionStatus || "").toLowerCase();
  const readiness = accessState?.readiness;
  const paymentCommitted = accessState?.accessSetting.paymentCommitted === true;

  const completedIndicators = [
    readiness?.onboardingReady ? "Fondasi absensi siap" : null,
    (readiness?.adminCount ?? 0) > 0 ? "Admin organisasi aktif tersedia" : null,
    (readiness?.employeeCount ?? 0) > 0 ? "Pegawai sudah terdaftar" : null,
    (readiness?.attendanceCount ?? 0) > 0 ? "Sudah ada rekam absensi awal" : null,
    paymentCommitted ? "Komitmen pembayaran dicatat" : null,
    normalizedStatus === "active" ? "Langganan sudah aktif" : null,
  ].filter((item): item is string => Boolean(item));

  const pendingIndicators = [
    readiness?.onboardingReady ? null : "Lengkapi satuan kerja, lokasi kerja, jam kerja, dan batas absen",
    (readiness?.adminCount ?? 0) > 0 ? null : "Tambahkan minimal satu admin organisasi aktif",
    (readiness?.employeeCount ?? 0) > 0 ? null : "Daftarkan minimal satu pegawai",
    (readiness?.attendanceCount ?? 0) > 0 ? null : "Dorong tenant membuat rekam absensi awal",
    paymentCommitted || normalizedStatus === "active" ? null : "Tunggu komitmen pembayaran atau aktivasi awal",
  ].filter((item): item is string => Boolean(item));

  const baseScore =
    (readiness?.onboardingReady ? 30 : 0) +
    ((readiness?.adminCount ?? 0) > 0 ? 15 : 0) +
    ((readiness?.employeeCount ?? 0) > 0 ? 20 : 0) +
    ((readiness?.attendanceCount ?? 0) > 0 ? 25 : 0) +
    (paymentCommitted ? 10 : 0);

  if (normalizedStatus === "active") {
    return {
      status: "langganan_aktif",
      label: "Langganan Aktif",
      description: "Tenant sudah keluar dari tahap trial dan berjalan sebagai langganan aktif.",
      summary: "Semua jalur utama sudah siap untuk operasional berbayar.",
      nextStep: "Pantau pemakaian harian dan perpanjangan berikutnya.",
      score: 100,
      completedIndicators,
      pendingIndicators,
      badgeClassName:
        "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300",
      cardClassName: "border-green-200/70 bg-green-50/70 dark:border-green-900/70 dark:bg-green-950/20",
    };
  }

  if (normalizedStatus === "expired" || normalizedStatus === "cancelled") {
    return {
      status: "perlu_tindak_lanjut",
      label: "Perlu Tindak Lanjut",
      description: "Trial atau langganan tidak lagi aktif. Tenant perlu keputusan lanjut, invoice, atau cleanup operasional.",
      summary: "Tenant tidak sedang berada pada jalur trial aktif.",
      nextStep: "Tinjau alasan berhenti, lanjutkan follow-up, atau arahkan ke cleanup bila memang tidak lanjut.",
      score: clamp(baseScore, 15, 55),
      completedIndicators,
      pendingIndicators,
      badgeClassName:
        "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
      cardClassName: "border-rose-200/70 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/20",
    };
  }

  if (paymentCommitted || accessState?.stage === "payment_committed") {
    return {
      status: "siap_aktivasi_awal",
      label: "Aktivasi Awal",
      description: "Tenant sudah menunjukkan niat bayar dan bisa dibawa ke invoice aktivasi awal tanpa menunggu trial penuh.",
      summary: "Sinyal komersialnya sudah kuat untuk diproses ke billing.",
      nextStep: "Arahkan tenant ke invoice aktivasi awal atau paket final yang disepakati.",
      score: clamp(baseScore + 20, 85, 98),
      completedIndicators,
      pendingIndicators,
      badgeClassName:
        "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
      cardClassName: "border-blue-200/70 bg-blue-50/70 dark:border-blue-900/70 dark:bg-blue-950/20",
    };
  }

  if (accessState?.stage === "attendance_active") {
    return {
      status: "serius",
      label: "Serius",
      description: "Setup absensi dan penggunaan awal tenant sudah cukup kuat. Trial bukan sekadar lihat-lihat.",
      summary: "Tenant sudah siap diarahkan ke pembahasan paket atau aktivasi awal.",
      nextStep: "Follow-up komersial dan pastikan PIC siap menentukan paket berlangganan.",
      score: clamp(baseScore + 10, 70, 84),
      completedIndicators,
      pendingIndicators,
      badgeClassName:
        "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
      cardClassName: "border-sky-200/70 bg-sky-50/70 dark:border-sky-900/70 dark:bg-sky-950/20",
    };
  }

  const readinessCount = [
    readiness?.onboardingReady,
    (readiness?.adminCount ?? 0) > 0,
    (readiness?.employeeCount ?? 0) > 0,
    (readiness?.attendanceCount ?? 0) > 0,
  ].filter(Boolean).length;

  if (readinessCount >= 2) {
    return {
      status: "evaluasi_awal",
      label: "Evaluasi Awal",
      description: "Tenant sudah mulai menyiapkan trial, tetapi belum cukup lengkap untuk dianggap kuat secara operasional.",
      summary: "Ada progres nyata, namun masih perlu dorongan setup atau aktivitas awal.",
      nextStep: "Dorong tenant melengkapi fondasi absensi, admin aktif, pegawai, dan rekam absensi awal.",
      score: clamp(baseScore, 40, 69),
      completedIndicators,
      pendingIndicators,
      badgeClassName:
        "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
      cardClassName: "border-amber-200/70 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20",
    };
  }

  return {
    status: "coba_coba",
    label: "Coba-coba",
    description: "Tenant baru membuka trial, tetapi jejak kesiapan dan penggunaan awalnya masih tipis.",
    summary: "Belum cukup bukti bahwa tenant serius melanjutkan ke aktivasi berbayar.",
    nextStep: "Validasi PIC, bantu setup dasar, lalu lihat apakah tenant benar-benar mulai memakai sistem.",
    score: clamp(baseScore, 10, 39),
    completedIndicators,
    pendingIndicators,
    badgeClassName:
      "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    cardClassName: "border-slate-200/70 bg-slate-50/70 dark:border-slate-800/70 dark:bg-slate-900/20",
  };
};
