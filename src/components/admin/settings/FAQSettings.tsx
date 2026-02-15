import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Edit, HelpCircle, Image } from "lucide-react";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
}

const defaultFAQs: FAQ[] = [
  { id: "1", question: "Bagaimana cara mendaftar?", answer: "Klik tombol Daftar di halaman utama, lalu isi form pendaftaran dengan data organisasi Anda.", category: "Pendaftaran", sort_order: 1 },
  { id: "2", question: "Apakah ada masa trial gratis?", answer: "Ya, semua organisasi mendapat trial 14 hari dengan maksimal 2 pegawai.", category: "Harga", sort_order: 2 },
  { id: "3", question: "Bagaimana sistem absensi GPS bekerja?", answer: "Sistem akan memvalidasi lokasi pegawai saat check-in/out menggunakan GPS smartphone.", category: "Fitur", sort_order: 3 },
  { id: "4", question: "Apakah bisa digunakan offline?", answer: "Absensi membutuhkan koneksi internet untuk validasi lokasi dan sinkronisasi data.", category: "Teknis", sort_order: 4 },
];

export function FAQSettings() {
  const [faqs, setFaqs] = useState<FAQ[]>(defaultFAQs);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FAQ | null>(null);
  const [formData, setFormData] = useState({ question: "", answer: "", category: "Umum", sort_order: 1 });
  const [bannerImageUrl, setBannerImageUrl] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.from("system_settings").select("value").eq("key", "faq_settings").maybeSingle();
      if (data?.value) {
        const value = data.value;
        if (Array.isArray(value)) {
          setFaqs((value as FAQ[]).sort((a, b) => a.sort_order - b.sort_order));
        } else if (typeof value === "object" && value !== null) {
          const settingsValue = value as { items?: FAQ[]; banner_image_url?: string };
          if (Array.isArray(settingsValue.items)) {
            setFaqs(settingsValue.items.sort((a, b) => a.sort_order - b.sort_order));
          }
          if (typeof settingsValue.banner_image_url === "string") {
            setBannerImageUrl(settingsValue.banner_image_url);
          }
        }
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
      const { data: existing } = await supabase.from("system_settings").select("id").eq("key", "faq_settings").maybeSingle();
      const jsonValue = JSON.parse(JSON.stringify({ items: faqs, banner_image_url: bannerImageUrl }));
      if (existing) {
        await supabase.from("system_settings").update({ value: jsonValue, updated_at: new Date().toISOString() }).eq("key", "faq_settings");
      } else {
        await supabase.from("system_settings").insert({ key: "faq_settings", value: jsonValue });
      }
      toast.success("FAQ berhasil disimpan");
    } catch (err) {
      toast.error("Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ question: "", answer: "", category: "Umum", sort_order: faqs.length + 1 });
    setIsDialogOpen(true);
  };

  const handleEdit = (f: FAQ) => {
    setEditingItem(f);
    setFormData({ question: f.question, answer: f.answer, category: f.category, sort_order: f.sort_order });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => setFaqs(faqs.filter(f => f.id !== id));

  const handleSubmit = () => {
    if (!formData.question || !formData.answer) {
      toast.error("Pertanyaan dan jawaban wajib diisi");
      return;
    }
    if (editingItem) {
      setFaqs(faqs.map(f => f.id === editingItem.id ? { ...f, ...formData } : f));
    } else {
      setFaqs([...faqs, { id: Date.now().toString(), ...formData }]);
    }
    setIsDialogOpen(false);
  };

  if (isLoading) return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const categories = [...new Set(faqs.map(f => f.category))];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Kelola FAQ halaman depan</p>
        <Button onClick={handleAdd} size="sm"><Plus className="h-4 w-4 mr-2" />Tambah FAQ</Button>
      </div>

      {/* Banner Image URL */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <Label className="flex items-center gap-2"><Image className="h-4 w-4" />URL Banner/Gambar Halaman FAQ</Label>
          <Input
            value={bannerImageUrl}
            onChange={(e) => setBannerImageUrl(e.target.value)}
            placeholder="https://example.com/faq-banner.jpg"
          />
          {bannerImageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border h-32">
              <img src={bannerImageUrl} alt="FAQ Banner" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">Gambar ini akan ditampilkan di bagian atas halaman /faq</p>
        </CardContent>
      </Card>

      {categories.map(cat => (
        <Card key={cat}>
          <CardContent className="p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              {cat}
            </h4>
            <Accordion type="single" collapsible className="w-full">
              {faqs.filter(f => f.category === cat).map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="text-left">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span>{faq.question}</span>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(faq)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(faq.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Semua
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit" : "Tambah"} FAQ</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Pertanyaan *</Label>
              <Input value={formData.question} onChange={(e) => setFormData({ ...formData, question: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Jawaban *</Label>
              <Textarea value={formData.answer} onChange={(e) => setFormData({ ...formData, answer: e.target.value })} rows={4} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="Umum, Fitur, Harga, dll" />
              </div>
              <div className="space-y-2">
                <Label>Urutan</Label>
                <Input type="number" value={formData.sort_order} onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 1 })} />
              </div>
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
