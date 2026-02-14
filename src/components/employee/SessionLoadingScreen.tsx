import { useState, useEffect, useMemo } from "react";
import { MapPin, Loader2, Shield, Wifi, Clock, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SessionLoadingScreenProps {
  onComplete: () => void;
  duration?: number; // durasi dalam ms, default 3000
  message?: string;
}

// Tips yang ditampilkan selama loading
const LOADING_TIPS = [
  { icon: Shield, text: "Memverifikasi keamanan sesi Anda..." },
  { icon: Wifi, text: "Menyinkronkan data dengan server..." },
  { icon: Clock, text: "Memuat jadwal dan pengaturan..." },
  { icon: MapPin, text: "Menyiapkan layanan lokasi..." },
];

// Fase loading dengan deskripsi
const LOADING_PHASES = [
  { threshold: 0, label: "Memulai...", sublabel: "Menginisialisasi aplikasi" },
  { threshold: 20, label: "Memverifikasi sesi...", sublabel: "Mengecek kredensial Anda" },
  { threshold: 45, label: "Memuat data...", sublabel: "Mengambil informasi pegawai" },
  { threshold: 70, label: "Hampir selesai...", sublabel: "Menyiapkan dashboard" },
  { threshold: 90, label: "Selesai!", sublabel: "Selamat datang kembali" },
];

/**
 * Komponen loading screen dengan progress bar animasi
 * Menampilkan animasi 0-100% selama proses verifikasi sesi
 */
export function SessionLoadingScreen({ 
  onComplete, 
  duration = 3000,
}: SessionLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  // Rotasi tips setiap 1.5 detik
  useEffect(() => {
    const tipTimer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % LOADING_TIPS.length);
    }, 1500);

    return () => clearInterval(tipTimer);
  }, []);

  // Progress animation
  useEffect(() => {
    const interval = 50; // Update setiap 50ms
    const increment = (100 * interval) / duration;
    
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          // Panggil onComplete setelah progress selesai
          setTimeout(onComplete, 100);
          return 100;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [duration, onComplete]);

  // Ambil fase saat ini berdasarkan progress
  const currentPhase = useMemo(() => {
    for (let i = LOADING_PHASES.length - 1; i >= 0; i--) {
      if (progress >= LOADING_PHASES[i].threshold) {
        return LOADING_PHASES[i];
      }
    }
    return LOADING_PHASES[0];
  }, [progress]);

  const CurrentTipIcon = LOADING_TIPS[tipIndex].icon;
  const isComplete = progress >= 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex flex-col items-center justify-center p-6">
      {/* Logo & Branding */}
      <div className="mb-8 text-center">
        <div className={`w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-xl shadow-primary/25 transition-all duration-500 ${isComplete ? 'scale-110' : 'animate-pulse'}`}>
          {isComplete ? (
            <CheckCircle2 className="w-10 h-10 text-primary-foreground" />
          ) : (
            <MapPin className="w-10 h-10 text-primary-foreground" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground">AbsensiKu</h1>
        <p className="text-muted-foreground text-sm mt-1">Sistem Absensi Digital</p>
      </div>

      {/* Progress Container */}
      <div className="w-full max-w-xs space-y-4">
        {/* Progress Bar */}
        <div className="relative">
          <Progress value={progress} className="h-2.5" />
          {/* Glow effect */}
          <div 
            className="absolute top-0 left-0 h-2.5 rounded-full bg-primary/30 blur-sm transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Fase & Persentase */}
        <div className="text-center space-y-1">
          <p className="font-medium text-foreground">{currentPhase.label}</p>
          <p className="text-xs text-muted-foreground">{currentPhase.sublabel}</p>
        </div>

        {/* Persentase */}
        <div className="flex items-center justify-center">
          <span className="font-mono text-2xl font-bold text-primary">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Tip yang berputar */}
      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground animate-fade-in">
        <CurrentTipIcon className="w-4 h-4 text-primary/70" />
        <span className="transition-all duration-300">{LOADING_TIPS[tipIndex].text}</span>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center">
        <p className="text-xs text-muted-foreground">
          {isComplete ? "Mengalihkan ke dashboard..." : "Mohon tunggu sebentar..."}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-2">
          Koneksi internet yang stabil diperlukan
        </p>
      </div>
    </div>
  );
}
