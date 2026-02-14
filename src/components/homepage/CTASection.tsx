import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import type { CTASettings } from "@/hooks/useHomepageData";

interface CTASectionProps {
  settings: CTASettings;
}

export function CTASection({ settings }: CTASectionProps) {
  if (!settings.show_section) return null;

  return (
    <section className="py-20 px-4">
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
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to={settings.primary_button_link}>
                <Button variant="gold" size="xl" className="group">
                  {settings.primary_button_text}
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to={settings.secondary_button_link}>
                <Button variant="hero-outline" size="xl">
                  {settings.secondary_button_text}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
