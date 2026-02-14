import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Save, Trash2, Plus, Image, Loader2, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ClientLogo {
  id: string;
  name: string;
  logo_url: string;
  website_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export function ClientLogoSettings() {
  const [logos, setLogos] = useState<ClientLogo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { fetchLogos(); }, []);

  const fetchLogos = async () => {
    try {
      const { data, error } = await supabase.from("client_logos").select("*").order("sort_order");
      if (error) throw error;
      setLogos(data || []);
    } catch (error) {
      console.error("Error fetching logos:", error);
      toast.error("Gagal memuat data logo");
    } finally {
      setIsLoading(false);
    }
  };

  const addLogo = () => {
    setLogos([...logos, {
      id: `temp-${Date.now()}`,
      name: "",
      logo_url: "",
      website_url: null,
      is_active: true,
      sort_order: logos.length,
    }]);
  };

  const updateLogo = (id: string, field: keyof ClientLogo, value: string | boolean | number) => {
    setLogos(logos.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const removeLogo = async (id: string) => {
    if (id.startsWith("temp-")) {
      setLogos(logos.filter((l) => l.id !== id));
      return;
    }
    try {
      const { error } = await supabase.from("client_logos").delete().eq("id", id);
      if (error) throw error;
      setLogos(logos.filter((l) => l.id !== id));
      toast.success("Logo berhasil dihapus");
    } catch (error) {
      toast.error("Gagal menghapus logo");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const logo of logos) {
        if (!logo.name || !logo.logo_url) continue;
        if (logo.id.startsWith("temp-")) {
          const { error } = await supabase.from("client_logos").insert({
            name: logo.name, logo_url: logo.logo_url, website_url: logo.website_url,
            is_active: logo.is_active, sort_order: logo.sort_order,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from("client_logos").update({
            name: logo.name, logo_url: logo.logo_url, website_url: logo.website_url,
            is_active: logo.is_active, sort_order: logo.sort_order,
          }).eq("id", logo.id);
          if (error) throw error;
        }
      }
      toast.success("Perubahan berhasil disimpan");
      fetchLogos();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Gagal menyimpan perubahan");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Logo Klien / Mitra
        </h3>
        <p className="text-sm text-muted-foreground">Kelola logo klien menggunakan URL gambar</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Logo Klien</CardTitle>
          <CardDescription>Masukkan URL link gambar logo (gunakan hosting gambar seperti Imgur, Google Drive, dll)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {logos.map((logo) => (
              <Card key={logo.id} className="relative">
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeLogo(logo.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
                <CardContent className="pt-6 space-y-3">
                  <div className="h-16 w-full rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                    {logo.logo_url ? (
                      <img src={logo.logo_url} alt={logo.name} className="h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                    ) : (
                      <Image className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Input
                      value={logo.name}
                      onChange={(e) => updateLogo(logo.id, "name", e.target.value)}
                      placeholder="Nama klien"
                      className="text-sm"
                    />
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={logo.logo_url}
                        onChange={(e) => updateLogo(logo.id, "logo_url", e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="text-sm pl-9"
                      />
                    </div>
                    <Input
                      value={logo.website_url || ""}
                      onChange={(e) => updateLogo(logo.id, "website_url", e.target.value)}
                      placeholder="Website (opsional)"
                      className="text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Aktif</Label>
                    <Switch checked={logo.is_active} onCheckedChange={(checked) => updateLogo(logo.id, "is_active", checked)} />
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="flex items-center justify-center min-h-[200px] cursor-pointer border-dashed hover:border-primary hover:bg-muted/50 transition-colors" onClick={addLogo}>
              <div className="text-center text-muted-foreground">
                <Plus className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Tambah Logo</p>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Simpan Perubahan
        </Button>
      </div>
    </div>
  );
}
