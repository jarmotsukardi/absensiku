import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import type { CTASettings } from "@/hooks/useHomepageData";
import { PUBLIC_CONSULTATION_PATH } from "@/lib/publicRoutes";

interface CTASectionProps {
  settings: CTASettings;
}

export function CTASection({ settings }: CTASectionProps) {
  if (!settings.show_section) return null;
  const hasSecondary = Boolean(settings.secondary_button_text?.trim() && settings.secondary_button_link?.trim());
  const primaryButtonText = settings.primary_button_text?.trim() || "Mulai Gratis";
  const primaryButtonLink = settings.primary_button_link?.trim() || "/org/login?mode=register";
  const secondaryButtonText = hasSecondary ? settings.secondary_button_text : "Lihat Jalur Solusi";
  const secondaryButtonLink = hasSecondary ? settings.secondary_button_link : "/#solusi";

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto">
        <Card className="bg-gradient-to-br from-primary to-primary/80 border-0 overflow-hidden relative">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent rounded-full blur-3xl" />
          </div>
          <CardContent className="p-12 text-center relative">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">{settings.title}</h2>
            <p className="text-primary-foreground/70 mb-8 max-w-xl mx-auto">
              {settings.description}
            </p>
            <p className="text-sm text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
              Mulai dari absensi untuk operasional harian. Jika nanti organisasi Anda membutuhkan HR atau Payroll, tahap lanjutannya bisa dibahas terpisah sesuai kesiapan.
            </p>
            <div className="flex flex-col items-center gap-3">
              <div className="grid w-full max-w-[34rem] gap-3 sm:grid-cols-2">
                <Link to={primaryButtonLink} className="w-full">
                  <Button variant="gold" size="xl" className="group w-full justify-center">
                    {primaryButtonText}
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                {secondaryButtonText && secondaryButtonLink && (
                  <Link to={secondaryButtonLink} className="w-full">
                    <Button
                      variant="outline"
                      size="xl"
                      className="w-full justify-center border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground hover:bg-primary-foreground/10"
                    >
                      {secondaryButtonText}
                    </Button>
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
                <Link
                  to={PUBLIC_CONSULTATION_PATH}
                  className="font-medium text-white/90 underline decoration-white/60 underline-offset-4 transition-colors hover:text-white"
                >
                  Butuh konsultasi implementasi lanjutan?
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
