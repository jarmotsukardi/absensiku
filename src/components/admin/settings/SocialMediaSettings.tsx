import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Facebook, Instagram, Youtube, Linkedin, MessageCircle, Send, Twitter, Share2 } from "lucide-react";

interface SocialMediaData {
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  social_youtube: string;
  social_linkedin: string;
  social_tiktok: string;
  social_telegram: string;
}

const defaultSettings: SocialMediaData = {
  social_facebook: "",
  social_instagram: "",
  social_twitter: "",
  social_youtube: "",
  social_linkedin: "",
  social_tiktok: "",
  social_telegram: "",
};

export function SocialMediaSettings() {
  const [settings, setSettings] = useState<SocialMediaData>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // Fetch from footer_settings
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "footer_settings")
        .maybeSingle();

      if (data?.value) {
        const footerData = data.value as Record<string, any>;
        setSettings({
          social_facebook: footerData.social_facebook || "",
          social_instagram: footerData.social_instagram || "",
          social_twitter: footerData.social_twitter || "",
          social_youtube: footerData.social_youtube || "",
          social_linkedin: footerData.social_linkedin || "",
          social_tiktok: footerData.social_tiktok || "",
          social_telegram: footerData.social_telegram || "",
        });
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
      // Update footer_settings with social media data
      const { data: existing } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "footer_settings")
        .maybeSingle();

      const footerData = (existing?.value as Record<string, any>) || {};
      const updatedFooter = { ...footerData, ...settings };

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: updatedFooter, updated_at: new Date().toISOString() })
          .eq("key", "footer_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({ key: "footer_settings", value: updatedFooter });
      }

      toast.success("Social media berhasil disimpan");
    } catch (err) {
      toast.error("Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Pengaturan Social Media
          </CardTitle>
          <CardDescription>Link social media yang akan ditampilkan di footer halaman utama</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Facebook className="h-4 w-4" />Facebook</Label>
              <Input
                value={settings.social_facebook}
                onChange={(e) => setSettings({ ...settings, social_facebook: e.target.value })}
                placeholder="https://facebook.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Instagram className="h-4 w-4" />Instagram</Label>
              <Input
                value={settings.social_instagram}
                onChange={(e) => setSettings({ ...settings, social_instagram: e.target.value })}
                placeholder="https://instagram.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Twitter className="h-4 w-4" />Twitter/X</Label>
              <Input
                value={settings.social_twitter}
                onChange={(e) => setSettings({ ...settings, social_twitter: e.target.value })}
                placeholder="https://twitter.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Youtube className="h-4 w-4" />YouTube</Label>
              <Input
                value={settings.social_youtube}
                onChange={(e) => setSettings({ ...settings, social_youtube: e.target.value })}
                placeholder="https://youtube.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Linkedin className="h-4 w-4" />LinkedIn</Label>
              <Input
                value={settings.social_linkedin}
                onChange={(e) => setSettings({ ...settings, social_linkedin: e.target.value })}
                placeholder="https://linkedin.com/company/..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><MessageCircle className="h-4 w-4" />TikTok</Label>
              <Input
                value={settings.social_tiktok}
                onChange={(e) => setSettings({ ...settings, social_tiktok: e.target.value })}
                placeholder="https://tiktok.com/@..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Send className="h-4 w-4" />Telegram</Label>
              <Input
                value={settings.social_telegram}
                onChange={(e) => setSettings({ ...settings, social_telegram: e.target.value })}
                placeholder="https://t.me/..."
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
