import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import type { PricingPlan } from "@/hooks/useHomepageData";

interface PricingSectionProps {
  plans: PricingPlan[];
  title?: string;
  subtitle?: string;
}

const defaultPlans: PricingPlan[] = [
  {
    id: "1", name: "Akses", price: 0, period: "", description: "Coba fitur lengkap untuk tim kecil",
    features: ["Maksimal 5 - 50 pegawai", "Semua fitur absensi GPS", "Laporan dasar", "Audit trail", "Dukungan email"],
    is_popular: false, max_employees: 50,
  },
  {
    id: "2", name: "Profesional", price: 3500, period: "/pegawai/bulan", description: "Untuk instansi dan perusahaan",
    features: ["Pegawai tidak terbatas", "Multi OPD & kantor", "Laporan lengkap", "Audit trail lengkap", "Alur persetujuan multi-level", "Dukungan prioritas", "API akses"],
    is_popular: true, max_employees: 0,
  },
  {
    id: "3", name: "Enterprise", price: 0, period: "", description: "Solusi custom untuk kebutuhan khusus",
    features: ["Semua fitur Profesional", "On-premise deployment", "Integrasi custom", "SLA khusus", "Account manager dedicated", "Training & onboarding"],
    is_popular: false, max_employees: 0,
  },
];

export function PricingSection({ plans, title = "Harga Transparan", subtitle = "Pilih paket yang sesuai dengan kebutuhan instansi Anda." }: PricingSectionProps) {
  const displayPlans = plans.length > 0 ? plans : defaultPlans;

  const formatPrice = (price: number) => {
    if (price === 0) return "Gratis";
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);
  };

  return (
    <section id="harga" className="py-12 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">{title}</h2>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {displayPlans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                plan.is_popular ? "border-2 border-accent shadow-lg scale-[1.02]" : "border-border/50 hover:shadow-md"
              }`}
            >
              {plan.is_popular && (
                <Badge className="absolute top-2 right-2 bg-accent text-accent-foreground">Populer</Badge>
              )}
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <div className="mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {plan.price === 0 && plan.name === "Enterprise" ? "Custom" : formatPrice(plan.price)}
                  </span>
                  <span className="text-muted-foreground text-xs">{plan.period}</span>
                </div>
                <CardDescription className="text-xs mt-1">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <ul className="space-y-1.5">
                  {plan.features.slice(0, 5).map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                  {plan.features.length > 5 && (
                    <li className="text-xs text-muted-foreground pl-5">+{plan.features.length - 5} fitur lainnya</li>
                  )}
                </ul>
                <Link to="/org/login?mode=register" className="block">
                  <Button variant={plan.is_popular ? "gold" : "outline"} className="w-full" size="sm">
                    {plan.price === 0 && plan.name === "Enterprise" ? "Hubungi Sales" : plan.price === 0 ? "Mulai Gratis" : "Berlangganan"}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
