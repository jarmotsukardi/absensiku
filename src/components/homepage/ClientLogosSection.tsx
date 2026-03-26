import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ClientLogo {
  id: string;
  name: string;
  logo_url: string;
  website_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export function ClientLogosSection() {
  const [logos, setLogos] = useState<ClientLogo[]>([]);

  useEffect(() => {
    const fetchLogos = async () => {
      const { data } = await supabase
        .from("client_logos")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (data) setLogos(data);
    };
    fetchLogos();
  }, []);

  if (logos.length === 0) return null;

  return (
    <section className="py-12 px-4 bg-muted/20">
      <div className="container mx-auto">
        <h2 className="text-center text-lg font-semibold text-muted-foreground mb-8">
          Dipercaya oleh Berbagai Instansi & Perusahaan
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {logos.map((logo) => {
            const img = (
              <img
                src={logo.logo_url}
                alt={logo.name}
                className="h-10 md:h-12 object-contain grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; (e.target as HTMLImageElement).classList.remove('grayscale'); }}
              />
            );
            return logo.website_url ? (
              <a key={logo.id} href={logo.website_url} target="_blank" rel="noopener noreferrer" title={logo.name}>
                {img}
              </a>
            ) : (
              <div key={logo.id} title={logo.name}>{img}</div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
