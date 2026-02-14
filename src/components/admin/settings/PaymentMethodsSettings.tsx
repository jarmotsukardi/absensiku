import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, CreditCard, Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Default Xendit payment method logos with reliable CDN URLs
const xenditPaymentMethods = {
  banks: [
    { id: "bca", name: "BCA", logo: "https://cdn.worldvectorlogo.com/logos/bca-bank-central-asia.svg" },
    { id: "bni", name: "BNI", logo: "https://cdn.worldvectorlogo.com/logos/bni-bank-negara-indonesia.svg" },
    { id: "bri", name: "BRI", logo: "https://cdn.worldvectorlogo.com/logos/bri-bank-rakyat-indonesia.svg" },
    { id: "mandiri", name: "Mandiri", logo: "https://cdn.worldvectorlogo.com/logos/bank-mandiri-logo-2.svg" },
    { id: "permata", name: "Permata", logo: "https://cdn.worldvectorlogo.com/logos/permatabank.svg" },
    { id: "cimb", name: "CIMB Niaga", logo: "https://cdn.worldvectorlogo.com/logos/cimb-niaga-1.svg" },
  ],
  ewallets: [
    { id: "ovo", name: "OVO", logo: "https://cdn.worldvectorlogo.com/logos/ovo-2.svg" },
    { id: "gopay", name: "GoPay", logo: "https://cdn.worldvectorlogo.com/logos/gopay-1.svg" },
    { id: "dana", name: "DANA", logo: "https://cdn.worldvectorlogo.com/logos/dana-2.svg" },
    { id: "shopeepay", name: "ShopeePay", logo: "https://cdn.worldvectorlogo.com/logos/shopeepay.svg" },
    { id: "linkaja", name: "LinkAja", logo: "https://cdn.worldvectorlogo.com/logos/linkaja.svg" },
  ],
  qris: [
    { id: "qris", name: "QRIS", logo: "https://cdn.worldvectorlogo.com/logos/qris.svg" },
  ],
  cards: [
    { id: "visa", name: "Visa", logo: "https://cdn.worldvectorlogo.com/logos/visa-2.svg" },
    { id: "mastercard", name: "Mastercard", logo: "https://cdn.worldvectorlogo.com/logos/mastercard-4.svg" },
    { id: "jcb", name: "JCB", logo: "https://cdn.worldvectorlogo.com/logos/jcb-2.svg" },
    { id: "amex", name: "American Express", logo: "https://cdn.worldvectorlogo.com/logos/american-express-1.svg" },
  ],
  retail: [
    { id: "alfamart", name: "Alfamart", logo: "https://cdn.worldvectorlogo.com/logos/alfamart.svg" },
    { id: "indomaret", name: "Indomaret", logo: "https://cdn.worldvectorlogo.com/logos/indomaret.svg" },
  ],
};

interface CustomPaymentMethod {
  id: string;
  name: string;
  logo: string;
}

interface PaymentMethodsConfig {
  section_title: string;
  section_subtitle: string;
  show_banks: boolean;
  show_ewallets: boolean;
  show_qris: boolean;
  show_cards: boolean;
  show_retail: boolean;
  enabled_banks: string[];
  enabled_ewallets: string[];
  enabled_cards: string[];
  enabled_retail: string[];
  custom_methods: CustomPaymentMethod[];
}

const defaultConfig: PaymentMethodsConfig = {
  section_title: "Dukungan Metode Pembayaran",
  section_subtitle: "Pembayaran aman melalui Xendit Payment Gateway",
  show_banks: true,
  show_ewallets: true,
  show_qris: true,
  show_cards: true,
  show_retail: true,
  enabled_banks: xenditPaymentMethods.banks.map(b => b.id),
  enabled_ewallets: xenditPaymentMethods.ewallets.map(e => e.id),
  enabled_cards: xenditPaymentMethods.cards.map(c => c.id),
  enabled_retail: xenditPaymentMethods.retail.map(r => r.id),
  custom_methods: [],
};

