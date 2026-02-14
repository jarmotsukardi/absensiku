import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import DOMPurify from "dompurify";
import {
  MapPin,
  Download,
  Users,
  Building2,
  Clock,
  Shield,
  Smartphone,
  ArrowRight,
  Newspaper,
  Calendar,
  X,
} from "lucide-react";



interface OrganizationData {
  id: string;
  name: string;
  code: string;
  description: string | null;
  logo_url: string | null;
  landing_description: string | null;
  landing_hero_image: string | null;
  apk_url: string | null;
  organization_type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface NewsItem {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

export default function OrganizationLanding() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ employees: 0, offices: 0 });
  const [news, setNews] = useState<NewsItem[]>([]);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  useEffect(() => {
    if (code) {
      fetchOrganization();
    }
  }, [code]);

  const fetchOrganization = async () => {
    try {
      // Build query - if preview mode, skip landing_enabled check
      let query = supabase
        .from("tenants")
        .select("*")
        .eq("code", code?.toUpperCase())
        .eq("is_active", true);
      
      // Only check landing_enabled if not in preview mode
      if (!isPreview) {
        query = query.eq("landing_enabled", true);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      setOrganization(data);

      if (data) {
        // Fetch stats and news in parallel
        const [empRes, offRes, newsRes] = await Promise.all([
          supabase.from("employees").select("id", { count: "exact" }).eq("tenant_id", data.id).eq("is_active", true),
          supabase.from("offices").select("id", { count: "exact" }).eq("tenant_id", data.id).eq("is_active", true),
          supabase
            .from("news")
            .select("id, title, content, image_url, created_at")
            .eq("tenant_id", data.id)
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(6),
        ]);
        setStats({
          employees: empRes.count || 0,
          offices: offRes.count || 0,
        });
        setNews(newsRes.data || []);
      }
    } catch (error) {
      console.error("Error fetching organization:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  };

  const getOrgTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      pemerintah_daerah: "Pemerintah Daerah",
      instansi_pemerintah: "Instansi Pemerintah",
      perusahaan: "Perusahaan",
      sekolah: "Lembaga Pendidikan",
    };
    return types[type] || type;
  };

  const features = [
    {
      icon: MapPin,
      title: "Absensi Berbasis GPS",
      description: "Validasi lokasi real-time untuk memastikan kehadiran di lokasi kerja",
    },
    {
      icon: Clock,
      title: "Tracking Waktu Akurat",
      description: "Pencatatan jam masuk dan pulang dengan presisi tinggi",
    },
    {
      icon: Shield,
      title: "Keamanan Terjamin",
      description: "Data terenkripsi dan dilindungi dengan standar keamanan tinggi",
    },
    {
      icon: Smartphone,
      title: "Akses Mobile",
      description: "Aplikasi mobile untuk kemudahan absensi dari smartphone",
    },
  ];

  // Generate QR Code URL (using a free QR API)
  const qrCodeUrl = organization?.apk_url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(organization.apk_url)}`
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="hero-gradient h-96">
          <div className="container mx-auto px-4 pt-20">
            <Skeleton className="h-8 w-48 bg-white/20" />
            <Skeleton className="h-12 w-96 mt-4 bg-white/20" />
          </div>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold mb-2">Organisasi Tidak Ditemukan</h1>
            <p className="text-muted-foreground mb-6">
              Halaman landing untuk organisasi ini tidak tersedia atau belum diaktifkan.
            </p>
            <Link to="/">
              <Button>Kembali ke Beranda</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Hero Image */}
      <section className="relative overflow-hidden min-h-[70vh]">
        {/* Hero Image Background */}
        {organization.landing_hero_image ? (
          <div className="absolute inset-0">
            <img 
              src={organization.landing_hero_image} 
              alt={organization.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 hero-gradient">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-96 h-96 bg-accent rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-foreground rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
            </div>
          </div>
        )}

        <div className="container mx-auto px-4 py-16 lg:py-24 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <Badge className="mb-4 bg-accent/20 text-accent border-accent/30 backdrop-blur-sm">
                {getOrgTypeLabel(organization.organization_type)}
              </Badge>
              
              <div className="flex items-center justify-center lg:justify-start gap-4 mb-6">
                {organization.logo_url ? (
                  <img
                    src={organization.logo_url}
                    alt={organization.name}
                    className="w-16 h-16 rounded-xl object-contain bg-white/10 p-2"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center">
                    <Building2 className="w-8 h-8 text-primary" />
                  </div>
                )}
                <div>
                  <h1 className="text-3xl lg:text-4xl font-bold text-primary-foreground">
                    {organization.name}
                  </h1>
                  <p className="text-primary-foreground/70">{organization.code}</p>
                </div>
              </div>

              <p className="text-lg text-primary-foreground/80 mb-8 max-w-xl mx-auto lg:mx-0">
                {organization.landing_description || organization.description || 
                  "Sistem Absensi Digital berbasis GPS untuk pengelolaan kehadiran yang efisien dan transparan."}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link to="/employee/login">
                  <Button size="lg" className="btn-gold w-full sm:w-auto">
                    Masuk Absensi
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                {organization.apk_url && (
                  <a href={organization.apk_url} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" variant="outline" className="bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20 w-full sm:w-auto">
                      <Download className="w-5 h-5 mr-2" />
                      Download APK
                    </Button>
                  </a>
                )}
              </div>
            </div>

            {/* Stats & QR Code */}
            <div className="flex-shrink-0">
              <Card className="glass border-white/20 text-primary-foreground bg-white/5 backdrop-blur-xl">
                <CardContent className="p-6">
                  {qrCodeUrl && (
                    <div className="mb-6 text-center">
                      <p className="text-sm text-primary-foreground/70 mb-2">Scan untuk Download</p>
                      <div className="w-48 h-48 mx-auto bg-white rounded-xl p-2">
                        <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-4 rounded-lg bg-white/10">
                      <Users className="w-6 h-6 mx-auto mb-2 text-accent" />
                      <p className="text-2xl font-bold">{stats.employees}</p>
                      <p className="text-xs text-primary-foreground/60">Pegawai</p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/10">
                      <MapPin className="w-6 h-6 mx-auto mb-2 text-accent" />
                      <p className="text-2xl font-bold">{stats.offices}</p>
                      <p className="text-xs text-primary-foreground/60">Lokasi</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl lg:text-3xl font-bold mb-4">Fitur Unggulan</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Sistem absensi modern dengan teknologi terkini untuk mendukung produktivitas organisasi
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="card-hover border-border/50">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* News Section */}
      {news.length > 0 && (
        <section className="py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Newspaper className="w-6 h-6 text-primary" />
                <h2 className="text-2xl lg:text-3xl font-bold">Pengumuman</h2>
              </div>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Informasi dan pengumuman terkini dari {organization.name}
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((item) => (
                <div key={item.id} onClick={() => setSelectedNews(item)} className="cursor-pointer">
                  <Card className="card-hover h-full overflow-hidden group">
                    {item.image_url && (
                      <div className="aspect-video overflow-hidden">
                        <img src={item.image_url} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      </div>
                    )}
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(item.created_at), "dd MMMM yyyy", { locale: localeId })}
                      </div>
                      <h3 className="font-semibold mb-2 line-clamp-2 group-hover:text-primary transition-colors">{item.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-3">{stripHtml(item.content)}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>

            {/* News Detail Overlay */}
            <Dialog open={!!selectedNews} onOpenChange={() => setSelectedNews(null)}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{selectedNews?.title}</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    {selectedNews && format(new Date(selectedNews.created_at), "dd MMMM yyyy", { locale: localeId })}
                  </p>
                </DialogHeader>
                {selectedNews?.image_url && (
                  <img src={selectedNews.image_url} alt={selectedNews.title} className="w-full rounded-lg" />
                )}
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedNews?.content || "") }} />
              </DialogContent>
            </Dialog>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <Card className="hero-gradient text-primary-foreground overflow-hidden">
            <CardContent className="p-8 lg:p-12 relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
              
              <div className="relative z-10 text-center max-w-2xl mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-6">
                  <Smartphone className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold mb-4">
                  Download Aplikasi AbsensiKu
                </h2>
                <p className="text-primary-foreground/80 mb-8">
                  Dapatkan kemudahan absensi langsung dari smartphone Anda. 
                  Tersedia untuk perangkat Android.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {organization.apk_url ? (
                    <a href={organization.apk_url} target="_blank" rel="noopener noreferrer">
                      <Button size="lg" className="btn-gold">
                        <Download className="w-5 h-5 mr-2" />
                        Download APK Android
                      </Button>
                    </a>
                  ) : (
                    <Button size="lg" className="btn-gold" disabled>
                      <Download className="w-5 h-5 mr-2" />
                      APK Belum Tersedia
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">AbsensiKu</span>
            </div>
            
            <p className="text-sm text-muted-foreground text-center">
              © 2026 {organization.name}. Powered by AbsensiKu.
            </p>

            <div className="flex items-center gap-4">
              {organization.email && (
                <a href={`mailto:${organization.email}`} className="text-sm text-muted-foreground hover:text-foreground">
                  {organization.email}
                </a>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
