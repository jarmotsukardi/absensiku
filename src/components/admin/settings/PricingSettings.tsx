import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Edit, Check, CreditCard, Database } from "lucide-react";

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  features: string[];
  is_popular: boolean;
  max_employees: number;
}

interface PricingSectionSettings {
  section_title: string;
  section_subtitle: string;
  show_section: boolean;
}

const defaultPlans: PricingPlan[] = [
  { id: "1", name: "Akses", description: "Coba fitur lengkap untuk tim kecil", price: 0, period: "", features: ["Maksimal 5 - 50 pegawai", "Semua fitur absensi GPS", "Laporan dasar", "Audit trail", "Dukungan email"], is_popular: false, max_employees: 50 },
  { id: "2", name: "Profesional", description: "Untuk instansi dan perusahaan", price: 3500, period: "/pegawai/bulan", features: ["Pegawai tidak terbatas", "Multi OPD & kantor", "Laporan lengkap", "Audit trail lengkap", "Alur persetujuan multi-level", "Dukungan prioritas", "API akses"], is_popular: true, max_employees: 0 },
  { id: "3", name: "Enterprise", description: "Solusi custom untuk kebutuhan khusus", price: 0, period: "", features: ["Semua fitur Profesional", "On-premise deployment", "Integrasi custom", "SLA khusus", "Account manager dedicated", "Training & onboarding"], is_popular: false, max_employees: 0 },
];

const defaultSectionSettings: PricingSectionSettings = {
  section_title: "Harga Transparan",
  section_subtitle: "Pilih paket yang sesuai dengan kebutuhan instansi Anda.",
  show_section: true,
};

