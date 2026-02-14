import { useState } from "react";
import { MapPin, Clock, Shield, Users, Building2, FileText, Smartphone, BarChart3, Lock, Zap, Calendar, Bell, Timer, Fingerprint, Globe, ClipboardList, UserCheck, PieChart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Feature } from "@/hooks/useHomepageData";

interface FeaturesSectionProps {
  features: Feature[];
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
   MapPin, Clock, Shield, Users, Building2, FileText, Smartphone, BarChart3, Lock, Zap, Calendar, Bell, Timer, Fingerprint, Globe, ClipboardList, UserCheck, PieChart
};

const defaultFeatures: Feature[] = [
   { id: "1", icon: "MapPin", title: "Absensi GPS", description: "Validasi lokasi real-time dengan teknologi GPS canggih yang akurat hingga beberapa meter. Sistem secara otomatis memverifikasi apakah pegawai berada dalam radius yang ditentukan." },
   { id: "2", icon: "Shield", title: "Anti Fake GPS", description: "Keamanan tingkat tinggi dengan deteksi otomatis terhadap aplikasi fake GPS, mock location, dan upaya manipulasi lokasi lainnya." },
   { id: "3", icon: "Clock", title: "Multi Shift", description: "Kelola berbagai shift kerja fleksibel seperti shift pagi, siang, malam, atau custom sesuai kebutuhan organisasi." },
   { id: "4", icon: "Building2", title: "Multi Kantor", description: "Satu akun organisasi dapat mengelola banyak lokasi kantor atau cabang dengan koordinat berbeda." },
   { id: "5", icon: "FileText", title: "Izin & Cuti", description: "Pengajuan izin, cuti tahunan, sakit, dan tugas luar secara online dengan alur persetujuan digital." },
   { id: "6", icon: "Timer", title: "Pengajuan Lembur", description: "Request lembur dengan sistem approval berjenjang dan perhitungan otomatis berdasarkan rate yang dikonfigurasi." },
   { id: "7", icon: "Globe", title: "WFH & Dinas Luar", description: "Absensi dari mana saja untuk pegawai dengan tugas lapangan atau bekerja dari rumah dengan persetujuan." },
   { id: "8", icon: "UserCheck", title: "Approval Berjenjang", description: "Persetujuan bertingkat sesuai struktur organisasi dari atasan langsung hingga admin." },
   { id: "9", icon: "Bell", title: "Notifikasi Realtime", description: "Alert otomatis ke pegawai & admin via push notification, email, dan WhatsApp." },
   { id: "10", icon: "PieChart", title: "Laporan Lengkap", description: "Export rekap absensi ke Excel & PDF dengan berbagai filter dan visualisasi data." },
   { id: "11", icon: "Calendar", title: "Hari Libur Nasional", description: "Integrasi kalender libur nasional otomatis dan pengaturan hari libur custom per organisasi." },
   { id: "12", icon: "Users", title: "Multi-Tenant SaaS", description: "Platform untuk banyak instansi dengan isolasi data yang aman dan independen." },
];

export function FeaturesSection({ features }: FeaturesSectionProps) {
  const displayFeatures = features.length > 0 ? features : defaultFeatures;
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

  return (
    <section id="fitur" className="py-20 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-16">
           <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">Fitur Lengkap untuk Kebutuhan Anda</h2>
           <p className="text-muted-foreground max-w-2xl mx-auto">
             Solusi absensi modern dengan fitur lengkap untuk pemerintah & perusahaan
          </p>
        </div>

         <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {displayFeatures.map((feature) => {
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
