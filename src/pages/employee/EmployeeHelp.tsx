import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  HelpCircle,
  MapPin,
  Clock,
  Smartphone,
  FileText,
  MessageCircle,
  Shield,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

interface TenantInfo {
  name: string;
}

export default function EmployeeHelp() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/employee/login");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/employee/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchTenantInfo();
    }
  }, [user]);

  const fetchTenantInfo = async () => {
    try {
      const { data: empData } = await supabase
        .from("employees")
        .select("tenant_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (empData?.tenant_id) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", empData.tenant_id)
          .maybeSingle();

        if (tenant) {
          setTenantInfo(tenant);
        }
      }
    } catch (error) {
      console.error("Error fetching tenant:", error);
    }
  };

  const faqItems = [
    {
      id: "attendance",
      icon: MapPin,
      title: "Cara Melakukan Absensi",
      items: [
        {
          question: "Bagaimana cara melakukan absensi masuk?",
          answer: "Absensi hanya dapat dilakukan melalui aplikasi resmi (APK) yang terinstall di perangkat Android Anda. Buka aplikasi, pastikan GPS aktif, lalu tekan tombol 'Masuk' saat berada dalam radius kantor."
        },
        {
          question: "Kenapa saya tidak bisa absen dari browser/web?",
          answer: "Untuk keamanan dan validasi lokasi yang akurat, absensi hanya dapat dilakukan melalui aplikasi resmi Android. Hal ini untuk mencegah kecurangan dan memastikan Anda berada di lokasi kantor."
        },
        {
          question: "Apa yang harus dilakukan jika GPS tidak akurat?",
          answer: "Pastikan GPS aktif, buka di area terbuka, tunggu beberapa detik hingga akurasi membaik. Jika masih bermasalah, restart perangkat atau gunakan aplikasi GPS Test untuk kalibrasi."
        }
      ]
    },
    {
      id: "device",
      icon: Smartphone,
      title: "Perangkat & Aplikasi",
      items: [
        {
          question: "Bagaimana cara download aplikasi absensi?",
          answer: "Kunjungi halaman landing organisasi Anda atau minta link download ke admin. Install APK di perangkat Android Anda, lalu login dengan akun yang sudah terdaftar."
        },
        {
          question: "Apa itu binding perangkat?",
          answer: "Binding perangkat adalah fitur keamanan yang mengaitkan akun Anda dengan satu perangkat Android. Setelah terdaftar, hanya perangkat tersebut yang dapat digunakan untuk absensi."
        },
        {
          question: "Bagaimana jika saya ganti HP?",
          answer: "Hubungi admin untuk melakukan reset perangkat. Setelah direset, Anda dapat mendaftarkan perangkat baru pada absensi pertama."
        }
      ]
    },
    {
      id: "leave",
      icon: FileText,
      title: "Pengajuan Izin & Cuti",
      items: [
        {
          question: "Bagaimana cara mengajukan izin/cuti?",
          answer: "Buka menu 'Pengajuan' di dashboard, pilih jenis pengajuan (izin, sakit, cuti, dll), isi form dengan lengkap termasuk tanggal dan alasan, lalu kirim untuk diproses atasan."
        },
        {
          question: "Berapa lama pengajuan diproses?",
          answer: "Pengajuan akan diproses oleh atasan Anda. Waktu proses tergantung kebijakan masing-masing unit kerja. Pantau status pengajuan di menu Pengajuan."
        },
        {
          question: "Apakah bisa mengajukan izin mendadak?",
          answer: "Ya, Anda dapat mengajukan izin kapan saja. Namun disarankan untuk mengajukan sebelumnya jika memungkinkan agar proses persetujuan lebih lancar."
        }
      ]
    },
    {
      id: "time",
      icon: Clock,
      title: "Jam Kerja & Keterlambatan",
      items: [
        {
          question: "Kapan saya dinyatakan terlambat?",
          answer: "Keterlambatan dihitung berdasarkan jam kerja yang ditetapkan organisasi. Jika Anda absen masuk setelah batas waktu toleransi, status akan tercatat 'Terlambat'."
        },
        {
          question: "Bagaimana jika saya lupa absen pulang?",
          answer: "Hubungi admin untuk koreksi absensi. Siapkan bukti atau alasan yang jelas untuk proses koreksi."
        },
        {
          question: "Apakah ada sistem shift?",
          answer: "Tergantung kebijakan organisasi. Beberapa unit kerja menerapkan sistem shift yang dapat dipilih saat absensi."
        }
      ]
    },
    {
      id: "security",
      icon: Shield,
      title: "Keamanan Akun",
      items: [
        {
          question: "Bagaimana cara mengubah password?",
          answer: "Buka menu Profil, lalu pilih 'Ubah Password'. Masukkan password baru dan konfirmasi. Password minimal 6 karakter."
        },
        {
          question: "Apa yang harus dilakukan jika lupa password?",
          answer: "Gunakan fitur 'Lupa Password' di halaman login. Link reset akan dikirim ke email yang terdaftar. Atau hubungi admin untuk bantuan."
        },
        {
          question: "Akun saya digunakan orang lain, bagaimana?",
          answer: "Segera hubungi admin untuk reset perangkat dan ubah password. Jangan bagikan kredensial akun Anda kepada siapapun."
        }
      ]
    },
    {
      id: "trouble",
      icon: AlertTriangle,
      title: "Troubleshooting",
      items: [
        {
          question: "Aplikasi tidak bisa dibuka/crash",
          answer: "Coba restart perangkat, pastikan versi Android mendukung (minimal Android 7), clear cache aplikasi, atau reinstall aplikasi."
        },
        {
          question: "Muncul pesan 'Di luar radius'",
          answer: "Pastikan Anda berada di dalam radius kantor yang ditentukan. Cek akurasi GPS Anda. Jika yakin sudah di lokasi, tunggu beberapa saat agar GPS lebih akurat."
        },
        {
          question: "Tidak menerima notifikasi",
          answer: "Pastikan notifikasi aplikasi diizinkan di pengaturan HP. Cek juga pengaturan battery saver yang mungkin membatasi notifikasi."
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-4 px-4 h-16">
          <Button variant="ghost" size="icon" onClick={() => navigate("/employee/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-semibold">Bantuan</h1>
            <p className="text-xs text-muted-foreground">FAQ & Panduan</p>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto p-4 space-y-6">
        {/* Quick Tips */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Tips Cepat</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Pastikan GPS aktif sebelum absensi</li>
                  <li>• Gunakan aplikasi resmi untuk absensi</li>
                  <li>• Ajukan izin/cuti sedini mungkin</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* FAQ Sections */}
        {faqItems.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <section.icon className="w-5 h-5 text-primary" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="single" collapsible className="w-full">
                {section.items.map((item, index) => (
                  <AccordionItem key={index} value={`${section.id}-${index}`}>
                    <AccordionTrigger className="text-left text-sm">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}

        {/* Contact Support */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Hubungi Admin
            </CardTitle>
            <CardDescription>
              Butuh bantuan lebih lanjut? Hubungi admin organisasi Anda
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">
              Hubungi admin organisasi Anda untuk bantuan lebih lanjut.
            </p>
          </CardContent>
        </Card>

        {/* App Info */}
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground text-center">
              {tenantInfo?.name || "Sistem Absensi"} • Versi 1.0.0
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
