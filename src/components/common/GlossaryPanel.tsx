import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Search } from "lucide-react";

interface GlossaryTerm {
  term: string;
  description: string;
  category: "billing" | "streak" | "absensi" | "organisasi" | "umum";
}

const GLOSSARY_TERMS: GlossaryTerm[] = [
  // Billing
  { term: "Tagihan Terpusat", description: "Model pembayaran ketika organisasi membayar seluruh biaya langganan untuk semua anggota/pegawai.", category: "billing" },
  { term: "Tagihan Mandiri", description: "Model pembayaran ketika masing-masing pegawai bertanggung jawab membayar lisensi sendiri secara individu.", category: "billing" },
  { term: "Tagihan (Invoice)", description: "Dokumen tagihan resmi yang diterbitkan saat organisasi atau pegawai melakukan pembelian langganan.", category: "billing" },
  { term: "Xendit", description: "Penyedia gerbang pembayaran pihak ketiga yang memproses pembayaran online (QRIS, Virtual Account, E-Wallet, Kartu Kredit).", category: "billing" },
  { term: "Transfer Manual", description: "Metode pembayaran via transfer bank dengan angka unik sebagai identifikasi otomatis.", category: "billing" },
  { term: "Angka Unik", description: "3 digit angka acak yang ditambahkan ke total pembayaran untuk memudahkan verifikasi otomatis transfer bank.", category: "billing" },
  { term: "Paket Langganan", description: "Pilihan durasi berlangganan (1, 3, 6, atau 12 bulan) dengan harga per-pegawai yang sudah ditentukan.", category: "billing" },
  { term: "Pemisahan Pajak PPN/PPH", description: "Di panel admin tagihan, komponen pajak ditampilkan terpisah (PPN dan PPH) untuk memudahkan rekonsiliasi dan pelaporan.", category: "billing" },
  { term: "Komponen Pajak Internal", description: "Komponen biaya internal platform (termasuk PPN/PPH) yang sudah diperhitungkan ke total tagihan tanpa ditampilkan sebagai baris terpisah di sisi klien.", category: "billing" },
  { term: "Total Tagihan Akhir", description: "Nilai akhir pada tagihan yang menjadi nominal pembayaran tenant. Tidak memerlukan penjumlahan manual tambahan di sisi klien.", category: "billing" },
  { term: "Masa Tenggang", description: "Masa tenggang setelah langganan berakhir ketika layanan masih dapat diakses sebelum diblokir.", category: "billing" },
  { term: "Menunggu Verifikasi", description: "Status tagihan saat bukti pembayaran sudah dikirim tenant tetapi belum disetujui admin tagihan.", category: "billing" },
  { term: "Tanggal Jatuh Tempo", description: "Tanggal batas akhir pembayaran tagihan. Setelah lewat, tagihan dapat masuk status terlambat atau kedaluwarsa.", category: "billing" },
  { term: "Bukti Pembayaran", description: "URL atau file (gambar/PDF) yang diunggah tenant untuk verifikasi pembayaran transfer manual.", category: "billing" },
  { term: "Tautan Tagihan", description: "Tautan pembayaran online dari gerbang pembayaran yang dapat dibuka langsung dari detail tagihan.", category: "billing" },

  // Streak
  { term: "Streak Stabilitas", description: "Hitungan hari berturut-turut ketika organisasi aktif menggunakan sistem absensi. Target 30 hari untuk aktivasi.", category: "streak" },
  { term: "Target Streak", description: "Jumlah hari (bawaan: 30) yang harus dicapai secara berturut-turut untuk membuktikan stabilitas penggunaan sistem.", category: "streak" },
  { term: "Reset Streak", description: "Penghitungan streak kembali ke 0 jika tidak ada aktivitas absensi pada hari kerja (akhir pekan dan hari libur dikecualikan).", category: "streak" },
  { term: "Hari Libur Organisasi", description: "Hari libur khusus organisasi yang dikecualikan dari perhitungan streak, berbeda dari hari libur nasional.", category: "streak" },

  // Absensi
  { term: "Absen Masuk", description: "Proses pencatatan kehadiran saat masuk kerja, termasuk validasi lokasi GPS dan jarak dari kantor.", category: "absensi" },
  { term: "Absen Pulang", description: "Proses pencatatan waktu pulang kerja dengan validasi lokasi.", category: "absensi" },
  { term: "Radius Kantor", description: "Batas jarak maksimum (dalam meter) dari titik koordinat kantor dimana absensi masih dianggap valid.", category: "absensi" },
  { term: "Presensi Fleksibel", description: "Izin khusus bagi pegawai untuk melakukan absensi di luar radius kantor dengan persetujuan atasan.", category: "absensi" },
  { term: "WFH (Kerja dari Rumah)", description: "Status kerja dari rumah ketika validasi lokasi GPS tidak diperlukan.", category: "absensi" },
  { term: "Shift Kerja", description: "Pengaturan jadwal kerja dengan jam masuk dan pulang tertentu yang bisa berbeda per unit kerja.", category: "absensi" },
  { term: "Toleransi Keterlambatan", description: "Jumlah menit (bawaan: 0) setelah jam masuk sebelum status dinilai terlambat. Nilai 0 berarti keterlambatan dihitung langsung dari jam masuk.", category: "absensi" },

  // Organisasi
  { term: "Tenant", description: "Istilah teknis untuk organisasi/instansi yang terdaftar dalam sistem multi-tenant.", category: "organisasi" },
  { term: "OPD", description: "Organisasi Perangkat Daerah — unit kerja dalam instansi pemerintah daerah.", category: "organisasi" },
  { term: "Admin Instansi", description: "Pengelola organisasi yang memiliki akses penuh untuk mengatur pegawai, kantor, jadwal, dan langganan.", category: "organisasi" },
  { term: "Super Admin", description: "Administrator tertinggi platform yang mengelola seluruh organisasi, pengaturan global, dan tagihan.", category: "organisasi" },
  { term: "Kode Organisasi", description: "Kode unik pendek yang digunakan pegawai untuk bergabung ke organisasi tertentu.", category: "organisasi" },
  { term: "Pengikatan Perangkat", description: "Pengikatan perangkat HP ke akun pegawai sehingga hanya bisa absensi dari 1 perangkat yang terdaftar.", category: "organisasi" },

  // Umum
  { term: "OTP (Kata Sandi Sekali Pakai)", description: "Kode verifikasi sekali pakai yang dikirim via WhatsApp atau email untuk keamanan.", category: "umum" },
  { term: "RLS (Keamanan Tingkat Baris)", description: "Kebijakan keamanan database yang memastikan setiap pengguna hanya bisa mengakses data miliknya sendiri.", category: "umum" },
  { term: "Mutasi", description: "Permintaan perubahan data pegawai (nama, jabatan, unit kerja, dll) yang memerlukan persetujuan admin.", category: "umum" },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  billing: { label: "Tagihan", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  streak: { label: "Streak", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  absensi: { label: "Absensi", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  organisasi: { label: "Organisasi", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  umum: { label: "Umum", color: "bg-muted text-muted-foreground" },
};

interface GlossaryPanelProps {
  triggerLabel?: string;
  defaultCategory?: string;
}

export function GlossaryPanel({ triggerLabel = "Glosarium", defaultCategory }: GlossaryPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(defaultCategory || null);

  const filteredTerms = GLOSSARY_TERMS.filter((t) => {
    const matchesSearch = !search || t.term.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Object.keys(CATEGORY_LABELS);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BookOpen className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Glosarium Istilah
          </SheetTitle>
          <SheetDescription>
            Penjelasan istilah-istilah yang digunakan dalam sistem
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari istilah..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={selectedCategory === null ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setSelectedCategory(null)}
            >
              Semua
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              >
                {CATEGORY_LABELS[cat].label}
              </Badge>
            ))}
          </div>

          {/* Terms List */}
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-3 pr-3">
              {filteredTerms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Tidak ada istilah yang cocok dengan pencarian.
                </p>
              ) : (
                filteredTerms.map((item) => (
                  <div
                    key={item.term}
                    className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-sm">{item.term}</h4>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${CATEGORY_LABELS[item.category].color}`}>
                        {CATEGORY_LABELS[item.category].label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
