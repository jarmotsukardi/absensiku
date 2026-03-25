import type { Json } from "@/integrations/supabase/types";

export type PayrollComplianceProfile = "swasta_umum" | "custom";

export type PayrollComplianceRuleId =
  | "thr_keagamaan"
  | "lembur_pp35"
  | "upah_minimum"
  | "pph21_ter"
  | "bpjs_kesehatan"
  | "bpjs_ketenagakerjaan";

export type PayrollComplianceRule = {
  id: PayrollComplianceRuleId;
  label: string;
  summary: string;
  detail: string;
  legalBasis: string;
  category: "Wajib" | "Opsional";
  defaultEnabled: boolean;
};

export type PayrollComplianceSettings = {
  profile: PayrollComplianceProfile;
  rules: Record<PayrollComplianceRuleId, boolean>;
  notes?: string;
};

export type PayrollGlossaryTerm = {
  term: string;
  definition: string;
};

export const DEFAULT_PAYROLL_COMPLIANCE_PROFILE: PayrollComplianceProfile = "swasta_umum";

export const PAYROLL_COMPLIANCE_RULES: PayrollComplianceRule[] = [
  {
    id: "thr_keagamaan",
    label: "THR Keagamaan",
    summary: "Wajib dibayar maksimal H-7 hari raya, 1 bulan upah untuk masa kerja ≥12 bulan dan prorata untuk <12 bulan.",
    detail: "Atur THR agar otomatis masuk komponen payroll tahunan, termasuk pegawai baru yang sudah melewati 1 bulan masa kerja.",
    legalBasis: "Permenaker 6/2016",
    category: "Wajib",
    defaultEnabled: true,
  },
  {
    id: "lembur_pp35",
    label: "Upah Lembur",
    summary: "Batas lembur 4 jam/hari, 18 jam/minggu. Upah lembur dihitung 1/173 dari upah sebulan (1,5x jam pertama, 2x jam berikutnya).",
    detail: "Gunakan sumber lembur dari absensi atau input manual, tetapi rumus dan batas tetap mengacu regulasi lembur.",
    legalBasis: "PP 35/2021",
    category: "Wajib",
    defaultEnabled: true,
  },
  {
    id: "upah_minimum",
    label: "Upah Minimum (UMP/UMK)",
    summary: "Upah pokok + tunjangan tetap tidak boleh di bawah UMP/UMK wilayah kerja.",
    detail: "Pastikan master lokasi dan nilai UMP/UMK diinput agar payroll bisa memberi peringatan jika melanggar.",
    legalBasis: "PP 36/2021 jo. PP 51/2023",
    category: "Wajib",
    defaultEnabled: true,
  },
  {
    id: "pph21_ter",
    label: "PPh 21 TER",
    summary: "Pemotongan PPh 21 memakai Tarif Efektif Rata-Rata (TER) sesuai ketentuan terbaru.",
    detail: "Gunakan tabel TER untuk menghitung potongan pajak gaji dan siapkan kontrol atas pembulatan pajak.",
    legalBasis: "PMK 168/2023",
    category: "Wajib",
    defaultEnabled: true,
  },
  {
    id: "bpjs_kesehatan",
    label: "BPJS Kesehatan",
    summary: "Iuran total 5% (4% perusahaan, 1% pekerja) dengan batas upah tertentu.",
    detail: "Masukkan komponen iuran sebagai potongan payroll agar laporan kepatuhan tercatat rapi per periode.",
    legalBasis: "Perpres 64/2020",
    category: "Wajib",
    defaultEnabled: true,
  },
  {
    id: "bpjs_ketenagakerjaan",
    label: "BPJS Ketenagakerjaan",
    summary: "JHT, JKK, JKM, JP, JKP wajib dihitung sesuai tarif dan kategori risiko.",
    detail: "Siapkan mapping kategori risiko untuk JKK agar tarif dapat dihitung konsisten.",
    legalBasis: "BPJS Ketenagakerjaan (tarif resmi)",
    category: "Wajib",
    defaultEnabled: true,
  },
];

