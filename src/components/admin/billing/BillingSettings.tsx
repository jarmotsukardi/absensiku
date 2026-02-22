import { useState, useEffect } from "react";
import { useBillingSettings } from "@/hooks/useBilling";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, DollarSign, Percent, Clock, CreditCard, Landmark } from "lucide-react";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  BILLING_INVOICE_TEMPLATE_TOKENS,
  DEFAULT_BILLING_INVOICE_TEMPLATE,
} from "@/lib/billingInvoiceTemplate";

export function BillingSettings() {
  const { settings, isLoading, getSetting, updateSetting } = useBillingSettings();
  const [isSaving, setIsSaving] = useState(false);
  
  const [pricePerEmployee, setPricePerEmployee] = useState(15000);
  const [vatPercentage, setVatPercentage] = useState(11);
  const [pphPercentage, setPphPercentage] = useState(2);
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
  const [paymentArchiveRetentionDays, setPaymentArchiveRetentionDays] = useState(7);
  const [individualMinDuration, setIndividualMinDuration] = useState(6);
  const [xenditEnabled, setXenditEnabled] = useState(false);
  const [manualPaymentEnabled, setManualPaymentEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Bank account fields
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [invoiceTemplateHtml, setInvoiceTemplateHtml] = useState(DEFAULT_BILLING_INVOICE_TEMPLATE);

  // Only initialize form values ONCE when settings first load
  useEffect(() => {
    if (!isLoading && settings.length > 0 && !initialized) {
      const price = getSetting("price_per_employee");
      const vat = getSetting("vat_percentage");
      const pph = getSetting("pph_percentage");
      const grace = getSetting("grace_period_days");
      const archiveRetention = getSetting("payment_archive_retention_days");
      const minDuration = getSetting("individual_min_duration_months");
      const xendit = getSetting("xendit_enabled");
      const manual = getSetting("manual_payment_enabled");

      if (price) setPricePerEmployee(price.amount || 15000);
      if (vat) setVatPercentage(vat.value || 11);
      if (pph) setPphPercentage(pph.value || 2);
      if (grace) setGracePeriodDays(grace.value || 3);
      if (archiveRetention) {
        const raw = Number(archiveRetention.value || 7);
        setPaymentArchiveRetentionDays(Math.min(365, Math.max(1, Number.isFinite(raw) ? raw : 7)));
      }
      if (minDuration) setIndividualMinDuration(minDuration.value || 6);
      if (xendit) setXenditEnabled(xendit.value || false);
      if (manual) setManualPaymentEnabled(manual.value !== false);
      setInitialized(true);
    }
  }, [settings, isLoading, initialized, getSetting]);

  // Fetch billing_settings (bank account info) from system_settings
  useEffect(() => {
    const fetchBankSettings = async () => {
      const [bankRes, templateRes] = await Promise.all([
        supabase.from("system_settings").select("value").eq("key", "billing_settings").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "billing_invoice_template").maybeSingle(),
      ]);

      if (bankRes.error) {
        reportError(bankRes.error, "admin.billing.settings.fetch_bank_settings");
      }
      if (templateRes.error) {
        reportError(templateRes.error, "admin.billing.settings.fetch_invoice_template");
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
    };
    fetchBankSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save billing pricing settings
      await Promise.all([
        updateSetting("price_per_employee", { amount: pricePerEmployee, currency: "IDR" }),
        updateSetting("vat_percentage", { value: vatPercentage }),
        updateSetting("pph_percentage", { value: pphPercentage }),
        updateSetting("grace_period_days", { value: gracePeriodDays }),
        updateSetting("payment_archive_retention_days", {
          value: Math.min(365, Math.max(1, Number.isFinite(paymentArchiveRetentionDays) ? paymentArchiveRetentionDays : 7)),
        }),
        updateSetting("individual_min_duration_months", { value: individualMinDuration }),
        updateSetting("xendit_enabled", { value: xenditEnabled }),
        updateSetting("manual_payment_enabled", { value: manualPaymentEnabled }),
      ]);

      // Save bank account settings
      const bankPayload: Json = {
        bank_name: bankName,
        bank_account: bankAccount,
        bank_account_name: bankAccountName,
        payment_instructions: paymentInstructions,
      };

      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "billing_settings")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: bankPayload, updated_at: new Date().toISOString() })
          .eq("key", "billing_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({
            key: "billing_settings",
            value: bankPayload,
            description: "Pengaturan rekening bank pemilik aplikasi",
          });
      }

      const templatePayload: Json = {
        html_template: invoiceTemplateHtml.trim() || DEFAULT_BILLING_INVOICE_TEMPLATE,
      };
      const { data: existingTemplate } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "billing_invoice_template")
        .maybeSingle();

      if (existingTemplate) {
        await supabase
          .from("system_settings")
          .update({ value: templatePayload, updated_at: new Date().toISOString() })
          .eq("key", "billing_invoice_template");
      } else {
        await supabase
          .from("system_settings")
          .insert({
            key: "billing_invoice_template",
            value: templatePayload,
            description: "Template HTML lembar faktur yang digunakan saat print/download invoice organisasi.",
          });
      }

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
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            Template HTML untuk print/download faktur pada halaman organisasi.
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
            <Label htmlFor="invoiceTemplateHtml">Template HTML Faktur</Label>
            <Textarea
              id="invoiceTemplateHtml"
              value={invoiceTemplateHtml}
              onChange={(e) => setInvoiceTemplateHtml(e.target.value)}
              rows={18}
              className="font-mono text-xs"
              placeholder="Masukkan HTML template faktur..."
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvoiceTemplateHtml(DEFAULT_BILLING_INVOICE_TEMPLATE)}
            >
              Reset Template Default
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

      {/* Subscription Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Pengaturan Langganan
          </CardTitle>
          <CardDescription>Aturan durasi dan grace period</CardDescription>
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
              <Input
                id="individualMinDuration"
                type="number"
                value={individualMinDuration}
                onChange={(e) => setIndividualMinDuration(Number(e.target.value))}
                min={1}
                max={12}
              />
              <p className="text-xs text-muted-foreground">
                Durasi minimum untuk langganan perorangan
              </p>
            </div>
          </div>
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
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}
