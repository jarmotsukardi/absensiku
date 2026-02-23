import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Edit, Star, Quote } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  content: string;
  rating: number;
  avatar_url: string;
}

const defaultTestimonials: Testimonial[] = [
  { id: "1", name: "Budi Santoso", role: "Kepala Dinas", company: "Dinas Kominfo Kota Bandung", content: "Sistem absensi yang sangat membantu dalam monitoring kehadiran pegawai.", rating: 5, avatar_url: "" },
  { id: "2", name: "Siti Rahayu", role: "HRD Manager", company: "PT. Maju Bersama", content: "Mudah digunakan dan laporan sangat lengkap.", rating: 5, avatar_url: "" },
];

export function TestimonialsSettings() {
  const REQUEST_TIMEOUT_MS = 12000;
  const [testimonials, setTestimonials] = useState<Testimonial[]>(defaultTestimonials);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Testimonial | null>(null);
  const [formData, setFormData] = useState({ name: "", role: "", company: "", content: "", rating: 5, avatar_url: "" });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await withTimeout(
        supabase.from("system_settings").select("value").eq("key", "testimonials_settings").maybeSingle(),
        REQUEST_TIMEOUT_MS,
        "Memuat pengaturan testimoni terlalu lama",
      );
      if (data?.value && Array.isArray(data.value)) {
        setTestimonials(data.value as unknown as Testimonial[]);
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.testimonials.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan testimoni.", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await withTimeout(
        supabase.from("system_settings").select("id").eq("key", "testimonials_settings").maybeSingle(),
        REQUEST_TIMEOUT_MS,
        "Membaca konfigurasi testimoni terlalu lama",
      );
      const jsonValue = JSON.parse(JSON.stringify(testimonials));
      if (existing) {
        await withTimeout(
          supabase.from("system_settings").update({ value: jsonValue, updated_at: new Date().toISOString() }).eq("key", "testimonials_settings"),
          REQUEST_TIMEOUT_MS,
          "Menyimpan konfigurasi testimoni terlalu lama",
        );
      } else {
        await withTimeout(
          supabase.from("system_settings").insert({ key: "testimonials_settings", value: jsonValue }),
          REQUEST_TIMEOUT_MS,
          "Menyimpan konfigurasi testimoni terlalu lama",
        );
      }
      toast.success("Testimoni berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.testimonials.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan testimoni.", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ name: "", role: "", company: "", content: "", rating: 5, avatar_url: "" });
    setIsDialogOpen(true);
  };

  const handleEdit = (t: Testimonial) => {
    setEditingItem(t);
    setFormData({ name: t.name, role: t.role, company: t.company, content: t.content, rating: t.rating, avatar_url: t.avatar_url });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => setTestimonials(testimonials.filter(t => t.id !== id));

  const handleSubmit = () => {
    if (!formData.name || !formData.content) {
      toast.error("Nama dan konten wajib diisi");
      return;
    }
    if (editingItem) {
      setTestimonials(testimonials.map(t => t.id === editingItem.id ? { ...t, ...formData } : t));
    } else {
      setTestimonials([...testimonials, { id: Date.now().toString(), ...formData }]);
    }
    setIsDialogOpen(false);
  };

  if (isLoading) return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Kelola testimoni pelanggan</p>
        <Button onClick={handleAdd} size="sm"><Plus className="h-4 w-4 mr-2" />Tambah Testimoni</Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {testimonials.map((t) => (
          <Card key={t.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Quote className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-2">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">"{t.content}"</p>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role} - {t.company}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(t)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Semua
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingItem ? "Edit" : "Tambah"} Testimoni</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nama *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Jabatan</Label>
                <Input value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Perusahaan/Instansi</Label>
              <Input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Testimoni *</Label>
              <Textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Rating (1-5)</Label>
              <Input type="number" min={1} max={5} value={formData.rating} onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) || 5 })} />
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