export const PAYROLL_GLOSSARY: PayrollGlossaryTerm[] = [
  { term: "Upah Pokok", definition: "Komponen gaji utama yang menjadi dasar sebagian besar perhitungan payroll." },
  { term: "Tunjangan Tetap", definition: "Tunjangan yang dibayar rutin dan konsisten setiap periode." },
  { term: "Tunjangan Tidak Tetap", definition: "Tunjangan yang sifatnya tidak rutin dan bisa berubah antarperiode." },
  { term: "Upah Bruto", definition: "Total penghasilan sebelum potongan pajak dan iuran." },
  { term: "Take-Home Pay", definition: "Penghasilan bersih yang diterima pegawai setelah potongan." },
  { term: "THR Keagamaan", definition: "Tunjangan tahunan yang wajib dibayarkan sebelum hari raya." },
  { term: "Lembur", definition: "Jam kerja di luar jam normal yang dihitung dengan tarif khusus." },
  { term: "Upah Minimum", definition: "Standar upah minimum wilayah (UMP/UMK) yang wajib dipatuhi." },
  { term: "PPh 21 TER", definition: "Skema pemotongan pajak gaji dengan tarif efektif rata-rata." },
  { term: "BPJS Kesehatan", definition: "Iuran jaminan kesehatan yang ditanggung perusahaan dan pegawai." },
  { term: "BPJS Ketenagakerjaan", definition: "Iuran jaminan sosial ketenagakerjaan seperti JHT, JKK, JKM, JP, JKP." },
  { term: "Payroll Run", definition: "Proses perhitungan payroll per periode." },
  { term: "Slip Gaji", definition: "Dokumen ringkasan hasil payroll per pegawai." },
];

export const buildDefaultComplianceRules = (): Record<PayrollComplianceRuleId, boolean> =>
  PAYROLL_COMPLIANCE_RULES.reduce((acc, rule) => {
    acc[rule.id] = rule.defaultEnabled;
    return acc;
  }, {} as Record<PayrollComplianceRuleId, boolean>);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeComplianceRules = (rules?: Record<string, unknown>): Record<PayrollComplianceRuleId, boolean> => {
  const defaults = buildDefaultComplianceRules();
  if (!rules || !isPlainRecord(rules)) return defaults;
  const normalized = { ...defaults };
  PAYROLL_COMPLIANCE_RULES.forEach((rule) => {
    const value = rules[rule.id];
    if (typeof value === "boolean") normalized[rule.id] = value;
  });
  return normalized;
};

export const resolvePayrollComplianceSettings = (metadata?: Json | null): PayrollComplianceSettings => {
  const defaults = buildDefaultComplianceRules();
  if (!isPlainRecord(metadata)) {
    return { profile: DEFAULT_PAYROLL_COMPLIANCE_PROFILE, rules: defaults, notes: "" };
  }

  const compliance = isPlainRecord(metadata.compliance) ? metadata.compliance : undefined;
  const profile = compliance?.profile === "custom" ? "custom" : DEFAULT_PAYROLL_COMPLIANCE_PROFILE;
  const rules = normalizeComplianceRules(isPlainRecord(compliance?.rules) ? (compliance?.rules as Record<string, unknown>) : undefined);
  const notes = typeof compliance?.notes === "string" ? compliance.notes : "";

  return { profile, rules, notes };
};

export const updatePayrollPolicyMetadata = (
  metadata: Json | null | undefined,
  compliance: PayrollComplianceSettings,
): Json => {
  const base = isPlainRecord(metadata) ? metadata : {};
  return {
    ...base,
    compliance: {
      profile: compliance.profile,
      rules: compliance.rules,
      notes: compliance.notes?.trim() || "",
    },
  };
};

export const getComplianceSummary = (rules: Record<PayrollComplianceRuleId, boolean>) => {
  const disabledRules = PAYROLL_COMPLIANCE_RULES.filter((rule) => !rules[rule.id]);
  const disabledCount = disabledRules.length;
  return {
    total: PAYROLL_COMPLIANCE_RULES.length,
    disabledCount,
    enabledCount: PAYROLL_COMPLIANCE_RULES.length - disabledCount,
    disabledRules,
    isCompliant: disabledCount === 0,
  };
};
