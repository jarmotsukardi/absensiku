import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, BadgePercent, CheckCircle2 } from "lucide-react";
import type { PricingPlan } from "@/hooks/useHomepageData";

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
    price: 18000,
    original_price: null,
    discount_percentage: null,
    duration_months: 1,
    total_price: 18000,
    total_price_before_discount: null,
    period: "/pegawai/bulan",
    description: "Fleksibel untuk mulai cepat tanpa komitmen durasi panjang.",
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
    name: "Semester",
    price: 16500,
    original_price: 18000,
    discount_percentage: 8,
    duration_months: 6,
    total_price: 99000,
    total_price_before_discount: 108000,
    period: "/pegawai/bulan",
    description: "Cocok untuk instansi yang ingin efisiensi biaya menengah.",
    features: [
      "Durasi 6 bulan",
      "Diskon paket",
      "Monitoring dashboard lengkap",
      "Dukungan prioritas",
    ],
    is_popular: false,
    popular_label: null,
  },
  {
    id: "3",
    name: "Tahunan",
    price: 15000,
    original_price: 18000,
    discount_percentage: 17,
    duration_months: 12,
    total_price: 180000,
    total_price_before_discount: 216000,
    period: "/pegawai/bulan",
    description: "Harga paling hemat untuk organisasi dengan kebutuhan berkelanjutan.",
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
  subtitle = "Pilih paket yang sesuai dengan kebutuhan instansi Anda.",
  negotiationThreshold = 2000,
}: PricingSectionProps) {
  const displayPlans = plans.length > 0 ? plans : defaultPlans;
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
            Mulai gratis sekarang, bayar saat instansi siap aktivasi penuh.
          </p>
        </div>

        <div className={`grid ${plansGridClass} gap-4 ${plansContainerClass} mx-auto items-stretch`}>
          {displayPlans.map((plan) => {
            const isCustomEnterprise = plan.price === 0 && plan.name.toLowerCase().includes("enterprise");
            const duration = Math.max(1, Math.floor(plan.duration_months || 1));
            const totalPrice = resolveTotalPrice(plan);
            const showDiscount =
              typeof plan.discount_percentage === "number" &&
              plan.discount_percentage > 0 &&
              typeof plan.original_price === "number" &&
              plan.original_price > plan.price;

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

                  {showDiscount && (
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[11px]">
                        <BadgePercent className="mr-1 h-3 w-3" />
                        Hemat {plan.discount_percentage}%
                      </Badge>
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

                    {showDiscount && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Sebelum diskon:{" "}
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

                  <Link to="/org/login?mode=register" className="block mt-auto">
                    <Button variant={plan.is_popular ? "gold" : "outline"} className="w-full" size="sm">
                      {isCustomEnterprise ? "Hubungi Sales" : plan.price === 0 ? "Mulai Gratis" : "Pilih Paket"}
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
                  Ambang Negosiasi B2B: {new Intl.NumberFormat("id-ID").format(thresholdValue)} pegawai aktif
                </p>
                <p className="text-xs text-muted-foreground">
                  Saat jumlah pegawai aktif organisasi menembus ambang ini, sistem otomatis mengirim notifikasi
                  penawaran negosiasi harga ke Admin Organisasi dan Super Admin.
                </p>
              </div>
            </div>

            <div className="grid gap-2 text-xs text-foreground md:grid-cols-2">
              <div className="rounded-md border bg-background/70 p-3">
                <p className="font-semibold mb-1">Notifikasi ke Admin Organisasi</p>
                <p>Masuk ke inbox in-app organisasi untuk tindak lanjut negosiasi paket enterprise/B2B.</p>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <p className="font-semibold mb-1">Notifikasi ke Super Admin</p>
                <p>Masuk ke panel superadmin sebagai sinyal follow-up penawaran dan approval skema harga.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Link to="/org/login">
                <Button size="sm" variant="outline">
                  Login Admin Organisasi
                </Button>
              </Link>
              <Link to="/admin/login">
                <Button size="sm">
                  Tindak Lanjut via Super Admin
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