export function PricingSettings() {
  const [plans, setPlans] = useState<PricingPlan[]>(defaultPlans);
  const [sectionSettings, setSectionSettings] = useState<PricingSectionSettings>(defaultSectionSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    description: "", 
    price: 0, 
    period: "bulan", 
    features: "", 
    is_popular: false, 
    max_employees: 10 
  });

  useEffect(() => { 
    fetchSettings(); 
  }, []);

  const fetchSettings = async () => {
    try {
      // Fetch pricing plans
      const { data: pricingData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "pricing_settings")
        .maybeSingle();
      
      if (pricingData?.value && Array.isArray(pricingData.value)) {
        setPlans(pricingData.value as unknown as PricingPlan[]);
      }

      // Fetch section settings
      const { data: sectionData } = await supabase
        .from("homepage_sections")
        .select("settings, is_enabled")
        .eq("section_key", "pricing")
        .maybeSingle();

      if (sectionData?.settings && typeof sectionData.settings === 'object') {
        setSectionSettings({
          ...defaultSectionSettings,
          ...(sectionData.settings as Record<string, unknown>),
          show_section: sectionData.is_enabled ?? true,
        });
      }
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save pricing plans
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "pricing_settings")
        .maybeSingle();
      
      const jsonValue = JSON.parse(JSON.stringify(plans));
      
      if (existing) {
        await supabase.from("system_settings").update({ value: jsonValue, updated_at: new Date().toISOString() }).eq("key", "pricing_settings");
      } else {
        await supabase.from("system_settings").insert({ key: "pricing_settings", value: jsonValue });
      }

      // Save section settings to homepage_sections
      const { section_title, section_subtitle, show_section } = sectionSettings;
      await supabase
        .from("homepage_sections")
        .update({ 
          settings: { section_title, section_subtitle },
          is_enabled: show_section,
          updated_at: new Date().toISOString() 
        })
        .eq("section_key", "pricing");

      toast.success("Pengaturan harga berhasil disimpan");
    } catch (e) { 
      toast.error("Gagal menyimpan"); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handlePopulateDummy = async () => {
    setPlans(defaultPlans);
    toast.success("Data dummy dimuat. Klik 'Simpan' untuk menyimpan.");
  };

  const handleAdd = () => { 
    setEditingPlan(null); 
    setFormData({ name: "", description: "", price: 0, period: "bulan", features: "", is_popular: false, max_employees: 10 }); 
    setIsDialogOpen(true); 
  };

  const handleEdit = (p: PricingPlan) => { 
    setEditingPlan(p); 
    setFormData({ 
      name: p.name, 
      description: p.description, 
      price: p.price, 
      period: p.period, 
      features: p.features.join("\n"), 
      is_popular: p.is_popular, 
      max_employees: p.max_employees 
    }); 
    setIsDialogOpen(true); 
  };

  const handleDelete = (id: string) => setPlans(plans.filter(p => p.id !== id));

  const handleSubmit = () => {
    if (!formData.name) { 
      toast.error("Nama wajib diisi"); 
      return; 
    }
    const newPlan: PricingPlan = { 
      id: editingPlan?.id || Date.now().toString(), 
      ...formData, 
      features: formData.features.split("\n").filter(f => f.trim()) 
    };
    if (editingPlan) {
      setPlans(plans.map(p => p.id === editingPlan.id ? newPlan : p));
    } else {
      setPlans([...plans, newPlan]);
    }
    setIsDialogOpen(false);
    toast.success(editingPlan ? "Paket diperbarui" : "Paket ditambahkan");
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

  if (isLoading) return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Section Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pengaturan Section Harga
          </CardTitle>
          <CardDescription>Atur tampilan section harga di halaman depan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label className="font-medium">Tampilkan Section Harga</Label>
              <p className="text-sm text-muted-foreground">Aktifkan section harga di halaman utama</p>
            </div>
            <Switch 
              checked={sectionSettings.show_section} 
              onCheckedChange={(checked) => setSectionSettings({ ...sectionSettings, show_section: checked })} 
            />
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Judul Section</Label>
              <Input 
                value={sectionSettings.section_title} 
                onChange={(e) => setSectionSettings({ ...sectionSettings, section_title: e.target.value })}
                placeholder="Harga Transparan"
              />
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input 
                value={sectionSettings.section_subtitle} 
                onChange={(e) => setSectionSettings({ ...sectionSettings, section_subtitle: e.target.value })}
                placeholder="Pilih paket yang sesuai..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daftar Paket Harga ({plans.length})</CardTitle>
              <CardDescription>Kelola paket harga yang ditampilkan di halaman depan</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePopulateDummy} size="sm">
                <Database className="h-4 w-4 mr-2" />
                Muat Data Default
              </Button>
              <Button onClick={handleAdd} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Tambah
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map(p => (
              <Card key={p.id} className={`relative ${p.is_popular ? "border-primary border-2" : ""}`}>
                {p.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">Populer</Badge>
                  </div>
                )}
                <CardContent className="p-4 pt-6">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-lg">{p.name}</h4>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{p.description}</p>
                  <p className="text-2xl font-bold mb-4">
                    {p.price === 0 && p.name === "Enterprise" ? "Hubungi Kami" : p.price === 0 ? "Gratis" : formatCurrency(p.price)}
                    <span className="text-sm text-muted-foreground font-normal">{p.period}</span>
                  </p>
                  <ul className="space-y-2">
                    {p.features.slice(0, 5).map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                    {p.features.length > 5 && (
                      <li className="text-sm text-muted-foreground">+{p.features.length - 5} fitur lainnya</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Semua
        </Button>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Paket Harga" : "Tambah Paket Harga"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nama Paket *</Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Starter, Pro, Enterprise" />
              </div>
              <div className="space-y-2">
                <Label>Harga (Rp)</Label>
                <Input type="number" value={formData.price} onChange={e => setFormData({...formData, price: parseInt(e.target.value) || 0})} placeholder="99000" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Periode</Label>
                <Input value={formData.period} onChange={e => setFormData({...formData, period: e.target.value})} placeholder="/bulan, /pegawai/bulan" />
              </div>
              <div className="space-y-2">
                <Label>Maks Pegawai</Label>
                <Input type="number" value={formData.max_employees} onChange={e => setFormData({...formData, max_employees: parseInt(e.target.value) || 0})} placeholder="0 = unlimited" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deskripsi</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Untuk usaha kecil menengah" />
            </div>
            <div className="space-y-2">
              <Label>Fitur (satu per baris)</Label>
              <Textarea 
                className="min-h-[120px]" 
                value={formData.features} 
                onChange={e => setFormData({...formData, features: e.target.value})} 
                placeholder="25 pegawai&#10;3 kantor&#10;Laporan lengkap&#10;API akses" 
              />
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <Switch 
                id="is_popular" 
                checked={formData.is_popular} 
                onCheckedChange={checked => setFormData({...formData, is_popular: checked})} 
              />
              <Label htmlFor="is_popular">Tandai sebagai Populer</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
