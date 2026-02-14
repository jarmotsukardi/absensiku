import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Landmark, Building, Briefcase, GraduationCap, HeartHandshake, type LucideIcon } from "lucide-react";
import type { TargetSegmentSettings } from "@/hooks/useHomepageData";

interface TargetSegmentSectionProps {
  settings?: TargetSegmentSettings;
}

const defaultSettings: TargetSegmentSettings = {
  section_title: "Dirancang untuk Berbagai Organisasi",
  section_subtitle: "AbsensiKu melayani kebutuhan absensi dari berbagai jenis organisasi dengan fitur yang dapat dikustomisasi.",
  badge_text: "Solusi untuk Semua",
  segments: [
    {
      title: "Pemerintah Daerah",
      description: "Solusi absensi untuk Pemda, OPD, dan unit kerja pemerintah daerah dengan standar audit BPK.",
      features: ["Multi OPD & Lokasi Kerja", "Audit trail Inspektorat", "Laporan rekapitulasi"],
      icon: "Landmark",
      color: "primary",
    },
    {
      title: "Instansi Pemerintah",
      description: "Untuk Kementerian, Lembaga, BUMN, BUMD, Institusi dan instansi pemerintah vertikal lainnya.",
      features: ["Struktur hierarki ASN", "Integrasi NIP", "Sinkronisasi SIMPEG"],
      icon: "Building",
      color: "info",
    },
    {
      title: "Perusahaan",
      description: "Solusi fleksibel untuk perusahaan swasta dari startup hingga korporasi besar.",
      features: ["Multi cabang & divisi", "Shift kerja fleksibel", "API Integrasi HR & payroll"],
      icon: "Briefcase",
      color: "accent",
    },
    {
      title: "Sekolah",
      description: "Sistem absensi guru, staf, dan tenaga kependidikan untuk semua jenjang pendidikan.",
      features: ["Guru & tenaga pendidik", "Kalender akademik", "Laporan"],
      icon: "GraduationCap",
      color: "success",
    },
  ],
};

const iconMap: Record<string, LucideIcon> = {
  Landmark,
  Building,
  Briefcase,
  GraduationCap,
};

const colorMap: Record<string, { gradient: string; bg: string; text: string; hoverBg: string }> = {
  primary: {
    gradient: "from-primary to-primary/60",
    bg: "bg-primary/10",
    text: "text-primary",
    hoverBg: "group-hover:bg-primary",
  },
  info: { gradient: "from-info to-info/60", bg: "bg-info/10", text: "text-info", hoverBg: "group-hover:bg-info" },
  accent: {
    gradient: "from-accent to-accent/60",
    bg: "bg-accent/10",
    text: "text-accent",
    hoverBg: "group-hover:bg-accent",
  },
  success: {
    gradient: "from-success to-success/60",
    bg: "bg-success/10",
    text: "text-success",
    hoverBg: "group-hover:bg-success",
  },
};

export function TargetSegmentSection({ settings }: TargetSegmentSectionProps) {
  const mergedSettings: TargetSegmentSettings = {
    ...defaultSettings,
    ...(settings || {}),
    segments: Array.isArray(settings?.segments) && settings.segments.length > 0
      ? settings.segments
      : defaultSettings.segments,
  };

  const segments = mergedSettings.segments.map((segment) => ({
    ...segment,
    features: Array.isArray(segment.features) ? segment.features.filter((feature) => typeof feature === "string" && feature.trim()) : [],
  }));

  return (
    <section className="py-20 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-4">
            <HeartHandshake className="w-4 h-4 text-accent" />
            <span className="text-foreground text-sm font-medium">{mergedSettings.badge_text}</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{mergedSettings.section_title}</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{mergedSettings.section_subtitle}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {segments.map((segment, index) => {
            const colors = colorMap[segment.color] || colorMap.primary;
            const IconComponent = iconMap[segment.icon] || Landmark;

            return (
              <Card
                key={`${segment.title}-${index}`}
                className="group border-border/50 bg-card overflow-hidden relative hover:shadow-large transition-all duration-300 hover:-translate-y-2"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colors.gradient}`} />
                <CardHeader className="text-center pb-2">
                  <div
                    className={`w-16 h-16 rounded-2xl ${colors.bg} flex items-center justify-center mx-auto mb-4 ${colors.hoverBg} group-hover:scale-110 transition-all duration-300`}
                  >
                    <IconComponent className={`w-8 h-8 ${colors.text} group-hover:text-white transition-colors`} />
                  </div>
                  <CardTitle className="text-xl">{segment.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <CardDescription className="text-muted-foreground mb-4">{segment.description}</CardDescription>
                  <ul className="text-sm text-left space-y-2">
                    {segment.features.map((feature, featureIndex) => (
                      <li key={`${feature}-${featureIndex}`} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