export function PaymentMethodsSettings() {
  const [config, setConfig] = useState<PaymentMethodsConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMethod, setNewMethod] = useState({ name: "", logo: "" });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "xendit_payment_methods_settings")
        .maybeSingle();

      if (data?.value) {
        setConfig({ ...defaultConfig, ...(data.value as Partial<PaymentMethodsConfig>) });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const configValue = JSON.parse(JSON.stringify(config));
      
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "xendit_payment_methods_settings")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: configValue, updated_at: new Date().toISOString() })
          .eq("key", "xendit_payment_methods_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert([{
            key: "xendit_payment_methods_settings",
            value: configValue,
            description: "Pengaturan metode pembayaran Xendit",
          }]);
      }
      toast.success("Pengaturan berhasil disimpan");
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMethod = (category: "enabled_banks" | "enabled_ewallets" | "enabled_cards" | "enabled_retail", id: string) => {
    setConfig(prev => {
      const current = prev[category];
      const newValue = current.includes(id) 
        ? current.filter(i => i !== id)
        : [...current, id];
      return { ...prev, [category]: newValue };
    });
  };

  const addCustomMethod = () => {
    if (!newMethod.name || !newMethod.logo) {
      toast.error("Nama dan URL logo harus diisi");
      return;
    }
    const id = `custom_${Date.now()}`;
    setConfig(prev => ({
      ...prev,
      custom_methods: [...(prev.custom_methods || []), { id, name: newMethod.name, logo: newMethod.logo }]
    }));
    setNewMethod({ name: "", logo: "" });
    setShowAddDialog(false);
    toast.success("Metode pembayaran ditambahkan");
  };

  const removeCustomMethod = (id: string) => {
    setConfig(prev => ({
      ...prev,
      custom_methods: (prev.custom_methods || []).filter(m => m.id !== id)
    }));
    toast.success("Metode pembayaran dihapus");
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Section Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Pengaturan Section
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Judul Section</Label>
              <Input 
                value={config.section_title} 
                onChange={(e) => setConfig({ ...config, section_title: e.target.value })}
                placeholder="Dukungan Metode Pembayaran"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subtitle</Label>
              <Input 
                value={config.section_subtitle} 
                onChange={(e) => setConfig({ ...config, section_subtitle: e.target.value })}
                placeholder="Pembayaran aman melalui Xendit"
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Methods Grid */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Banks */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Bank Transfer</CardTitle>
              <Switch 
                checked={config.show_banks} 
                onCheckedChange={(checked) => setConfig({ ...config, show_banks: checked })}
              />
            </div>
          </CardHeader>
          {config.show_banks && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {xenditPaymentMethods.banks.map((bank) => (
                  <button
                    key={bank.id}
                    onClick={() => toggleMethod("enabled_banks", bank.id)}
                    className={`px-2 py-1 text-xs rounded border transition-all ${
                      config.enabled_banks.includes(bank.id) 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border text-muted-foreground opacity-50"
                    }`}
                  >
                    {bank.name}
                  </button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* E-Wallets */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">E-Wallet</CardTitle>
              <Switch 
                checked={config.show_ewallets} 
                onCheckedChange={(checked) => setConfig({ ...config, show_ewallets: checked })}
              />
            </div>
          </CardHeader>
          {config.show_ewallets && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {xenditPaymentMethods.ewallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => toggleMethod("enabled_ewallets", wallet.id)}
                    className={`px-2 py-1 text-xs rounded border transition-all ${
                      config.enabled_ewallets.includes(wallet.id) 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border text-muted-foreground opacity-50"
                    }`}
                  >
                    {wallet.name}
                  </button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Cards */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Kartu Kredit/Debit</CardTitle>
              <Switch 
                checked={config.show_cards} 
                onCheckedChange={(checked) => setConfig({ ...config, show_cards: checked })}
              />
            </div>
          </CardHeader>
          {config.show_cards && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {xenditPaymentMethods.cards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => toggleMethod("enabled_cards", card.id)}
                    className={`px-2 py-1 text-xs rounded border transition-all ${
                      config.enabled_cards.includes(card.id) 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border text-muted-foreground opacity-50"
                    }`}
                  >
                    {card.name}
                  </button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Retail & QRIS */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Retail & QRIS</CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-xs">QRIS</Label>
                <Switch 
                  checked={config.show_qris} 
                  onCheckedChange={(checked) => setConfig({ ...config, show_qris: checked })}
                />
                <Label className="text-xs ml-2">Retail</Label>
                <Switch 
                  checked={config.show_retail} 
                  onCheckedChange={(checked) => setConfig({ ...config, show_retail: checked })}
                />
              </div>
            </div>
          </CardHeader>
          {config.show_retail && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {xenditPaymentMethods.retail.map((retail) => (
                  <button
                    key={retail.id}
                    onClick={() => toggleMethod("enabled_retail", retail.id)}
                    className={`px-2 py-1 text-xs rounded border transition-all ${
                      config.enabled_retail.includes(retail.id) 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border text-muted-foreground opacity-50"
                    }`}
                  >
                    {retail.name}
                  </button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Custom Methods */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Logo Custom</CardTitle>
              <CardDescription className="text-xs">Tambahkan logo metode pembayaran lainnya</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Tambah
            </Button>
          </div>
        </CardHeader>
        {(config.custom_methods?.length ?? 0) > 0 && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {config.custom_methods?.map((method) => (
                <div key={method.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border bg-muted/50">
                  <img src={method.logo} alt={method.name} className="h-4 w-auto object-contain" onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40x20?text=?';
                  }} />
                  <span className="text-xs">{method.name}</span>
                  <button 
                    onClick={() => removeCustomMethod(method.id)}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Simpan
        </Button>
      </div>

      {/* Add Custom Method Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Metode Pembayaran</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nama</Label>
              <Input 
                value={newMethod.name}
                onChange={(e) => setNewMethod({ ...newMethod, name: e.target.value })}
                placeholder="Contoh: BSI, Danamon, dll"
              />
            </div>
            <div className="space-y-2">
              <Label>URL Logo</Label>
              <Input 
                value={newMethod.logo}
                onChange={(e) => setNewMethod({ ...newMethod, logo: e.target.value })}
                placeholder="https://example.com/logo.svg"
              />
              {newMethod.logo && (
                <div className="mt-2 p-3 bg-muted rounded-md flex items-center justify-center">
                  <img src={newMethod.logo} alt="Preview" className="h-8 w-auto object-contain" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Batal</Button>
            <Button onClick={addCustomMethod}>Tambah</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
