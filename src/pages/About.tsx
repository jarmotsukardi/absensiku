import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { FooterSection } from "@/components/homepage/FooterSection";
import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import type { FooterSettings } from "@/hooks/useHomepageData";

const defaultFooterSettings: FooterSettings = {
  company_name: "AbsensiKu",
  company_description: "Sistem absensi GPS modern untuk pemerintah dan perusahaan.",
  copyright_text: "© 2024 AbsensiKu. Hak cipta dilindungi.",
  address: "",
  email: "",
  phone: "",
  whatsapp: "",
  quick_links: [],
  legal_links: [],
  social_facebook: "",
  social_instagram: "",
  social_twitter: "",
  social_youtube: "",
};

const About = () => {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch about page content
      const { data: aboutData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "about_page_content")
        .maybeSingle();

      if (aboutData?.value && typeof aboutData.value === "object" && "content" in aboutData.value) {
        setContent((aboutData.value as { content: string }).content || "");
      }

      // Fetch footer settings
      const { data: footerData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "footer_settings")
        .maybeSingle();

      if (footerData?.value) {
        setFooterSettings({ ...defaultFooterSettings, ...(footerData.value as Partial<FooterSettings>) });
      }
    } catch (error) {
      console.error("Error fetching about page:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />

      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-4xl font-bold text-foreground mb-8">Tentang Kami</h1>
          
          {content ? (
            <div 
              className="prose prose-lg dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(content, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
                  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height', 'style'],
                }) 
              }} 
            />
          ) : (
            <div className="text-center py-16">
              <h2 className="text-2xl font-semibold text-foreground mb-4">AbsensiKu</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
                AbsensiKu adalah platform absensi digital berbasis GPS yang dirancang khusus untuk 
                membantu instansi pemerintah, perusahaan, dan organisasi dalam mengelola kehadiran 
                pegawai dengan akurat dan efisien.
              </p>
              <div className="grid md:grid-cols-3 gap-8 mt-12">
                <div className="p-6 bg-card rounded-lg border">
                  <h3 className="text-xl font-semibold mb-3">Visi</h3>
                  <p className="text-muted-foreground">
                    Menjadi platform absensi digital terpercaya nomor satu di Indonesia.
                  </p>
                </div>
                <div className="p-6 bg-card rounded-lg border">
                  <h3 className="text-xl font-semibold mb-3">Misi</h3>
                  <p className="text-muted-foreground">
                    Menyediakan solusi teknologi yang memudahkan pengelolaan kehadiran pegawai.
                  </p>
                </div>
                <div className="p-6 bg-card rounded-lg border">
                  <h3 className="text-xl font-semibold mb-3">Nilai</h3>
                  <p className="text-muted-foreground">
                    Integritas, inovasi, dan kepuasan pelanggan adalah prioritas utama kami.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <FooterSection settings={footerSettings} />
      <FloatingWhatsApp />
    </div>
  );
};

export default About;
