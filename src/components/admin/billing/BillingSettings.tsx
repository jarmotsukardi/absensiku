import { useState, useEffect } from "react";
import { useBillingSettings } from "@/hooks/useBilling";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, DollarSign, Percent, Clock, CreditCard, Landmark } from "lucide-react";
import { toast } from "sonner";

export function BillingSettings() {
  const { settings, isLoading, getSetting, updateSetting } = useBillingSettings();
  const [isSaving, setIsSaving] = useState(false);
  
  const [pricePerEmployee, setPricePerEmployee] = useState(15000);
  const [vatPercentage, setVatPercentage] = useState(11);
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
  const [individualMinDuration, setIndividualMinDuration] = useState(6);
  const [xenditEnabled, setXenditEnabled] = useState(false);
  const [manualPaymentEnabled, setManualPaymentEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Bank account fields
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  // Only initialize form values ONCE when settings first load
  useEffect(() => {
    if (!isLoading && settings.length > 0 && !initialized) {
      const price = getSetting("price_per_employee");
      const vat = getSetting("vat_percentage");
      const grace = getSetting("grace_period_days");
      const minDuration = getSetting("individual_min_duration_months");
      const xendit = getSetting("xendit_enabled");
      const manual = getSetting("manual_payment_enabled");

      if (price) setPricePerEmployee(price.amount || 15000);
      if (vat) setVatPercentage(vat.value || 11);
      if (grace) setGracePeriodDays(grace.value || 3);
      if (minDuration) setIndividualMinDuration(minDuration.value || 6);
      if (xendit) setXenditEnabled(xendit.value || false);
      if (manual) setManualPaymentEnabled(manual.value !== false);
      setInitialized(true);
    }
  }, [settings, isLoading, initialized]);

  // Fetch billing_settings (bank account info) from system_settings
  useEffect(() => {
    const fetchBankSettings = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "billing_settings")
        .maybeSingle();

      if (data?.value) {
        const val = data.value as any;
        setBankName(val.bank_name || "");
        setBankAccount(val.bank_account || "");
        setBankAccountName(val.bank_account_name || "");
        setPaymentInstructions(val.payment_instructions || "");
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
        updateSetting("grace_period_days", { value: gracePeriodDays }),
        updateSetting("individual_min_duration_months", { value: individualMinDuration }),
        updateSetting("xendit_enabled", { value: xenditEnabled }),
        updateSetting("manual_payment_enabled", { value: manualPaymentEnabled }),
      ]);

      // Save bank account settings
      const bankPayload = {
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
          .update({ value: bankPayload as any, updated_at: new Date().toISOString() })
          .eq("key", "billing_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({
            key: "billing_settings",
            value: bankPayload as any,
            description: "Pengaturan rekening bank pemilik aplikasi",
          });
      }

      toast.success("Pengaturan billing berhasil disimpan");
    } catch (error) {
      toast.error("Gagal menyimpan pengaturan");
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
          <div className="grid gap-4 md:grid-cols-2">
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
          <div className="grid gap-4 md:grid-cols-2">
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
