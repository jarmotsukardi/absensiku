import { useState } from "react";
import { MapPin, Clock, Shield, Users, Building2, FileText, Smartphone, BarChart3, Lock, Zap, Calendar, Bell, Timer, Fingerprint, Globe, ClipboardList, UserCheck, PieChart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Feature } from "@/hooks/useHomepageData";

interface FeaturesSectionProps {
  features: Feature[];
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
   MapPin, Clock, Shield, Users, Building2, FileText, Smartphone, BarChart3, Lock, Zap, Calendar, Bell, Timer, Fingerprint, Globe, ClipboardList, UserCheck, PieChart
};

const useCases = [
  {
    id: "daily-operations",
    title: "Kontrol kehadiran harian",
    description: "Pantau check-in, check-out, keterlambatan, dan kehadiran tim dari satu dashboard operasional.",
    icon: Clock,
    accent: "bg-primary/10 text-primary",
    keywords: ["absen", "hadir", "check", "clock", "jadwal", "terlambat", "shift"],
  },
  {
    id: "field-validation",
    title: "Validasi lapangan yang ketat",
    description: "Lindungi proses absensi dengan lokasi, perangkat, identitas, dan guardrail yang sesuai kebutuhan organisasi.",
    icon: Shield,
    accent: "bg-info/10 text-info",
    keywords: ["lokasi", "gps", "device", "finger", "geo", "aman", "security", "validasi"],
  },
  {
    id: "approval-reporting",
    title: "Approval dan laporan yang rapi",
    description: "Buat proses persetujuan, notifikasi, dan laporan berjalan lebih cepat untuk admin maupun pimpinan.",
    icon: BarChart3,
    accent: "bg-accent/15 text-accent-foreground",
    keywords: ["lapor", "approval", "notif", "rekap", "chart", "stat", "dokumen"],
  },
  {
    id: "expansion",
    title: "Siap untuk tahap lanjutan",
    description: "Saat operasional absensi sudah stabil, fondasi data yang sama siap dipakai untuk pembahasan HR atau Payroll berikutnya.",
    icon: Building2,
    accent: "bg-success/10 text-success",
    keywords: ["pegawai", "hr", "payroll", "org", "struktur", "gaji", "dokumen", "employee"],
  },
];

const matchFeatureToUseCase = (feature: Feature) => {
  const haystack = `${feature.title} ${feature.description}`.toLowerCase();

  return (
    useCases.find((useCase) => useCase.keywords.some((keyword) => haystack.includes(keyword))) ??
    useCases[0]
  );
};

export function FeaturesSection({ features }: FeaturesSectionProps) {
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const groupedFeatures = useCases.map((useCase) => ({
    ...useCase,
    matchedFeatures: features.filter((feature) => matchFeatureToUseCase(feature).id === useCase.id).slice(0, 3),
  }));
  const featuredGridItems = features.slice(0, 6);

  return (
    <section id="fitur" className="py-20 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-12">
           <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Fitur yang mengikuti alur kerja nyata</h2>
           <p className="text-muted-foreground max-w-3xl mx-auto">
             Bukan sekadar daftar modul. Homepage ini merangkum outcome utama yang biasanya dicari organisasi saat
             membangun fondasi absensi, memperketat validasi, merapikan approval, lalu menyiapkan organisasi untuk tahap lanjutan bila diperlukan.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4 mb-12">
          {groupedFeatures.map((useCase) => {
            const IconComponent = useCase.icon;

            return (
              <article key={useCase.id} className="rounded-3xl border border-border/60 bg-card p-6 shadow-soft">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${useCase.accent}`}>
                  <IconComponent className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-foreground">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{useCase.description}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {useCase.matchedFeatures.length > 0 ? (
                    useCase.matchedFeatures.map((feature) => (
                      <Badge
                        key={feature.id}
                        variant="secondary"
                        className="cursor-pointer rounded-full px-3 py-1 text-xs"
                        onClick={() => setSelectedFeature(feature)}
                      >
                        {feature.title}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Detail modul akan mengikuti konfigurasi publik.</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

         {features.length > 0 ? (
          <>
            <div className="mx-auto mb-6 max-w-2xl text-center">
              <p className="text-sm font-medium text-foreground">Butuh lihat daftar modul lebih detail?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Berikut ringkasan modul unggulan yang paling sering dicari. Klik salah satu kartu untuk melihat konteks singkatnya.
              </p>
            </div>
           <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {featuredGridItems.map((feature) => {
              const IconComponent = iconMap[feature.icon] || MapPin;
              return (
                 <button 
                   key={feature.id} 
                   onClick={() => setSelectedFeature(feature)}
                   className="group p-4 rounded-xl border border-border/50 bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-300 text-center cursor-pointer"
                 >
                   <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary group-hover:scale-110 transition-all duration-300">
                     <IconComponent className="w-5 h-5 text-primary group-hover:text-primary-foreground transition-colors" />
                   </div>
                   <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                   <p className="text-xs text-muted-foreground line-clamp-2">{feature.description}</p>
                 </button>
              );
            })}
          </div>
          {features.length > featuredGridItems.length && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Menampilkan {featuredGridItems.length} modul unggulan dari {features.length} fitur publik yang tersedia.
            </p>
          )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Belum ada fitur yang dipublikasikan.
          </div>
        )}
      </div>

      {/* Feature Detail Dialog */}
      <Dialog open={!!selectedFeature} onOpenChange={() => setSelectedFeature(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            {selectedFeature && (() => {
              const IconComponent = iconMap[selectedFeature.icon] || MapPin;
              return (
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <IconComponent className="w-7 h-7 text-primary" />
                  </div>
                  <DialogTitle className="text-xl">{selectedFeature.title}</DialogTitle>
                </div>
              );
            })()}
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground leading-relaxed">
              {selectedFeature?.description}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
