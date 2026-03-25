import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Megaphone, Save, Trash2, Plus, Image, Loader2, ChevronDown, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useSystemSettings } from "@/hooks/useSystemSettings";

interface Banner {
  id: string;
  title: string;
  link: string;
  imageUrl: string;
  isActive: boolean;
  width?: number;
  height?: number;
}

interface BannerPromoGlobalSettings {
  defaultWidth: number;
  defaultHeight: number;
  containerMaxWidth: string;
}

const defaultGlobalSettings: BannerPromoGlobalSettings = {
  defaultWidth: 1200,
  defaultHeight: 400,
  containerMaxWidth: "100%",
};

export function BannerPromoSettings() {
  const { setting, isLoading, isSaving, saveSetting } = useSystemSettings("banners_promo");
  const { setting: globalSetting, saveSetting: saveGlobalSetting } = useSystemSettings("banners_promo_config");
  const [banners, setBanners] = useState<Banner[]>([]);
  const [globalSettings, setGlobalSettings] = useState<BannerPromoGlobalSettings>(defaultGlobalSettings);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (setting && Array.isArray(setting)) {
      setBanners(setting);
    }
  }, [setting]);

  useEffect(() => {
    if (globalSetting && typeof globalSetting === 'object') {
      setGlobalSettings({ ...defaultGlobalSettings, ...globalSetting as Partial<BannerPromoGlobalSettings> });
    }
  }, [globalSetting]);

  const addBanner = () => {
    const newId = Date.now().toString();
    setBanners([
      ...banners,
      { 
        id: newId, 
        title: "", 
        link: "", 
        imageUrl: "", 
        isActive: false,
        width: globalSettings.defaultWidth,
        height: globalSettings.defaultHeight,
      },
    ]);
    setOpenItems(prev => ({ ...prev, [newId]: true }));
  };

  const updateBanner = (id: string, field: keyof Banner, value: string | boolean | number) => {
    setBanners(banners.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const removeBanner = (id: string) => {
    setBanners(banners.filter((b) => b.id !== id));
  };




  const toggleOpen = (id: string) => {
    setOpenItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async () => {
    await saveSetting("banners_promo", banners, "Banner Promo Halaman Utama");
    await saveGlobalSetting("banners_promo_config", globalSettings, "Konfigurasi Banner Promo");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeBanners = banners.filter(b => b.isActive && b.imageUrl);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          Banner Promo Carousel
        </h3>
        <p className="text-sm text-muted-foreground">
          Kelola banner promosi carousel di halaman utama ({activeBanners.length} aktif)
        </p>
      </div>

      {/* Global Size Settings */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Pengaturan Ukuran Bawaan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Lebar Bawaan (px)</Label>
              <Input
                type="number"
                value={globalSettings.defaultWidth}
                onChange={(e) => setGlobalSettings({ ...globalSettings, defaultWidth: parseInt(e.target.value) || 1200 })}
                placeholder="1200"
                min={200}
                max={2000}
              />
            </div>
            <div className="space-y-2">
              <Label>Tinggi Bawaan (px)</Label>
              <Input
                type="number"
                value={globalSettings.defaultHeight}
                onChange={(e) => setGlobalSettings({ ...globalSettings, defaultHeight: parseInt(e.target.value) || 400 })}
                placeholder="400"
                min={100}
                max={800}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Width Container</Label>
              <Input
                value={globalSettings.containerMaxWidth}
                onChange={(e) => setGlobalSettings({ ...globalSettings, containerMaxWidth: e.target.value })}
                placeholder="100% atau 1200px"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Rasio aspek: {(globalSettings.defaultWidth / globalSettings.defaultHeight).toFixed(2)}:1 
            ({Math.round(globalSettings.defaultWidth / globalSettings.defaultHeight * 100) / 100 > 2.5 ? 'Ultra Wide' : 'Standard'})
          </p>
        </CardContent>
      </Card>

      {/* Banner List */}
      <div className="space-y-3">
        {banners.map((banner, index) => (
          <Collapsible 
            key={banner.id} 
            open={openItems[banner.id]} 
            onOpenChange={() => toggleOpen(banner.id)}
          >
            <Card className={!banner.isActive ? "opacity-70" : ""}>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-20 rounded bg-muted overflow-hidden flex-shrink-0">
                        {banner.imageUrl ? (
                          <img src={banner.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Image className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {banner.title || `Banner #${index + 1}`}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {banner.width || globalSettings.defaultWidth}×{banner.height || globalSettings.defaultHeight}px
                          {banner.isActive && banner.imageUrl ? " • Aktif" : " • Nonaktif"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={banner.isActive}
                        onCheckedChange={(checked) => updateBanner(banner.id, "isActive", checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <ChevronDown className={`h-4 w-4 transition-transform ${openItems[banner.id] ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4 border-t">
                  {/* Image URL */}
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center gap-4">
                      <div className="h-24 w-40 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-dashed">
                        {banner.imageUrl ? (
                          <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                        ) : (
                          <Image className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>URL Gambar Banner</Label>
                        <Input
                          value={banner.imageUrl}
                          onChange={(e) => updateBanner(banner.id, "imageUrl", e.target.value)}
                          placeholder="https://example.com/banner.jpg"
                        />
                        <p className="text-xs text-muted-foreground">Gunakan URL gambar dari hosting (Imgur, Google Drive, dll)</p>
                      </div>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Judul Banner</Label>
                      <Input
                        value={banner.title}
                        onChange={(e) => updateBanner(banner.id, "title", e.target.value)}
                        placeholder="Judul promo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Link Tujuan</Label>
                      <Input
                        value={banner.link}
                        onChange={(e) => updateBanner(banner.id, "link", e.target.value)}
                        placeholder="/promo/detail atau https://..."
                      />
                    </div>
                  </div>

                  {/* Custom Size per Banner */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Lebar (px) - Opsional</Label>
                      <Input
                        type="number"
                        value={banner.width || ""}
                        onChange={(e) => updateBanner(banner.id, "width", parseInt(e.target.value) || 0)}
                        placeholder={`Bawaan: ${globalSettings.defaultWidth}`}
                        min={200}
                        max={2000}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Tinggi (px) - Opsional</Label>
                      <Input
                        type="number"
                        value={banner.height || ""}
                        onChange={(e) => updateBanner(banner.id, "height", parseInt(e.target.value) || 0)}
                        placeholder={`Bawaan: ${globalSettings.defaultHeight}`}
                        min={100}
                        max={800}
                      />
                    </div>
                  </div>

                  {/* Delete Button */}
                  <div className="flex justify-end pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeBanner(banner.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Hapus Banner
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}

        <Button variant="outline" className="w-full" onClick={addBanner}>
          <Plus className="h-4 w-4 mr-2" />
          Tambah Banner Baru
        </Button>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Simpan Perubahan
        </Button>
      </div>
    </div>
  );
}
