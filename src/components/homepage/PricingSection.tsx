import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, BadgePercent, CheckCircle2 } from "lucide-react";
import type { PricingPlan } from "@/hooks/useHomepageData";
import { PUBLIC_CONSULTATION_PATH } from "@/lib/publicRoutes";

interface PricingSectionProps {
  plans: PricingPlan[];
  title?: string;
  subtitle?: string;
  negotiationThreshold?: number;
}

const defaultPlans: PricingPlan[] = [
  {
    id: "1",
    name: "Bulanan",
    price: 7500,
    original_price: null,
    discount_percentage: 0,
    duration_months: 1,
    total_price: 7500,
    total_price_before_discount: null,
    period: "/pegawai/bulan",
    description: "Paket Absensi untuk mulai cepat tanpa komitmen durasi panjang.",
    features: [
      "Tagihan per bulan",
      "Semua fitur absensi inti",
      "Laporan operasional",
      "Dukungan email",
    ],
    is_popular: false,
    popular_label: null,
  },
  {
    id: "2",
    name: "Triwulan",
    price: 7500,
    original_price: null,
    discount_percentage: 0,
    duration_months: 3,
    total_price: 22500,
    total_price_before_discount: null,
    period: "/pegawai/bulan",
    description: "Paket Absensi untuk rollout singkat 3 bulan.",
    features: [
      "Durasi 3 bulan",
      "Monitoring dashboard lengkap",
      "Dukungan prioritas",
    ],
    is_popular: false,
    popular_label: null,
  },
  {
    id: "3",
    name: "Tahunan",
    price: 6900,
    original_price: 7500,
    discount_percentage: 8,
    duration_months: 12,
    total_price: 82800,
    total_price_before_discount: 90000,
    period: "/pegawai/bulan",
    description: "Harga Absensi paling hemat untuk organisasi dengan kebutuhan berkelanjutan.",
    features: [
      "Durasi 12 bulan",
      "Harga termurah per pegawai",
      "Prioritas implementasi",
      "Pendampingan adopsi",
    ],
    is_popular: true,
    popular_label: "Termurah • Paling Populer",
  },
];

