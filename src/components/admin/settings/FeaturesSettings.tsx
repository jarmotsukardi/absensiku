import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Edit, MapPin, Clock, Shield, Smartphone, Users, Building2, FileText, BarChart3, Lock, Zap, Calendar, Bell, Timer, Fingerprint, Globe, ClipboardList, UserCheck, PieChart, Eye } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface Feature {
  id: string;
  icon: string;
  title: string;
  description: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  MapPin, Clock, Shield, Users, Building2, FileText, Smartphone, BarChart3, Lock, Zap, Calendar, Bell, Timer, Fingerprint, Globe, ClipboardList, UserCheck, PieChart
};

const iconOptions = Object.keys(iconMap);

const defaultFeatures: Feature[] = [
  { id: "1", icon: "MapPin", title: "Absensi GPS", description: "Validasi lokasi real-time dengan teknologi GPS canggih yang akurat hingga beberapa meter. Sistem secara otomatis memverifikasi apakah pegawai berada dalam radius yang ditentukan saat melakukan check-in dan check-out." },
  { id: "2", icon: "Shield", title: "Anti Fake GPS", description: "Keamanan tingkat tinggi dengan deteksi otomatis terhadap aplikasi fake GPS, mock location, dan upaya manipulasi lokasi lainnya. Sistem menolak absensi jika terdeteksi aktivitas mencurigakan." },
  { id: "3", icon: "Clock", title: "Multi Shift", description: "Kelola berbagai shift kerja fleksibel seperti shift pagi, siang, malam, atau custom. Setiap pegawai dapat memilih shift yang sesuai saat absen jika diaktifkan oleh admin." },
  { id: "4", icon: "Building2", title: "Multi Kantor", description: "Satu akun organisasi dapat mengelola banyak lokasi kantor atau cabang. Setiap lokasi memiliki titik koordinat dan radius toleransi masing-masing." },
];

export function FeaturesSettings() {
  const REQUEST_TIMEOUT_MS = 12000;
  const [features, setFeatures] = useState<Feature[]>(defaultFeatures);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [viewingFeature, setViewingFeature] = useState<Feature | null>(null);
  const [formData, setFormData] = useState({ icon: "MapPin", title: "", description: "" });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await withTimeout(
        supabase.from("system_settings").select("value").eq("key", "features_settings").maybeSingle(),
        REQUEST_TIMEOUT_MS,
        "Memuat pengaturan fitur terlalu lama",
      );
      if (data?.value && Array.isArray(data.value)) {
        setFeatures(data.value as unknown as Feature[]);
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.features.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan fitur.", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await withTimeout(
        supabase.from("system_settings").select("id").eq("key", "features_settings").maybeSingle(),
        REQUEST_TIMEOUT_MS,
        "Membaca konfigurasi fitur terlalu lama",
      );
      const jsonValue = JSON.parse(JSON.stringify(features));
      if (existing) {
        await withTimeout(
          supabase.from("system_settings").update({ value: jsonValue, updated_at: new Date().toISOString() }).eq("key", "features_settings"),
          REQUEST_TIMEOUT_MS,
          "Menyimpan konfigurasi fitur terlalu lama",
        );
      } else {
        await withTimeout(
          supabase.from("system_settings").insert({ key: "features_settings", value: jsonValue }),
          REQUEST_TIMEOUT_MS,
          "Menyimpan konfigurasi fitur terlalu lama",
        );
      }
      toast.success("Fitur berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.features.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan fitur.", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => { 
    setEditingFeature(null); 
    setFormData({ icon: "MapPin", title: "", description: "" }); 
    setIsDialogOpen(true); 
  };

  const handleEdit = (f: Feature) => { 
    setEditingFeature(f); 
    setFormData({ icon: f.icon, title: f.title, description: f.description }); 
    setIsDialogOpen(true); 
  };

  const handleView = (f: Feature) => {
    setViewingFeature(f);
    setIsViewDialogOpen(true);
  };

  const handleDelete = (id: string) => setFeatures(features.filter(f => f.id !== id));

  const handleSubmit = () => {
    if (!formData.title) { toast.error("Judul wajib diisi"); return; }
    if (editingFeature) {
      setFeatures(features.map(f => f.id === editingFeature.id ? { ...f, ...formData } : f));
    } else {
      setFeatures([...features, { id: Date.now().toString(), ...formData }]);
    }
    setIsDialogOpen(false);
  };

  const getIcon = (name: string) => iconMap[name] || MapPin;

  if (isLoading) return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Kelola fitur yang ditampilkan di halaman utama</p>
        <Button onClick={handleAdd} size="sm"><Plus className="h-4 w-4 mr-2" />Tambah Fitur</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => { 
          const Icon = getIcon(f.icon); 
          return (
            <Card key={f.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{f.title}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{f.description}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-1 mt-3 pt-3 border-t">
                  <Button variant="ghost" size="sm" onClick={() => handleView(f)}>
                    <Eye className="h-4 w-4 mr-1" />
                    Lihat
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(f)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(f.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Semua ({features.length} fitur)
        </Button>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFeature ? "Edit" : "Tambah"} Fitur</DialogTitle>
            <DialogDescription>Kelola fitur yang ditampilkan di section "Fitur Lengkap"</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Ikon</Label>
              <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconOptions.map((icon) => {
                    const IconComp = iconMap[icon];
                    return (
                      <SelectItem key={icon} value={icon}>
                        <div className="flex items-center gap-2">
                          <IconComp className="h-4 w-4" />
                          <span>{icon}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Judul Fitur *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Contoh: Absensi GPS" />
            </div>
            <div className="space-y-2">
              <Label>Deskripsi Lengkap</Label>
              <Textarea 
                value={formData.description} 
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                rows={4} 
                placeholder="Jelaskan fitur ini secara detail..."
              />
              <p className="text-xs text-muted-foreground">Deskripsi ini akan muncul saat fitur diklik di halaman utama</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog (Overlay) */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {viewingFeature && (() => {
                const Icon = getIcon(viewingFeature.icon);
                return (
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                );
              })()}
              <DialogTitle className="text-xl">{viewingFeature?.title}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
              {viewingFeature?.description || "Tidak ada deskripsi tersedia."}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
