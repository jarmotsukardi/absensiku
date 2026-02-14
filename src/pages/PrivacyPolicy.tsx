import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Shield, 
  Lock, 
  Eye, 
  Trash2, 
  Clock, 
  MapPin,
  ArrowLeft,
  FileText,
  Users,
  Database,
} from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Kebijakan Privasi</h1>
              <p className="text-sm text-muted-foreground">AbsensiKu - Sistem Absensi Digital</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          {/* Intro */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold mb-2">Komitmen Privasi Kami</h2>
                  <p className="text-muted-foreground">
                    AbsensiKu berkomitmen untuk melindungi privasi dan keamanan data pribadi Anda. 
                    Kebijakan ini menjelaskan bagaimana kami mengumpulkan, menggunakan, dan melindungi 
                    informasi Anda sesuai dengan peraturan perlindungan data yang berlaku di Indonesia.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Terakhir diperbarui: {new Date().toLocaleDateString('id-ID', { 
                      year: 'numeric', month: 'long', day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data yang Dikumpulkan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data yang Kami Kumpulkan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">1. Data Identitas</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Nama lengkap dan gelar</li>
                  <li>Nomor Induk Kependudukan (NIK)</li>
                  <li>Nomor Induk Pegawai (NIP) jika ada</li>
                  <li>Email dan nomor telepon</li>
                  <li>Jabatan dan unit kerja</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">2. Data Lokasi (GPS)</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Koordinat GPS <strong>hanya</strong> saat melakukan absensi</li>
                  <li>Data lokasi <strong>tidak</strong> dikumpulkan secara terus-menerus</li>
                  <li>Jarak ke lokasi kantor untuk validasi kehadiran</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2">3. Data Kehadiran</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Waktu masuk dan pulang</li>
                  <li>Status kehadiran (hadir, izin, cuti, dll)</li>
                  <li>Catatan permohonan izin/cuti</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Penggunaan Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Penggunaan Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Data Anda digunakan <strong>hanya</strong> untuk keperluan berikut:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Pencatatan dan validasi kehadiran kerja</li>
                <li>Pengelolaan permohonan izin dan cuti</li>
                <li>Pembuatan laporan absensi untuk organisasi</li>
                <li>Komunikasi terkait kehadiran (notifikasi)</li>
                <li>Peningkatan layanan aplikasi</li>
              </ul>
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">⚠️ Kami TIDAK akan:</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1 ml-4">
                  <li>Menjual data Anda ke pihak ketiga</li>
                  <li>Melacak lokasi Anda secara terus-menerus</li>
                  <li>Menggunakan data untuk keperluan di luar absensi</li>
                  <li>Membagikan data ke pihak yang tidak berwenang</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Penyimpanan & Keamanan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Penyimpanan & Keamanan Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Keamanan</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Data dienkripsi saat transit dan saat disimpan</li>
                  <li>Akses dibatasi dengan autentikasi multi-faktor</li>
                  <li>Audit log untuk semua akses data sensitif</li>
                  <li>Infrastruktur cloud dengan standar keamanan tinggi</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2">Retensi Data</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                  <li>Data absensi: disimpan sesuai kebijakan organisasi</li>
                  <li><strong>Data koordinat GPS: dihapus otomatis setelah 30 hari</strong></li>
                  <li>Data akun: dihapus saat pegawai keluar dari organisasi</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Data Lokasi Khusus */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <MapPin className="h-5 w-5" />
                Tentang Data Lokasi (GPS)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Kami memahami sensitivitas data lokasi. Berikut komitmen kami:
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 bg-background rounded-lg border">
                  <Clock className="h-5 w-5 text-primary mb-2" />
                  <h4 className="font-medium mb-1">Pengambilan Minimal</h4>
                  <p className="text-sm text-muted-foreground">
                    GPS hanya aktif saat Anda menekan tombol absen, bukan secara terus-menerus.
                  </p>
                </div>
                
                <div className="p-4 bg-background rounded-lg border">
                  <Trash2 className="h-5 w-5 text-primary mb-2" />
                  <h4 className="font-medium mb-1">Penghapusan Otomatis</h4>
                  <p className="text-sm text-muted-foreground">
                    Koordinat GPS dihapus otomatis setelah 30 hari untuk meminimalkan penyimpanan.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-background rounded-lg border">
                <h4 className="font-medium mb-2">Mengapa kami butuh data lokasi?</h4>
                <p className="text-sm text-muted-foreground">
                  Data lokasi diperlukan untuk memvalidasi bahwa absensi dilakukan di lokasi kerja 
                  yang ditentukan (geofencing). Ini memastikan integritas sistem kehadiran dan 
                  mencegah kecurangan absensi.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Hak Pengguna */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Hak Anda
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Sesuai dengan peraturan perlindungan data, Anda memiliki hak:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li><strong>Hak Akses:</strong> Meminta salinan data pribadi Anda</li>
                <li><strong>Hak Koreksi:</strong> Meminta perbaikan data yang tidak akurat</li>
                <li><strong>Hak Hapus:</strong> Meminta penghapusan data (dengan ketentuan)</li>
                <li><strong>Hak Portabilitas:</strong> Meminta data dalam format yang dapat dibaca mesin</li>
                <li><strong>Hak Keberatan:</strong> Mengajukan keberatan atas pemrosesan data</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-4">
                Untuk menggunakan hak-hak ini, hubungi admin organisasi Anda atau kirim email ke 
                privacy@absensiku.id
              </p>
            </CardContent>
          </Card>

          {/* Kontak */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Kontak & Pertanyaan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Jika Anda memiliki pertanyaan tentang kebijakan privasi ini atau ingin menggunakan 
                hak-hak Anda, silakan hubungi:
              </p>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="font-medium">Data Protection Officer</p>
                <p className="text-sm text-muted-foreground">Email: privacy@absensiku.id</p>
                <p className="text-sm text-muted-foreground">
                  Atau hubungi admin organisasi Anda untuk pertanyaan terkait data di organisasi.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Footer Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/">
              <Button variant="outline" className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali ke Beranda
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="w-full sm:w-auto">
                Masuk ke Aplikasi
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} AbsensiKu. Hak Cipta Dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}