const formatPrice = (price: number) => {
  if (price <= 0) return "Gratis";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

const resolveTotalPrice = (plan: PricingPlan): number => {
  if (typeof plan.total_price === "number") return plan.total_price;
  const duration = Math.max(1, Math.floor(plan.duration_months || 1));
  return Math.max(0, Math.round(plan.price * duration));
};

const getPlansGridClass = (planCount: number): string => {
  if (planCount >= 4) return "md:grid-cols-2 xl:grid-cols-4";
  if (planCount === 3) return "md:grid-cols-3";
  if (planCount === 2) return "md:grid-cols-2";
  return "md:grid-cols-1";
};

const getPlansContainerMaxWidth = (planCount: number): string => {
  if (planCount >= 4) return "max-w-6xl";
  if (planCount === 3) return "max-w-5xl";
  if (planCount === 2) return "max-w-3xl";
  return "max-w-xl";
};

export function PricingSection({
  plans,
  title = "Harga Transparan",
  subtitle = "Harga publik saat ini difokuskan untuk paket Absensi. Modul HR dan Payroll disiapkan sebagai tahap lanjutan.",
  negotiationThreshold = 2000,
}: PricingSectionProps) {
  const displayPlans = plans.length > 0 ? plans : defaultPlans;
  const onboardingCampaignNote =
    displayPlans.find((plan) => typeof plan.campaign_note === "string" && plan.campaign_note.trim().length > 0)
      ?.campaign_note?.trim() || null;
  const thresholdValue = Math.max(1, Math.floor(Number(negotiationThreshold) || 2000));
  const plansGridClass = getPlansGridClass(displayPlans.length);
  const plansContainerClass = getPlansContainerMaxWidth(displayPlans.length);

  return (
    <section id="harga" className="py-12 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">{title}</h2>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
          <p className="text-xs text-primary font-medium mt-2">
            Gunakan langsung sekarang, mulai berlangganan saat instansi sudah siap.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Harga yang dipublikasi di halaman ini khusus untuk layanan Absensi. Aktivasi HR dan Payroll dibahas terpisah sesuai kesiapan organisasi.
          </p>
          {onboardingCampaignNote ? (
            <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Catatan onboarding Absensi
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{onboardingCampaignNote}</p>
            </div>
          ) : null}
        </div>

        <div className={`grid ${plansGridClass} gap-4 ${plansContainerClass} mx-auto items-stretch`}>
          {displayPlans.map((plan) => {
            const isCustomEnterprise = plan.price === 0 && plan.name.toLowerCase().includes("enterprise");
            const duration = Math.max(1, Math.floor(plan.duration_months || 1));
            const totalPrice = resolveTotalPrice(plan);
            const hasSavings =
              typeof plan.original_price === "number" && plan.original_price > plan.price;
            const showPromoBadge = Boolean(plan.is_promo_active && plan.promo_label);
            const showSavingsBadge =
              !showPromoBadge &&
              typeof plan.discount_percentage === "number" &&
              plan.discount_percentage > 0 &&
              hasSavings;

            return (
              <Card
                key={plan.id}
                className={`relative h-full overflow-hidden transition-all duration-300 hover:-translate-y-1 flex flex-col ${
                  plan.is_popular
                    ? "border-2 border-accent shadow-lg scale-[1.02]"
                    : "border-border/50 hover:shadow-md"
                }`}
              >
                {plan.is_popular && (
                  <Badge className="absolute top-2 right-2 bg-accent text-accent-foreground">
                    {plan.popular_label || "Termurah • Paling Populer"}
                  </Badge>
                )}

                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>

                  {(showPromoBadge || showSavingsBadge) && (
                    <div className="mt-1 flex items-center gap-2">
                      {showPromoBadge ? (
                        <Badge variant="secondary" className="text-[11px]">
                          {plan.promo_label || "Promo"}
                        </Badge>
                      ) : null}
                      {showSavingsBadge ? (
                        <Badge variant="secondary" className="text-[11px]">
                          <BadgePercent className="mr-1 h-3 w-3" />
                          Hemat {plan.discount_percentage}%
                        </Badge>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-2">
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {isCustomEnterprise ? "Custom" : formatPrice(plan.price)}
                      </span>
                      {!isCustomEnterprise && (
                        <span className="text-muted-foreground text-xs">{plan.period || "/pegawai/bulan"}</span>
                      )}
                    </div>

                    {hasSavings && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {showPromoBadge ? "Harga normal: " : "Sebelum diskon: "}
                        <span className="line-through">
                          {formatPrice(plan.original_price || 0)}
                        </span>
                        {plan.period || "/pegawai/bulan"}
                      </p>
                    )}

                    {!isCustomEnterprise && duration > 1 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Total {duration} bulan: <span className="font-semibold text-foreground">{formatPrice(totalPrice)}</span>
                      </p>
                    )}

                    {!isCustomEnterprise && plan.commitment_label && (
                      <p className="text-xs font-medium text-primary mt-1">{plan.commitment_label}</p>
                    )}
                  </div>

                  <CardDescription className="text-xs mt-2">{plan.description}</CardDescription>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3 flex flex-col flex-1">
                  <ul className="space-y-1.5 flex-1">
                    {plan.features.slice(0, 5).map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                    {plan.features.length > 5 && (
                      <li className="text-xs text-muted-foreground pl-5">
                        +{plan.features.length - 5} fitur lainnya
                      </li>
                    )}
                  </ul>

                  <Link to={isCustomEnterprise ? PUBLIC_CONSULTATION_PATH : "/org/login?mode=register"} className="block mt-auto">
                    <Button variant={plan.is_popular ? "gold" : "outline"} className="w-full" size="sm">
                      {isCustomEnterprise ? "Butuh Konsultasi?" : plan.price === 0 ? "Mulai Gratis" : "Pilih Paket"}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="max-w-5xl mx-auto mt-6 border-primary/30 bg-primary/5">
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Paket enterprise mulai relevan di atas {new Intl.NumberFormat("id-ID").format(thresholdValue)} pegawai aktif
                </p>
                <p className="text-xs text-muted-foreground">
                  Untuk organisasi dengan kebutuhan lebih besar, skema enterprise membantu menyesuaikan harga,
                  onboarding, dan tahapan adopsi secara bertahap.
                </p>
                <p className="text-xs text-foreground/80">
                  Fokus komersial publik tetap dimulai dari Absensi. Kebutuhan HR dan Payroll dapat dibahas sebagai tahap lanjutan melalui konsultasi.
                </p>
              </div>
            </div>

            <div className="grid gap-2 text-xs text-foreground md:grid-cols-2">
              <div className="rounded-md border bg-background/70 p-3">
                <p className="font-semibold mb-1">Cocok untuk rollout bertahap</p>
                <p>Mulai dari kontrol kehadiran terlebih dahulu, lalu evaluasi perluasan modul setelah penggunaan Absensi stabil.</p>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <p className="font-semibold mb-1">Pendekatan harga lebih terukur</p>
                <p>Lebih mudah menyesuaikan jumlah pegawai aktif, durasi langganan, dan kesiapan implementasi organisasi.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Link to={PUBLIC_CONSULTATION_PATH}>
                <Button size="sm">
                  Konsultasikan Kebutuhan Enterprise
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
