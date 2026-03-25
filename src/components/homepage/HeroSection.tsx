import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Star } from "lucide-react";
import type { HeroSettings, StatisticsSettings } from "@/hooks/useHomepageData";
import { PUBLIC_CONSULTATION_PATH } from "@/lib/publicRoutes";

interface HeroSectionProps {
  heroSettings: HeroSettings;
  statisticsSettings: StatisticsSettings;
  showStats: boolean;
}

export function HeroSection({ heroSettings, statisticsSettings, showStats }: HeroSectionProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + "K+";
    }
    return num.toString() + "+";
  };

  return (
    <section className="hero-gradient pt-32 pb-20 md:pb-24 px-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto relative">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 mb-6 animate-fade-in">
            <Star className="w-4 h-4 text-accent" />
            <span className="text-primary-foreground/80 text-sm">Platform Absensi #1 untuk Pemerintah & Swasta</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-6 leading-tight animate-slide-in-up">
            {heroSettings.title}
            <span className="text-gradient block">{heroSettings.subtitle}</span>
          </h1>

          <p className="text-lg md:text-xl text-primary-foreground/75 mb-10 max-w-2xl mx-auto animate-slide-in-up stagger-1">
            {heroSettings.description}
          </p>

          <div className="flex flex-col items-center gap-4 animate-slide-in-up stagger-2">
            <div className="grid w-full max-w-[34rem] gap-3 sm:grid-cols-2">
              <Link to={heroSettings.cta_link} className="w-full">
                <Button variant="gold" size="xl" className="group w-full justify-center">
                  {heroSettings.cta_text}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to={heroSettings.secondary_cta_link?.trim() || "/#solusi"} className="w-full">
                <Button
                  variant="outline"
                  size="xl"
                  className="w-full justify-center border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  {heroSettings.secondary_cta_text?.trim() || "Lihat Jalur Solusi"}
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
              <Link
                to={PUBLIC_CONSULTATION_PATH}
                className="font-medium text-white/90 underline decoration-white/60 underline-offset-4 transition-colors hover:text-white"
              >
                Butuh konsultasi implementasi lanjutan?
              </Link>
            </div>
            <p className="text-xs md:text-sm text-primary-foreground/75 max-w-xl">
              Bebas digunakan langsung sampai instansi Anda siap berlangganan.
            </p>
            <p className="text-xs md:text-sm text-primary-foreground/70 max-w-2xl">
              Tetap mulai dari absensi. Jika nanti organisasi membutuhkan proses SDM atau penggajian yang lebih rapi, jalur lanjutannya bisa dikonsultasikan tanpa pindah ekosistem.
            </p>
          </div>

          {/* Stats */}
          {showStats && heroSettings.show_statistics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 pt-8 border-t border-primary-foreground/10 animate-slide-in-up stagger-3">
              {statisticsSettings.show_active_institutions && (
                <div>
                  <div className="text-2xl md:text-3xl font-bold text-gradient">
                    {formatNumber(statisticsSettings.institutions_count)}
                  </div>
                  <div className="text-primary-foreground/60 text-sm">Instansi Aktif</div>
                </div>
              )}
              {statisticsSettings.show_employees && (
                <div>
                  <div className="text-2xl md:text-3xl font-bold text-gradient">
                    {formatNumber(statisticsSettings.employees_count)}
                  </div>
                  <div className="text-primary-foreground/60 text-sm">Pegawai</div>
                </div>
              )}
              {statisticsSettings.show_provinces && (
                <div>
                  <div className="text-2xl md:text-3xl font-bold text-gradient">
                    {statisticsSettings.provinces_count}
                  </div>
                  <div className="text-primary-foreground/60 text-sm">Provinsi</div>
                </div>
              )}
              {statisticsSettings.show_uptime && (
                <div>
                  <div className="text-2xl md:text-3xl font-bold text-gradient">
                    {statisticsSettings.uptime_percent}%
                  </div>
                  <div className="text-primary-foreground/60 text-sm">Uptime</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
