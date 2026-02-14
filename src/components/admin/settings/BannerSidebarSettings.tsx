import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  PanelRight, Save, Trash2, Plus, Image, Loader2, 
  Eye, EyeOff, AlertTriangle, CheckCircle2,
  ExternalLink, ArrowUp, ArrowDown
} from "lucide-react";
import { toast } from "sonner";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { cn } from "@/lib/utils";

interface SidebarBanner {
  id: string;
  title: string;
  link: string;
  position: string;
  imageUrl: string;
  isActive: boolean;
}

const MAX_VISIBLE_BANNERS = 2;

const positionOptions = [
  { value: "homepage", label: "Homepage" },
  { value: "dashboard", label: "Dashboard" },
  { value: "all", label: "Semua Halaman" },
];

export function BannerSidebarSettings() {
  const { setting, isLoading, isSaving, saveSetting } = useSystemSettings("banners_sidebar");
  const [banners, setBanners] = useState<SidebarBanner[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (setting && Array.isArray(setting)) {
      setBanners(setting);
    }
  }, [setting]);

  const activeBanners = banners.filter(b => b.isActive && b.imageUrl);
  const visibleCount = Math.min(activeBanners.length, MAX_VISIBLE_BANNERS);
  const hiddenCount = Math.max(0, activeBanners.length - MAX_VISIBLE_BANNERS);

  const addBanner = () => {
    const newBanner = { 
      id: Date.now().toString(), 
      title: "", 
      link: "", 
      position: "homepage", 
      imageUrl: "", 
      isActive: false 
    };
    setBanners([...banners, newBanner]);
    setExpandedId(newBanner.id);
  };

  const updateBanner = (id: string, field: keyof SidebarBanner, value: string | boolean) => {
    setBanners(banners.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const removeBanner = (id: string) => {
    setBanners(banners.filter((b) => b.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const moveBanner = (index: number, direction: "up" | "down") => {
    const newBanners = [...banners];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= banners.length) return;
    [newBanners[index], newBanners[targetIndex]] = [newBanners[targetIndex], newBanners[index]];
    setBanners(newBanners);
  };



  const handleSave = async () => {
    await saveSetting("banners_sidebar", banners, "Banner Sidebar Dashboard");
  };

  const getBannerVisibility = (banner: SidebarBanner, index: number): "visible" | "hidden" | "inactive" => {
    if (!banner.isActive || !banner.imageUrl) return "inactive";
    const activeIndex = activeBanners.findIndex(b => b.id === banner.id);
    return activeIndex < MAX_VISIBLE_BANNERS ? "visible" : "hidden";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <PanelRight className="h-5 w-5 text-primary" />
            Banner Sidebar
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola banner yang muncul di sidebar. Maksimal {MAX_VISIBLE_BANNERS} banner yang ditampilkan.
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="shrink-0">
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Simpan Perubahan
        </Button>
      </div>

      {/* Status Summary */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Eye className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{visibleCount} Ditampilkan</p>
                <p className="text-xs text-muted-foreground">dari maksimal {MAX_VISIBLE_BANNERS}</p>
              </div>
            </div>
            {hiddenCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <EyeOff className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-600">{hiddenCount} Tersembunyi</p>
                  <p className="text-xs text-muted-foreground">melebihi batas</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <PanelRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{banners.length} Total</p>
                <p className="text-xs text-muted-foreground">banner dibuat</p>
              </div>
            </div>
          </div>
          {hiddenCount > 0 && (
            <div className="mt-3 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-xs text-yellow-700 flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" />
                Urutkan banner untuk mengatur prioritas tampil. Banner dengan urutan 1-{MAX_VISIBLE_BANNERS} akan ditampilkan.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Banner List */}
      <div className="space-y-3">
        {banners.map((banner, index) => {
          const visibility = getBannerVisibility(banner, index);
          const isExpanded = expandedId === banner.id;
          
          return (
            <Card 
              key={banner.id}
              className={cn(
                "transition-all duration-200",
                visibility === "visible" && "border-primary/50 shadow-sm",
                visibility === "hidden" && "border-yellow-500/50 opacity-75",
                visibility === "inactive" && "opacity-60"
              )}
            >
              <CardHeader className="p-4 pb-0">
                <div className="flex items-center gap-3">
                  {/* Reorder Controls */}
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveBanner(index, "up")}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveBanner(index, "down")}
                      disabled={index === banners.length - 1}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Thumbnail */}
                  <div 
                    className={cn(
                      "h-14 w-20 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden border",
                      visibility === "visible" && "border-primary/30"
                    )}
                  >
                    {banner.imageUrl ? (
                      <img 
                        src={banner.imageUrl} 
                        alt={banner.title || "Banner"} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                      />
                    ) : (
                      <Image className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                      {visibility === "visible" && (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Tampil
                        </Badge>
                      )}
                      {visibility === "hidden" && (
                        <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-xs">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Tersembunyi
                        </Badge>
                      )}
                      {visibility === "inactive" && (
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                          Nonaktif
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm truncate mt-0.5">
                      {banner.title || "Banner tanpa judul"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {positionOptions.find(p => p.value === banner.position)?.label || banner.position}
                    </p>
                  </div>

                  {/* Quick Toggle & Actions */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={banner.isActive}
                      onCheckedChange={(checked) => updateBanner(banner.id, "isActive", checked)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : banner.id)}
                    >
                      {isExpanded ? "Tutup" : "Edit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeBanner(banner.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Expanded Edit Form */}
              {isExpanded && (
                <CardContent className="p-4 pt-4 space-y-4 border-t mt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Judul Banner</Label>
                      <Input
                        value={banner.title}
                        onChange={(e) => updateBanner(banner.id, "title", e.target.value)}
                        placeholder="Judul banner"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Link Tujuan</Label>
                      <div className="relative">
                        <Input
                          value={banner.link}
                          onChange={(e) => updateBanner(banner.id, "link", e.target.value)}
                          placeholder="https://..."
                          className="pr-8"
                        />
                        {banner.link && (
                          <a 
                            href={banner.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Posisi Tampil</Label>
                      <Select 
                        value={banner.position} 
                        onValueChange={(val) => updateBanner(banner.id, "position", val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {positionOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>URL Gambar Banner</Label>
                      <Input
                        value={banner.imageUrl}
                        onChange={(e) => updateBanner(banner.id, "imageUrl", e.target.value)}
                        placeholder="https://example.com/sidebar-banner.jpg"
                      />
                      <p className="text-xs text-muted-foreground">Gunakan URL gambar dari hosting (Imgur, Google Drive, dll)</p>
                    </div>
                  </div>

                  {/* Preview */}
                  {banner.imageUrl && (
                    <div className="space-y-2">
                      <Label>Preview</Label>
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="max-w-[200px] mx-auto">
                          <img 
                            src={banner.imageUrl} 
                            alt={banner.title || "Preview"} 
                            className="w-full h-auto rounded-md shadow-sm"
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                          />
                          {banner.title && (
                            <p className="text-sm font-medium mt-2 text-center">{banner.title}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add Banner Button */}
      <Button variant="outline" className="w-full" onClick={addBanner}>
        <Plus className="h-4 w-4 mr-2" />
        Tambah Banner Sidebar
      </Button>

      {/* Tips */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Tips:</strong> Gunakan tombol panah untuk mengatur urutan banner. 
            Hanya {MAX_VISIBLE_BANNERS} banner pertama yang aktif akan ditampilkan di sidebar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
