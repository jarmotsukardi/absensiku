import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Banner {
  id: string;
  title: string;
  link: string;
  imageUrl: string;
  isActive: boolean;
  width?: number;
  height?: number;
}

interface BannerPromoConfig {
  defaultWidth: number;
  defaultHeight: number;
  containerMaxWidth: string;
}

export function BannerPromoCarousel() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [config, setConfig] = useState<BannerPromoConfig>({ defaultWidth: 1200, defaultHeight: 400, containerMaxWidth: "100%" });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBanners();
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [banners.length]);

  const fetchBanners = async () => {
    try {
      // Fetch banners
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "banners_promo")
        .maybeSingle();

      if (error) {
        console.error("Error fetching banners:", error);
        return;
      }

      if (data?.value) {
        const bannersData = Array.isArray(data.value) ? data.value : [];
        const activeBanners = (bannersData as unknown as Banner[]).filter(
          (b) => b && b.isActive && b.imageUrl
        );
        setBanners(activeBanners);
      }

      // Fetch config
      const { data: configData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "banners_promo_config")
        .maybeSingle();

      if (configData?.value) {
        setConfig({ 
          defaultWidth: 1200, 
          defaultHeight: 400, 
          containerMaxWidth: "100%",
          ...(configData.value as Partial<BannerPromoConfig>) 
        });
      }
    } catch (error) {
      console.error("Error fetching banners:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  if (isLoading || banners.length === 0) return null;

  const currentBanner = banners[currentIndex];
  const bannerHeight = currentBanner.height || config.defaultHeight;

  return (
    <section className="py-8 px-4">
      <div className="container mx-auto" style={{ maxWidth: config.containerMaxWidth }}>
        <div className="relative rounded-2xl overflow-hidden shadow-large group">
          {/* Banner Image */}
          <a
            href={currentBanner.link || "#"}
            target={currentBanner.link ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={currentBanner.imageUrl}
              alt={currentBanner.title || "Promo Banner"}
              className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
              style={{ height: `${Math.min(bannerHeight, 500)}px` }}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = "1";
                  img.crossOrigin = null;
                  img.src = currentBanner.imageUrl;
                } else {
                  img.src = '/placeholder.svg';
                }
              }}
            />
            {currentBanner.title && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 md:p-6">
                <h3 className="text-white font-semibold text-lg md:text-xl">{currentBanner.title}</h3>
              </div>
            )}
          </a>

          {/* Navigation Arrows */}
          {banners.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.preventDefault();
                  goToPrev();
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.preventDefault();
                  goToNext();
                }}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}

          {/* Dots Indicator */}
          {banners.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentIndex ? "bg-white w-6" : "bg-white/50"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentIndex(idx);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
