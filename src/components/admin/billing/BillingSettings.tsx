import { useEffect, useMemo, useState } from "react";
import { useBillingSettings } from "@/hooks/useBilling";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, DollarSign, Percent, Clock, CreditCard, Landmark } from "lucide-react";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  BILLING_INVOICE_TEMPLATE_TOKENS,
  DEFAULT_BILLING_INVOICE_TEMPLATE,
  renderBillingInvoiceTemplate,
} from "@/lib/billingInvoiceTemplate";
import {
  BILLING_DURATION_OPTIONS,
  CENTRALIZED_MIN_DURATION_DEFAULTS,
  CENTRALIZED_MIN_DURATION_SETTING_KEYS,
  INDIVIDUAL_MIN_DURATION_DEFAULT,
  INDIVIDUAL_MIN_DURATION_SETTING_KEY,
  normalizeDurationOption,
} from "@/lib/billingMinDuration";
import {
  calculateAttendanceIntroPromoBreakdown,
  getAttendanceIntroPromoCampaignText,
  getAttendanceIntroPromoLabel,
  normalizeAttendanceIntroPromoConfig,
} from "@/lib/attendanceOnboardingPromo";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
const BILLING_SETTINGS_READ_TIMEOUT_MS = 12000;
const BILLING_SETTINGS_WRITE_TIMEOUT_MS = 15000;
const BILLING_SETTINGS_MAX_RETRIES = 2;
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

const buildDefaultAttendanceIntroPromoLabel = (duration: 1 | 2 | 3) =>
  getAttendanceIntroPromoLabel({ promo_duration_months: duration, label: null });

const BILLING_INVOICE_TEMPLATE_PREVIEW_VALUES: Record<string, string> = {
  invoice_number: "INV-20260223-0001",
  invoice_status: "LUNAS",
  invoice_status_class: "status-paid",
  issue_date: "23 Februari 2026",
  due_date: "02 Maret 2026",
  tenant_name: "Pengajian Al-Akbar",
  tenant_code: "PENGAJIAN-A-981359",
  tenant_address: "Jl. Melati No. 17, Jakarta",
  bank_account_name: "PT AbsensiKu Indonesia",
  bank_name: "Bank BCA",
  bank_account_number: "1234567890",
  payment_method: "Transfer Bank",
  invoice_item_name: "Paket Semester",
  invoice_item_meta: "6 bulan • 1 pegawai • Billing Mandiri",
  subtotal: formatCurrency(150000),
  discount: formatCurrency(15000),
  vat_percentage: "13%",
  vat_amount: formatCurrency(17550),
  service_fee: formatCurrency(0),
  total: formatCurrency(152550),
  net: formatCurrency(152550),
  transaction_rows:
    '<tr><td>24 Feb 2026</td><td>Manual</td><td>TRF-BCA-992211</td><td class="text-right">Rp152.550</td></tr>',
  balance: formatCurrency(0),
  notes:
    '<div class="actions-note">Pratinjau ini memakai data dummy untuk membantu validasi format sebelum disimpan.</div>',
};

