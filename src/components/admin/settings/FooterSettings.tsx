import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface FooterLink {
  id: string;
  label: string;
  url: string;
  content?: string; // HTML content for overlay (legal links)
}

interface FooterSettingsData {
  company_name: string;
  company_description: string;
  copyright_text: string;
  enable_contact: boolean;
  enable_social_media: boolean;
  address: string;
  email: string;
  phone: string;
  whatsapp: string;
  quick_links: FooterLink[];
  legal_links: FooterLink[];
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  social_youtube: string;
  social_linkedin: string;
  social_tiktok: string;
  social_telegram: string;
}

const defaultSettings: FooterSettingsData = {
  company_name: "AbsensiKu",
  company_description: "Sistem absensi digital modern dengan teknologi GPS untuk organisasi dan perusahaan.",
  copyright_text: "© 2024 AbsensiKu. All rights reserved.",
  enable_contact: true,
  enable_social_media: true,
  address: "",
  email: "",
  phone: "",
  whatsapp: "",
  quick_links: [
    { id: "1", label: "Beranda", url: "/" },
    { id: "2", label: "Fitur", url: "#features" },
    { id: "3", label: "Harga", url: "#pricing" },
    { id: "4", label: "FAQ", url: "#faq" },
  ],
  legal_links: [
    { id: "1", label: "Kebijakan Privasi", url: "/privacy-policy" },
    { id: "2", label: "Syarat & Ketentuan", url: "#", content: "<p>Syarat dan ketentuan layanan.</p>" },
  ],
  social_facebook: "",
  social_instagram: "",
  social_twitter: "",
  social_youtube: "",
  social_linkedin: "",
  social_tiktok: "",
  social_telegram: "",
};

export function FooterSettings() {
  const [settings, setSettings] = useState<FooterSettingsData>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "footer_settings")
            .maybeSingle(),
        10000,
        "Load footer settings timeout"
      );

      if (data?.value) {
        setSettings({ ...defaultSettings, ...(data.value as Record<string, unknown>) });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.footer.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan footer", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("id")
            .eq("key", "footer_settings")
            .maybeSingle(),
        10000,
        "Load footer existing setting timeout"
      );

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: jsonValue, updated_at: new Date().toISOString() })
              .eq("key", "footer_settings"),
          10000,
          "Update footer settings timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert({ key: "footer_settings", value: jsonValue }),
          10000,
          "Insert footer settings timeout"
        );
        if (error) throw error;
      }
      
      toast.success("Pengaturan footer berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.footer.save");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const addQuickLink = () => {
    setSettings({
      ...settings,
      quick_links: [...settings.quick_links, { id: Date.now().toString(), label: "", url: "" }]
    });
  };

  const updateQuickLink = (id: string, field: keyof FooterLink, value: string) => {
    setSettings({
      ...settings,
      quick_links: settings.quick_links.map(l => l.id === id ? { ...l, [field]: value } : l)
    });
  };

  const removeQuickLink = (id: string) => {
    setSettings({
      ...settings,
      quick_links: settings.quick_links.filter(l => l.id !== id)
    });
  };

  const addLegalLink = () => {
    setSettings({
      ...settings,
      legal_links: [...settings.legal_links, { id: Date.now().toString(), label: "", url: "", content: "" }]
    });
  };

  const updateLegalLink = (id: string, field: keyof FooterLink, value: string) => {
    setSettings({
      ...settings,
      legal_links: settings.legal_links.map(l => l.id === id ? { ...l, [field]: value } : l)
    });
  };

  const removeLegalLink = (id: string) => {
    setSettings({
      ...settings,
      legal_links: settings.legal_links.filter(l => l.id !== id)
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Company Info */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Informasi Perusahaan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nama Perusahaan</Label>
              <Input value={settings.company_name} onChange={(e) => setSettings({ ...settings, company_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Teks Copyright</Label>
              <Input value={settings.copyright_text} onChange={(e) => setSettings({ ...settings, copyright_text: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Deskripsi</Label>
            <Textarea value={settings.company_description} onChange={(e) => setSettings({ ...settings, company_description: e.target.value })} rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Contact Info - Optional */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Kontak (Opsional)</CardTitle>
              <CardDescription>
                {settings.enable_contact
                  ? "Biarkan kosong jika tidak ingin ditampilkan"
                  : "Kontak sedang dinonaktifkan dan tidak akan tampil di footer publik"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <Label htmlFor="footer-enable-contact" className="text-sm font-medium">
                Tampilkan Kontak
              </Label>
              <Switch
                id="footer-enable-contact"
                checked={settings.enable_contact}
                onCheckedChange={(checked) => setSettings({ ...settings, enable_contact: checked })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className={`space-y-4 ${settings.enable_contact ? "" : "opacity-60"}`}>
          <div className="space-y-2">
            <Label>Alamat</Label>
            <Input
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              placeholder="Alamat (opsional)"
              disabled={!settings.enable_contact}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                placeholder="Email (opsional)"
                disabled={!settings.enable_contact}
              />
            </div>
            <div className="space-y-2">
              <Label>Telepon</Label>
              <Input
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                placeholder="Telepon (opsional)"
                disabled={!settings.enable_contact}
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                value={settings.whatsapp}
                onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                placeholder="6281xxx (opsional)"
                disabled={!settings.enable_contact}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Tautan Cepat</CardTitle>
            <CardDescription>Link navigasi seperti Fitur, Harga, FAQ, dll</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={addQuickLink}><Plus className="h-4 w-4 mr-1" />Tambah</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings.quick_links.map((link) => (
            <div key={link.id} className="flex gap-2 items-center">
              <Input 
                value={link.label} 
                onChange={(e) => updateQuickLink(link.id, "label", e.target.value)} 
                placeholder="Label (cth: FAQ)" 
                className="flex-1"
              />
              <Input 
                value={link.url} 
                onChange={(e) => updateQuickLink(link.id, "url", e.target.value)} 
                placeholder="URL (cth: #faq)" 
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => removeQuickLink(link.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Legal Links with Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Legal Links</CardTitle>
            <CardDescription>Kebijakan Privasi, Syarat & Ketentuan, dll. Isi konten untuk tampil sebagai overlay.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={addLegalLink}><Plus className="h-4 w-4 mr-1" />Tambah</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.legal_links.map((link) => (
            <div key={link.id} className="space-y-2 p-4 border rounded-lg bg-muted/30">
              <div className="flex gap-2 items-center">
                <Input 
                  value={link.label} 
                  onChange={(e) => updateLegalLink(link.id, "label", e.target.value)} 
                  placeholder="Label (cth: Syarat & Ketentuan)" 
                  className="flex-1"
                />
                <Input 
                  value={link.url} 
                  onChange={(e) => updateLegalLink(link.id, "url", e.target.value)} 
                  placeholder="URL (cth: /terms atau #)" 
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => removeLegalLink(link.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Konten (HTML) - Jika diisi, akan tampil sebagai overlay saat diklik</Label>
                <RichTextEditor
                  value={link.content || ""}
                  onChange={(value) => updateLegalLink(link.id, "content", value)}
                  placeholder="Tulis konten legal di sini..."
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Pengaturan Footer
        </Button>
      </div>
    </div>
  );
}
