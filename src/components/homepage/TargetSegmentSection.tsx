import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Landmark, Building, Briefcase, GraduationCap, HeartHandshake } from "lucide-react";

export function TargetSegmentSection() {
  const segments = [
    {
      icon: Landmark,
      title: "Pemerintah Daerah",
      description: "Solusi absensi untuk Pemda, OPD, dan unit kerja pemerintah daerah dengan standar audit BPK.",
      features: ["Multi OPD & Lokasi Kerja", "Audit trail & Laporan rekapitulasi", "Billing terpusat / mandiri", "Negosiasi B2B untuk skala besar"],
      color: "primary",
    },
    {
      icon: Building,
      title: "Instansi Pemerintah",
      description: "Untuk Kementerian, Lembaga, BUMN, BUMD, dan instansi pemerintah vertikal lainnya.",
      features: ["Struktur hierarki ASN & NIP", "WFH & absensi fleksibel", "Kalender libur nasional otomatis", "Integrasi pembayaran Xendit & Manual"],
      color: "info",
    },
    {
      icon: Briefcase,
      title: "Perusahaan",
      description: "Solusi fleksibel untuk perusahaan swasta dari startup hingga korporasi besar.",
      features: ["Multi shift 24/7 & rotasi kerja", "Operasional Senin–Minggu", "Overtime & mutasi pegawai", "Pembayaran QRIS, VA, E-Wallet"],
      color: "accent",
    },
    {
      icon: GraduationCap,
      title: "Sekolah",
      description: "Sistem absensi guru, staf, dan tenaga kependidikan untuk semua jenjang pendidikan.",
      features: ["Guru & tenaga pendidik", "Kalender akademik & libur khusus", "Notifikasi & pengumuman", "Gratis hingga siap berlangganan"],
      color: "success",
    },
  ];

  const getColorClasses = (color: string) => {
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
    return colorMap[color] || colorMap.primary;
  };

  return (
    <section className="py-20 px-4 bg-muted/30">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-4">
            <HeartHandshake className="w-4 h-4 text-accent" />
            <span className="text-foreground text-sm font-medium">Solusi untuk Semua</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Dirancang untuk Berbagai Organisasi</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            AbsensiKu melayani kebutuhan absensi dari berbagai jenis organisasi dengan fitur yang dapat dikustomisasi.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {segments.map((segment, index) => {
            const colors = getColorClasses(segment.color);
            const IconComponent = segment.icon;

            return (
              <Card
                key={index}
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
                    {segment.features.map((feature, fIndex) => (
                      <li key={fIndex} className="flex items-center gap-2">
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