export function BillingSettings() {
  const { settings, isLoading, getSetting, updateSetting, refetch } = useBillingSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [pricePerEmployee, setPricePerEmployee] = useState(15000);
  const [attendanceIntroPromoActive, setAttendanceIntroPromoActive] = useState(true);
  const [attendanceIntroPromoPrice, setAttendanceIntroPromoPrice] = useState(5000);
  const [attendanceIntroPromoDuration, setAttendanceIntroPromoDuration] = useState<1 | 2 | 3>(2);
  const [attendanceIntroPromoLabel, setAttendanceIntroPromoLabel] = useState("Promo onboarding 2 bulan pertama");
  const [attendanceIntroPromoNewTenantsOnly, setAttendanceIntroPromoNewTenantsOnly] = useState(true);
  const [attendanceIntroPromoLabelTouched, setAttendanceIntroPromoLabelTouched] = useState(false);
  const [vatPercentage, setVatPercentage] = useState(11);
  const [pphPercentage, setPphPercentage] = useState(2);
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
  const [paymentArchiveRetentionDays, setPaymentArchiveRetentionDays] = useState(7);
  const [individualMinDuration, setIndividualMinDuration] = useState(INDIVIDUAL_MIN_DURATION_DEFAULT);
  const [centralizedPemdaMinDuration, setCentralizedPemdaMinDuration] = useState(
    CENTRALIZED_MIN_DURATION_DEFAULTS.pemerintah_daerah,
  );
  const [centralizedInstansiMinDuration, setCentralizedInstansiMinDuration] = useState(
    CENTRALIZED_MIN_DURATION_DEFAULTS.instansi_pemerintah,
  );
  const [centralizedPerusahaanMinDuration, setCentralizedPerusahaanMinDuration] = useState(
    CENTRALIZED_MIN_DURATION_DEFAULTS.perusahaan,
  );
  const [centralizedSekolahMinDuration, setCentralizedSekolahMinDuration] = useState(
    CENTRALIZED_MIN_DURATION_DEFAULTS.sekolah,
  );
  const [xenditEnabled, setXenditEnabled] = useState(false);
  const [manualPaymentEnabled, setManualPaymentEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Bank account fields
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [invoiceTemplateHtml, setInvoiceTemplateHtml] = useState(DEFAULT_BILLING_INVOICE_TEMPLATE);
  const invoiceTemplatePreviewHtml = useMemo(
    () =>
      renderBillingInvoiceTemplate(
        invoiceTemplateHtml.trim() || DEFAULT_BILLING_INVOICE_TEMPLATE,
        BILLING_INVOICE_TEMPLATE_PREVIEW_VALUES,
      ),
    [invoiceTemplateHtml],
  );

  // Only initialize form values ONCE when settings first load
  useEffect(() => {
    if (!isLoading && settings.length > 0 && !initialized) {
      const price = getSetting("price_per_employee");
      const vat = getSetting("vat_percentage");
      const pph = getSetting("pph_percentage");
      const grace = getSetting("grace_period_days");
      const archiveRetention = getSetting("payment_archive_retention_days");
      const minDuration = getSetting(INDIVIDUAL_MIN_DURATION_SETTING_KEY);
      const centralizedPemdaDuration = getSetting(
        CENTRALIZED_MIN_DURATION_SETTING_KEYS.pemerintah_daerah,
      );
      const centralizedInstansiDuration = getSetting(
        CENTRALIZED_MIN_DURATION_SETTING_KEYS.instansi_pemerintah,
      );
      const centralizedPerusahaanDuration = getSetting(
        CENTRALIZED_MIN_DURATION_SETTING_KEYS.perusahaan,
      );
      const centralizedSekolahDuration = getSetting(
        CENTRALIZED_MIN_DURATION_SETTING_KEYS.sekolah,
      );
      const xendit = getSetting("xendit_enabled");
      const manual = getSetting("manual_payment_enabled");
      const attendanceIntroPromo = normalizeAttendanceIntroPromoConfig(getSetting("attendance_intro_promo"));
      const defaultPromoLabel = buildDefaultAttendanceIntroPromoLabel(
        attendanceIntroPromo.promo_duration_months,
      );

      if (price) setPricePerEmployee(price.amount || 15000);
      setAttendanceIntroPromoActive(attendanceIntroPromo.active);
      setAttendanceIntroPromoPrice(attendanceIntroPromo.promo_price_per_month);
      setAttendanceIntroPromoDuration(attendanceIntroPromo.promo_duration_months);
      setAttendanceIntroPromoLabel(
        attendanceIntroPromo.label || defaultPromoLabel,
      );
      setAttendanceIntroPromoLabelTouched(
        Boolean(attendanceIntroPromo.label && attendanceIntroPromo.label !== defaultPromoLabel),
      );
      setAttendanceIntroPromoNewTenantsOnly(attendanceIntroPromo.new_tenants_only);
      if (vat) setVatPercentage(vat.value || 11);
      if (pph) setPphPercentage(pph.value || 2);
      if (grace) setGracePeriodDays(grace.value || 3);
      if (archiveRetention) {
        const raw = Number(archiveRetention.value || 7);
        setPaymentArchiveRetentionDays(Math.min(365, Math.max(1, Number.isFinite(raw) ? raw : 7)));
      }
      setIndividualMinDuration(
        normalizeDurationOption(minDuration, INDIVIDUAL_MIN_DURATION_DEFAULT),
      );
      setCentralizedPemdaMinDuration(
        normalizeDurationOption(
          centralizedPemdaDuration,
          CENTRALIZED_MIN_DURATION_DEFAULTS.pemerintah_daerah,
        ),
      );
      setCentralizedInstansiMinDuration(
        normalizeDurationOption(
          centralizedInstansiDuration,
          CENTRALIZED_MIN_DURATION_DEFAULTS.instansi_pemerintah,
        ),
      );
      setCentralizedPerusahaanMinDuration(
        normalizeDurationOption(
          centralizedPerusahaanDuration,
          CENTRALIZED_MIN_DURATION_DEFAULTS.perusahaan,
        ),
      );
      setCentralizedSekolahMinDuration(
        normalizeDurationOption(
          centralizedSekolahDuration,
          CENTRALIZED_MIN_DURATION_DEFAULTS.sekolah,
        ),
      );
      if (xendit) setXenditEnabled(xendit.value || false);
      if (manual) setManualPaymentEnabled(manual.value !== false);
      setInitialized(true);
    }
  }, [settings, isLoading, initialized, getSetting]);

  const resolvedAttendanceIntroPromoConfig = useMemo(
    () =>
      normalizeAttendanceIntroPromoConfig({
        active: attendanceIntroPromoActive,
        promo_price_per_month: attendanceIntroPromoPrice,
        promo_duration_months: attendanceIntroPromoDuration,
        label: attendanceIntroPromoLabel,
        new_tenants_only: attendanceIntroPromoNewTenantsOnly,
      }),
    [
      attendanceIntroPromoActive,
      attendanceIntroPromoPrice,
      attendanceIntroPromoDuration,
      attendanceIntroPromoLabel,
      attendanceIntroPromoNewTenantsOnly,
    ],
  );

  const attendanceIntroPromoPreviewRows = useMemo(
    () =>
      ([1, 2, 3, 12] as const).map((months) => {
        const breakdown = calculateAttendanceIntroPromoBreakdown({
          normalPricePerEmployee: pricePerEmployee,
          packageDiscountPercentage: 0,
          durationMonths: months,
          employeeCount: 1,
          promoConfig: resolvedAttendanceIntroPromoConfig,
          promoState: null,
          canInitializePromo: resolvedAttendanceIntroPromoConfig.active,
        });
        return {
          months,
          total: breakdown.taxableBase,
          average: breakdown.effectiveAveragePricePerEmployee,
          promoMonthsApplied: breakdown.promoMonthsApplied,
        };
      }),
    [pricePerEmployee, resolvedAttendanceIntroPromoConfig],
  );

  const attendanceIntroPromoValidationMessage = useMemo(() => {
    if (!attendanceIntroPromoActive) return null;
    if (!Number.isFinite(pricePerEmployee) || pricePerEmployee <= 0) {
      return "Harga dasar Absensi harus lebih besar dari Rp0 sebelum promo onboarding diaktifkan.";
    }
    if (!Number.isFinite(attendanceIntroPromoPrice) || attendanceIntroPromoPrice <= 0) {
      return "Harga promo onboarding harus lebih besar dari Rp0.";
    }
    if (attendanceIntroPromoPrice >= pricePerEmployee) {
      return "Harga promo onboarding harus lebih rendah dari harga dasar Absensi.";
    }
    return null;
  }, [attendanceIntroPromoActive, attendanceIntroPromoPrice, pricePerEmployee]);

  const handleAttendanceIntroPromoDurationChange = (rawValue: string) => {
    const nextDuration = normalizeAttendanceIntroPromoConfig({
      promo_duration_months: Number(rawValue),
    }).promo_duration_months;
    const currentDefaultLabel = buildDefaultAttendanceIntroPromoLabel(attendanceIntroPromoDuration);
    const nextDefaultLabel = buildDefaultAttendanceIntroPromoLabel(nextDuration);

    setAttendanceIntroPromoDuration(nextDuration);
    setAttendanceIntroPromoLabel((currentLabel) => {
      const trimmed = currentLabel.trim();
      if (!attendanceIntroPromoLabelTouched || trimmed === "" || trimmed === currentDefaultLabel) {
        return nextDefaultLabel;
      }
      return currentLabel;
    });
    if (!attendanceIntroPromoLabelTouched) {
      setAttendanceIntroPromoLabelTouched(false);
    }
  };

  // Fetch billing_settings (bank account info) from system_settings
  useEffect(() => {
    const fetchBankSettings = async () => {
      setIsRetrying(false);
      setLoadError(null);
      try {
        const [bankRes, templateRes] = await Promise.all([
          withExponentialBackoff(
            () =>
              withTimeout(
                supabase.from("system_settings").select("value").eq("key", "billing_settings").maybeSingle(),
                BILLING_SETTINGS_READ_TIMEOUT_MS,
                "Permintaan pengaturan rekening billing timeout."
              ),
            {
              maxRetries: BILLING_SETTINGS_MAX_RETRIES,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          ),
          withExponentialBackoff(
            () =>
              withTimeout(
                supabase.from("system_settings").select("value").eq("key", "billing_invoice_template").maybeSingle(),
                BILLING_SETTINGS_READ_TIMEOUT_MS,
                "Permintaan template invoice timeout."
              ),
            {
              maxRetries: BILLING_SETTINGS_MAX_RETRIES,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          ),
        ]);

        if (bankRes.error) {
          const errorRef = reportError(bankRes.error, "admin.billing.settings.fetch_bank_settings");
          setLoadError(appendErrorReference("Gagal memuat pengaturan rekening billing", errorRef));
        }
        if (templateRes.error) {
          const errorRef = reportError(templateRes.error, "admin.billing.settings.fetch_invoice_template");
          setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat template invoice", errorRef));
        }

        if (bankRes.data?.value && typeof bankRes.data.value === "object" && !Array.isArray(bankRes.data.value)) {
          const value = bankRes.data.value as Record<string, unknown>;
          setBankName(typeof value.bank_name === "string" ? value.bank_name : "");
          setBankAccount(typeof value.bank_account === "string" ? value.bank_account : "");
          setBankAccountName(typeof value.bank_account_name === "string" ? value.bank_account_name : "");
          setPaymentInstructions(typeof value.payment_instructions === "string" ? value.payment_instructions : "");
        }

        if (templateRes.data?.value && typeof templateRes.data.value === "object" && !Array.isArray(templateRes.data.value)) {
          const value = templateRes.data.value as Record<string, unknown>;
          if (typeof value.html_template === "string" && value.html_template.trim()) {
            setInvoiceTemplateHtml(value.html_template);
          }
        }
      } catch (error) {
        const errorRef = reportError(error, "admin.billing.settings.fetch");
        setLoadError((prev) => prev ?? appendErrorReference("Gagal memuat pengaturan billing", errorRef));
      } finally {
        setIsRetrying(false);
      }
    };
    void fetchBankSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (attendanceIntroPromoValidationMessage) {
        toast.error(attendanceIntroPromoValidationMessage);
        return;
      }

      // Save billing pricing settings
      await Promise.all([
        updateSetting(
          "price_per_employee",
          { amount: pricePerEmployee, currency: "IDR" },
          { silent: true, skipRefetch: true, throwOnError: true },
        ),
        updateSetting(
          "attendance_intro_promo",
          {
            active: resolvedAttendanceIntroPromoConfig.active,
            promo_price_per_month: resolvedAttendanceIntroPromoConfig.promo_price_per_month,
            promo_duration_months: resolvedAttendanceIntroPromoConfig.promo_duration_months,
            label: resolvedAttendanceIntroPromoConfig.label,
            new_tenants_only: resolvedAttendanceIntroPromoConfig.new_tenants_only,
          },
          { silent: true, skipRefetch: true, throwOnError: true },
        ),
        updateSetting("vat_percentage", { value: vatPercentage }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting("pph_percentage", { value: pphPercentage }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting("grace_period_days", { value: gracePeriodDays }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting("payment_archive_retention_days", {
          value: Math.min(365, Math.max(1, Number.isFinite(paymentArchiveRetentionDays) ? paymentArchiveRetentionDays : 7)),
        }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting(INDIVIDUAL_MIN_DURATION_SETTING_KEY, { value: individualMinDuration }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting(CENTRALIZED_MIN_DURATION_SETTING_KEYS.pemerintah_daerah, {
          value: centralizedPemdaMinDuration,
        }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting(CENTRALIZED_MIN_DURATION_SETTING_KEYS.instansi_pemerintah, {
          value: centralizedInstansiMinDuration,
        }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting(CENTRALIZED_MIN_DURATION_SETTING_KEYS.perusahaan, {
          value: centralizedPerusahaanMinDuration,
        }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting(CENTRALIZED_MIN_DURATION_SETTING_KEYS.sekolah, {
          value: centralizedSekolahMinDuration,
        }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting("xendit_enabled", { value: xenditEnabled }, { silent: true, skipRefetch: true, throwOnError: true }),
        updateSetting("manual_payment_enabled", { value: manualPaymentEnabled }, { silent: true, skipRefetch: true, throwOnError: true }),
      ]);

      // Save bank account settings
      const bankPayload: Json = {
        bank_name: bankName,
        bank_account: bankAccount,
        bank_account_name: bankAccountName,
        payment_instructions: paymentInstructions,
      };

      const { data: existing } = await withTimeout(
        supabase
          .from("system_settings")
          .select("id")
          .eq("key", "billing_settings")
          .maybeSingle(),
        BILLING_SETTINGS_WRITE_TIMEOUT_MS,
        "Permintaan cek billing settings timeout."
      );

      if (existing) {
        await withTimeout(
          supabase
            .from("system_settings")
            .update({ value: bankPayload, updated_at: new Date().toISOString() })
            .eq("key", "billing_settings"),
          BILLING_SETTINGS_WRITE_TIMEOUT_MS,
          "Simpan billing settings timeout."
        );
      } else {
        await withTimeout(
          supabase
            .from("system_settings")
            .insert({
              key: "billing_settings",
              value: bankPayload,
              description: "Pengaturan rekening bank pemilik aplikasi",
            }),
          BILLING_SETTINGS_WRITE_TIMEOUT_MS,
          "Simpan billing settings timeout."
        );
      }

      const templatePayload: Json = {
        html_template: invoiceTemplateHtml.trim() || DEFAULT_BILLING_INVOICE_TEMPLATE,
      };
      const { data: existingTemplate } = await withTimeout(
        supabase
          .from("system_settings")
          .select("id")
          .eq("key", "billing_invoice_template")
          .maybeSingle(),
        BILLING_SETTINGS_WRITE_TIMEOUT_MS,
        "Permintaan cek template invoice timeout."
      );

      if (existingTemplate) {
        await withTimeout(
          supabase
            .from("system_settings")
            .update({ value: templatePayload, updated_at: new Date().toISOString() })
            .eq("key", "billing_invoice_template"),
          BILLING_SETTINGS_WRITE_TIMEOUT_MS,
          "Simpan template invoice timeout."
        );
      } else {
        await withTimeout(
          supabase
            .from("system_settings")
            .insert({
              key: "billing_invoice_template",
              value: templatePayload,
              description: "Templat HTML lembar faktur yang digunakan saat cetak/unduh invoice organisasi.",
            }),
          BILLING_SETTINGS_WRITE_TIMEOUT_MS,
          "Simpan template invoice timeout."
        );
      }

      await refetch();
      toast.success("Pengaturan billing berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.settings.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
        </div>
        <p className="text-base font-medium text-slate-900">Memuat pengaturan billing</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Konfigurasi rekening, biaya, dan templat invoice sedang diproses.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isRetrying && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Sedang mencoba ulang memuat pengaturan billing...
        </div>
      )}
      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}
      {/* Bank Account Settings */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" />
            Rekening Bank Pemilik Aplikasi
          </CardTitle>
          <CardDescription>
            Informasi rekening ini akan ditampilkan kepada admin organisasi saat melakukan pembayaran manual
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bankName">Nama Bank</Label>
              <Input
                id="bankName"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Contoh: BCA, BNI, Mandiri"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccount">No. Rekening</Label>
              <Input
                id="bankAccount"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="Masukkan no rekening"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccountName">Atas Nama</Label>
              <Input
                id="bankAccountName"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                placeholder="Nama pemilik rekening"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentInstructions">Instruksi Pembayaran (opsional)</Label>
            <Textarea
              id="paymentInstructions"
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              placeholder="Instruksi tambahan untuk pembayaran manual..."
              rows={2}
            />
          </div>
          {(!bankAccount || !bankAccountName) && (
            <p className="text-sm text-destructive flex items-center gap-1">
              ⚠️ No. Rekening dan Atas Nama wajib diisi agar pembayaran manual berfungsi
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4" />
            Format Lembar Faktur (Editable)
          </CardTitle>
          <CardDescription>
            Templat HTML untuk cetak/unduh faktur pada halaman organisasi.
            Gunakan placeholder seperti {"{{invoice_number}}"} dan {"{{transaction_rows}}"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <p className="mb-2 font-medium">Placeholder tersedia:</p>
            <div className="flex flex-wrap gap-2">
              {BILLING_INVOICE_TEMPLATE_TOKENS.map((token) => (
                <code key={token} className="rounded bg-background px-2 py-1 text-[11px]">
                  {`{{${token}}}`}
                </code>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceTemplateHtml">Templat HTML Faktur</Label>
            <Textarea
              id="invoiceTemplateHtml"
              value={invoiceTemplateHtml}
              onChange={(e) => setInvoiceTemplateHtml(e.target.value)}
              rows={18}
              className="font-mono text-xs"
              placeholder="Masukkan HTML template faktur..."
            />
          </div>
          <div className="space-y-2">
            <Label>Pratinjau Faktur</Label>
            <div className="overflow-hidden rounded-md border bg-white">
              <iframe
                title="Pratinjau templat faktur"
                srcDoc={invoiceTemplatePreviewHtml}
                sandbox=""
                className="h-[620px] w-full bg-white"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Pratinjau memakai data contoh. Placeholder yang belum cocok akan tetap tampil apa adanya.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvoiceTemplateHtml(DEFAULT_BILLING_INVOICE_TEMPLATE)}
            >
              Reset Templat Bawaan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            Pengaturan Harga
          </CardTitle>
          <CardDescription>Konfigurasi harga dasar dan perpajakan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pricePerEmployee">Harga per Pegawai (per bulan)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                <Input
                  id="pricePerEmployee"
                  type="number"
                  value={pricePerEmployee}
                  onChange={(e) => setPricePerEmployee(Number(e.target.value))}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatPercentage">PPN (%)</Label>
              <div className="relative">
                <Input
                  id="vatPercentage"
                  type="number"
                  value={vatPercentage}
                  onChange={(e) => setVatPercentage(Number(e.target.value))}
                  className="pr-8"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pphPercentage">PPH (%)</Label>
              <div className="relative">
                <Input
                  id="pphPercentage"
                  type="number"
                  value={pphPercentage}
                  onChange={(e) => setPphPercentage(Number(e.target.value))}
                  className="pr-8"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30" data-testid="billing-attendance-intro-promo-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4" />
            Promo Onboarding Absensi
          </CardTitle>
          <CardDescription>
            Atur harga promosi untuk 1, 2, atau 3 bulan pertama per subscription attendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Aktifkan Promo Onboarding</Label>
              <p className="text-xs text-muted-foreground">
                Promo berlaku otomatis saat invoice dibuat untuk langganan attendance yang eligible.
              </p>
            </div>
            <Switch
              checked={attendanceIntroPromoActive}
              onCheckedChange={setAttendanceIntroPromoActive}
              data-testid="billing-attendance-intro-promo-active"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="attendanceIntroPromoPrice">Harga Promo/Bulan</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">Rp</span>
                <Input
                  id="attendanceIntroPromoPrice"
                  type="number"
                  value={attendanceIntroPromoPrice}
                  onChange={(e) => setAttendanceIntroPromoPrice(Number(e.target.value))}
                  className="pl-10"
                  min={0}
                  disabled={!attendanceIntroPromoActive}
                  data-testid="billing-attendance-intro-promo-price"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Durasi Promo</Label>
              <Select
                value={String(attendanceIntroPromoDuration)}
                onValueChange={handleAttendanceIntroPromoDurationChange}
                disabled={!attendanceIntroPromoActive}
              >
                <SelectTrigger data-testid="billing-attendance-intro-promo-duration">
                  <SelectValue placeholder="Pilih durasi promo" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((duration) => (
                    <SelectItem key={`attendance-promo-${duration}`} value={String(duration)}>
                      {duration} bulan pertama
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="attendanceIntroPromoLabel">Label Promo</Label>
              <Input
                id="attendanceIntroPromoLabel"
                value={attendanceIntroPromoLabel}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  const defaultLabel = buildDefaultAttendanceIntroPromoLabel(attendanceIntroPromoDuration);
                  setAttendanceIntroPromoLabel(nextValue);
                  setAttendanceIntroPromoLabelTouched(
                    nextValue.trim().length > 0 && nextValue.trim() !== defaultLabel,
                  );
                }}
                placeholder="Promo onboarding 2 bulan pertama"
                disabled={!attendanceIntroPromoActive}
                data-testid="billing-attendance-intro-promo-label"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Hanya untuk tenant baru</Label>
              <p className="text-xs text-muted-foreground">
                Jika aktif, promo hanya diberikan saat subscription baru pertama kali dibuat.
              </p>
            </div>
            <Switch
              checked={attendanceIntroPromoNewTenantsOnly}
              onCheckedChange={setAttendanceIntroPromoNewTenantsOnly}
              disabled={!attendanceIntroPromoActive}
              data-testid="billing-attendance-intro-promo-new-tenants-only"
            />
          </div>

          {attendanceIntroPromoValidationMessage && (
            <div
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-800"
              data-testid="billing-attendance-intro-promo-validation"
            >
              {attendanceIntroPromoValidationMessage}
            </div>
          )}

          <div
            className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm"
            data-testid="billing-attendance-intro-promo-preview"
          >
            <p className="font-medium">Pratinjau campaign</p>
            <p className="mt-1 text-muted-foreground">
              {getAttendanceIntroPromoCampaignText(resolvedAttendanceIntroPromoConfig) || "Promo onboarding tidak aktif."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Setelah promo habis, invoice berikutnya otomatis kembali ke harga normal Absensi{" "}
              {formatCurrency(pricePerEmployee)}/pegawai/bulan.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Simulasi tagihan per pegawai</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {attendanceIntroPromoPreviewRows.map((preview) => (
                <div
                  key={`attendance-intro-preview-${preview.months}`}
                  className="rounded-lg border bg-muted/20 p-3 text-sm"
                  data-testid={`billing-attendance-intro-promo-summary-${preview.months}`}
                >
                  <p className="font-medium">
                    Paket {preview.months} bulan
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Total tagihan: <span className="font-medium text-foreground">{formatCurrency(preview.total)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Rata-rata: {formatCurrency(preview.average)}/bulan
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Promo terpakai: {preview.promoMonthsApplied} bulan
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Pengaturan Langganan
          </CardTitle>
          <CardDescription>Aturan durasi, grace period, dan minimum pembayaran</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="gracePeriodDays">Grace Period (hari)</Label>
              <Input
                id="gracePeriodDays"
                type="number"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(Number(e.target.value))}
                min={1}
                max={30}
              />
              <p className="text-xs text-muted-foreground">
                Jumlah hari akses terbatas setelah langganan expired
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentArchiveRetentionDays">Masa Simpan Arsip Pembayaran (hari)</Label>
              <Input
                id="paymentArchiveRetentionDays"
                type="number"
                value={paymentArchiveRetentionDays}
                onChange={(e) => setPaymentArchiveRetentionDays(Number(e.target.value))}
                min={1}
                max={365}
              />
              <p className="text-xs text-muted-foreground">
                Setelah validasi, bukti transfer masuk arsip dan dihapus otomatis saat melewati masa simpan.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="individualMinDuration">Min. Durasi Perorangan (bulan)</Label>
              <Select
                value={String(individualMinDuration)}
                onValueChange={(value) =>
                  setIndividualMinDuration(
                    normalizeDurationOption(Number(value), INDIVIDUAL_MIN_DURATION_DEFAULT),
                  )
                }
              >
                <SelectTrigger id="individualMinDuration">
                  <SelectValue placeholder="Pilih durasi" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_DURATION_OPTIONS.map((duration) => (
                    <SelectItem key={`individual-${duration}`} value={String(duration)}>
                      {duration} bulan
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Berlaku untuk semua tenant dengan billing mandiri.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Min. Durasi Terpusat - Pemerintah Daerah</Label>
              <Select
                value={String(centralizedPemdaMinDuration)}
                onValueChange={(value) =>
                  setCentralizedPemdaMinDuration(
                    normalizeDurationOption(
                      Number(value),
                      CENTRALIZED_MIN_DURATION_DEFAULTS.pemerintah_daerah,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih durasi" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_DURATION_OPTIONS.map((duration) => (
                    <SelectItem key={`pemda-${duration}`} value={String(duration)}>
                      {duration} bulan
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Min. Durasi Terpusat - Instansi</Label>
              <Select
                value={String(centralizedInstansiMinDuration)}
                onValueChange={(value) =>
                  setCentralizedInstansiMinDuration(
                    normalizeDurationOption(
                      Number(value),
                      CENTRALIZED_MIN_DURATION_DEFAULTS.instansi_pemerintah,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih durasi" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_DURATION_OPTIONS.map((duration) => (
                    <SelectItem key={`instansi-${duration}`} value={String(duration)}>
                      {duration} bulan
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Min. Durasi Terpusat - Perusahaan</Label>
              <Select
                value={String(centralizedPerusahaanMinDuration)}
                onValueChange={(value) =>
                  setCentralizedPerusahaanMinDuration(
                    normalizeDurationOption(
                      Number(value),
                      CENTRALIZED_MIN_DURATION_DEFAULTS.perusahaan,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih durasi" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_DURATION_OPTIONS.map((duration) => (
                    <SelectItem key={`perusahaan-${duration}`} value={String(duration)}>
                      {duration} bulan
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Min. Durasi Terpusat - Sekolah</Label>
              <Select
                value={String(centralizedSekolahMinDuration)}
                onValueChange={(value) =>
                  setCentralizedSekolahMinDuration(
                    normalizeDurationOption(
                      Number(value),
                      CENTRALIZED_MIN_DURATION_DEFAULTS.sekolah,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih durasi" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_DURATION_OPTIONS.map((duration) => (
                    <SelectItem key={`sekolah-${duration}`} value={String(duration)}>
                      {duration} bulan
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Opsi minimum pembayaran dibatasi ke 1, 3, 6, atau 12 bulan.
          </p>
          <p className="text-xs text-muted-foreground">
            Validasi minimum diterapkan di server (invoice online/manual) dan paket di bawah minimum
            otomatis disembunyikan pada flow aktivasi.
          </p>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Metode Pembayaran
          </CardTitle>
          <CardDescription>Aktifkan/nonaktifkan metode pembayaran</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Pembayaran Online (Xendit)</Label>
              <p className="text-xs text-muted-foreground">
                VA, E-Wallet, QRIS, Kartu Kredit
              </p>
            </div>
            <Switch
              checked={xenditEnabled}
              onCheckedChange={setXenditEnabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Pembayaran Manual</Label>
              <p className="text-xs text-muted-foreground">
                Transfer bank dengan verifikasi admin
              </p>
            </div>
            <Switch
              checked={manualPaymentEnabled}
              onCheckedChange={setManualPaymentEnabled}
            />
          </div>
          
          {!xenditEnabled && !manualPaymentEnabled && (
            <p className="text-sm text-destructive">
              ⚠️ Setidaknya satu metode pembayaran harus aktif
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} data-testid="billing-settings-save">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
