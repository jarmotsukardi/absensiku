import { useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpCircle, Search, MessageSquare, ExternalLink, BookOpen, Users, Clock, FileText, Shield, Smartphone } from "lucide-react";

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
}

const DUMMY_FAQS: FAQ[] = [
  // Umum
  {
    id: "1",
    category: "Umum",
    question: "Bagaimana cara login ke aplikasi absensi?",
    answer: "Untuk login, buka aplikasi atau website absensi, masukkan email dan password yang telah didaftarkan oleh admin organisasi Anda. Jika belum memiliki akun, hubungi admin untuk mendapatkan kode undangan.",
  },
  {
    id: "2",
    category: "Umum",
    question: "Apa yang harus dilakukan jika lupa password?",
    answer: "Klik tombol 'Lupa Password' di halaman login, masukkan email Anda, dan ikuti instruksi reset password yang dikirim ke email. Pastikan email yang dimasukkan adalah email yang terdaftar di sistem.",
  },
  {
    id: "3",
    category: "Umum",
    question: "Bagaimana cara mengundang pegawai baru?",
    answer: "Masuk ke menu Pengaturan > Undangan Pegawai, klik tombol 'Undang Pegawai Baru', isi data pegawai (nama, email, NIK), lalu kirim undangan. Pegawai akan menerima email berisi kode undangan untuk registrasi.",
  },
  // Absensi
  {
    id: "4",
    category: "Absensi",
    question: "Mengapa absensi saya gagal karena lokasi tidak valid?",
    answer: "Absensi hanya bisa dilakukan dalam radius yang ditentukan dari lokasi kantor. Pastikan GPS aktif dan Anda berada di lokasi yang benar. Jika tetap gagal, hubungi admin untuk memeriksa pengaturan radius lokasi.",
  },
  {
    id: "5",
    category: "Absensi",
    question: "Bagaimana jika saya lupa melakukan absensi pulang?",
    answer: "Hubungi admin organisasi untuk melakukan koreksi absensi. Admin dapat menambahkan catatan atau menyesuaikan data absensi Anda melalui menu koreksi absensi.",
  },
  {
    id: "6",
    category: "Absensi",
    question: "Apakah bisa absensi dari rumah (WFH)?",
    answer: "Bisa, jika organisasi Anda mengaktifkan fitur WFH. Ajukan permohonan WFH terlebih dahulu dan tunggu persetujuan atasan. Setelah disetujui, Anda bisa absensi dari lokasi WFH yang telah ditentukan.",
  },
  // Izin & Cuti
  {
    id: "7",
    category: "Izin & Cuti",
    question: "Bagaimana cara mengajukan cuti?",
    answer: "Buka menu Izin/Cuti di aplikasi, pilih jenis cuti, tentukan tanggal mulai dan selesai, isi alasan, lalu kirim permohonan. Permohonan akan diteruskan ke atasan untuk persetujuan.",
  },
  {
    id: "8",
    category: "Izin & Cuti",
    question: "Berapa lama waktu persetujuan permohonan cuti?",
    answer: "Permohonan cuti akan otomatis ditolak jika tidak ditanggapi dalam 3 hari kerja. Pastikan untuk mengajukan cuti jauh-jauh hari agar atasan memiliki waktu untuk memproses.",
  },
  {
    id: "9",
    category: "Izin & Cuti",
    question: "Jenis cuti apa saja yang tersedia?",
    answer: "Tersedia beberapa jenis: Cuti Tahunan, Cuti Penting (menikah, keluarga meninggal), Cuti Sakit (dengan surat dokter), Izin, dan Dinas Luar. Setiap jenis memiliki kuota dan ketentuan berbeda.",
  },
  // Perangkat
  {
    id: "10",
    category: "Perangkat",
    question: "Mengapa perangkat saya tidak bisa digunakan untuk absensi?",
    answer: "Setiap akun terikat dengan satu perangkat untuk keamanan. Jika Anda mengganti HP atau perlu reset perangkat, hubungi admin untuk melakukan reset Device ID.",
  },
  {
    id: "11",
    category: "Perangkat",
    question: "Bagaimana jika GPS tidak akurat?",
    answer: "Pastikan GPS/Location Services aktif, beri izin lokasi ke aplikasi, dan tunggu beberapa saat agar GPS mendapat sinyal akurat. Hindari berada di dalam gedung tertutup saat absensi.",
  },
  // Keamanan
  {
    id: "12",
    category: "Keamanan",
    question: "Apakah data absensi saya aman?",
    answer: "Ya, data Anda disimpan dengan enkripsi dan hanya dapat diakses oleh Anda dan admin yang berwenang. Kami menerapkan standar keamanan tinggi untuk melindungi privasi pengguna.",
  },
];

const CATEGORIES = [
  { name: "Umum", icon: BookOpen },
  { name: "Absensi", icon: Clock },
  { name: "Izin & Cuti", icon: FileText },
  { name: "Perangkat", icon: Smartphone },
  { name: "Keamanan", icon: Shield },
];

export default function OrgHelp() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredFaqs = DUMMY_FAQS.filter((faq) => {
    const matchesSearch = 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedFaqs = filteredFaqs.reduce((acc, faq) => {
    if (!acc[faq.category]) {
      acc[faq.category] = [];
    }
    acc[faq.category].push(faq);
    return acc;
  }, {} as Record<string, FAQ[]>);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            Pusat Bantuan
          </h1>
          <p className="text-muted-foreground">Temukan jawaban untuk pertanyaan umum seputar aplikasi absensi</p>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari pertanyaan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            Semua
          </Button>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <Button
                key={cat.name}
                variant={selectedCategory === cat.name ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.name)}
                className="flex items-center gap-1"
              >
                <Icon className="h-3 w-3" />
                {cat.name}
              </Button>
            );
          })}
        </div>

        {/* FAQ List */}
        {Object.keys(groupedFaqs).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">Tidak ada FAQ yang sesuai dengan pencarian Anda.</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedFaqs).map(([category, faqs]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {CATEGORIES.find(c => c.name === category)?.icon && 
                    (() => {
                      const Icon = CATEGORIES.find(c => c.name === category)!.icon;
                      return <Icon className="h-5 w-5" />;
                    })()
                  }
                  {category}
                </CardTitle>
                <CardDescription>{faqs.length} pertanyaan</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {faqs.map((faq) => (
                    <AccordionItem key={faq.id} value={faq.id}>
                      <AccordionTrigger className="text-left">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))
        )}

        {/* Contact Support */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Butuh Bantuan Lebih Lanjut?
            </CardTitle>
            <CardDescription>
              Jika pertanyaan Anda belum terjawab, silakan hubungi tim support kami
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => window.open("mailto:support@absensi.app", "_blank")}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Kirim Email
            </Button>
            <Button variant="outline" onClick={() => window.open("https://wa.me/6281234567890", "_blank")}>
              <ExternalLink className="h-4 w-4 mr-2" />
              WhatsApp Support
            </Button>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
