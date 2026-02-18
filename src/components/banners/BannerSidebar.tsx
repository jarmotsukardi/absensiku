import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

interface SidebarBanner {
  id: string;
  title: string;
  link: string;
  position: string;
  imageUrl: string;
  isActive: boolean;
}

interface BannerSidebarProps {
  position?: string;
  className?: string;
}

export function BannerSidebar({ position = "homepage", className = "" }: BannerSidebarProps) {
  const [banners, setBanners] = useState<SidebarBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBanners = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "banners_sidebar")
        .maybeSingle();

      if (error) {
        console.error("Error fetching sidebar banners:", error);
        return;
      }

      console.log("Banner sidebar data:", data);

      if (data?.value) {
        const bannersData = Array.isArray(data.value) ? data.value : [];
        const filteredBanners = (bannersData as unknown as SidebarBanner[])
          .filter((b) => b && b.isActive && b.imageUrl && (b.position === position || b.position === "all"))
          .slice(0, 2); // Maksimal 2 banner yang ditampilkan
        console.log("Filtered sidebar banners (max 2):", filteredBanners);
        setBanners(filteredBanners);
      }
    } catch (error) {
      console.error("Error fetching sidebar banners:", error);
    } finally {
      setIsLoading(false);
    }
  }, [position]);

  useEffect(() => {
    void fetchBanners();
  }, [fetchBanners]);

  if (isLoading || banners.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {banners.map((banner) => (
        <Card key={banner.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
          <a
            href={banner.link || "#"}
            target={banner.link ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={banner.imageUrl}
              alt={banner.title || "Sidebar Banner"}
              className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = "1";
                  img.src = banner.imageUrl;
                } else {
                  img.src = '/placeholder.svg';
                }
              }}
            />
            {banner.title && (
              <div className="p-3 bg-card">
                <p className="font-medium text-sm text-foreground line-clamp-2">{banner.title}</p>
              </div>
            )}
          </a>
        </Card>
      ))}
    </div>
  );
}
