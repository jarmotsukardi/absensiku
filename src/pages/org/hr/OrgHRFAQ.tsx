import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ACCESS_EXPLANATION_ITEMS = [
  {
    title: "Fondasi Absensi",
    description:
      "Tahap ketika struktur kerja, lokasi kerja, jam kerja, batas absen, data pegawai, dan rekam absensi awal sudah mulai siap dipakai sebagai dasar HR.",
  },
  {
    title: "Mode Lihat Saja",
    description:
      "Tahap ketika menu HR sudah bisa dibuka untuk ditinjau, tetapi data belum bisa ditambah atau diubah.",
  },
  {
    title: "Bisa Diedit",
    description:
      "Tahap ketika pengelolaan data HR sudah dibuka penuh, sehingga admin organisasi dapat menambah dan memperbarui data.",
  },
  {
    title: "Langganan Aktif",
    description:
      "Tahap ketika layanan berjalan penuh dan akses fitur organisasi mengikuti paket yang sedang berlaku.",
  },
];

const HR_FAQ_ITEMS = [
  {
    q: "Apa arti Fondasi Absensi pada tahap aktivasi HR?",
    a: "Fondasi Absensi berarti organisasi sudah menyiapkan dasar operasional seperti struktur kerja, lokasi kerja, jam kerja, batas absen, data pegawai, dan rekam absensi awal. Tahap ini penting agar HR dibuka di atas data yang sudah rapi.",
  },
  {
    q: "Apa arti Mode Lihat Saja di workspace HR?",
    a: "Mode Lihat Saja berarti menu HR sudah bisa dibuka untuk dipelajari, tetapi data belum bisa ditambah, diubah, atau diproses penuh. Tahap ini membantu admin organisasi memahami alur sebelum pengelolaan penuh dibuka.",
  },
  {
    q: "Kapan HR bisa diedit penuh oleh admin organisasi?",
    a: "HR dibuka bertahap. Setelah fondasi absensi siap dan organisasi masuk ke tahap aktivasi yang sesuai, admin organisasi dapat melanjutkan ke pengelolaan penuh sesuai kebijakan akses yang berlaku.",
  },
  {
    q: "Kenapa Payroll biasanya belum langsung bisa dipakai penuh?",
    a: "Payroll mengikuti tahap aktivasi yang lebih ketat karena berkaitan dengan periode gaji, validasi, distribusi, dan jejak audit yang sensitif. Karena itu, Payroll umumnya menyusul setelah organisasi benar-benar siap dan langganannya aktif.",
  },
  {
    q: "Bagaimana menambah pegawai baru di area kerja HR?",
    a: "Gunakan menu Data Pegawai, lalu lengkapi data pegawai dari alur HR tanpa pindah ke area kerja Absensi.",
  },
  {
    q: "Bagaimana memeriksa kontrak yang segera berakhir?",
    a: "Buka Laporan HR, lihat metrik Kontrak Berakhir <=30 Hari dan Kontrak Lewat Jatuh Tempo.",
  },
  {
    q: "Bagaimana cara menambah hierarki persetujuan untuk cuti atau WFH?",
    a: "Buka menu Hierarki Persetujuan, klik Tambah Jenis, pilih jenis persetujuan (Cuti, WFH, Lembur, Mutasi), lalu tambahkan level persetujuan dengan menentukan penyetuju (Atasan Langsung, Kepala Bidang, dll) dan SLA per level.",
  },
  {
    q: "Bagaimana cara membuat templat dokumen HR baru?",
    a: "Buka menu Templat Dokumen, klik Tambah Templat, pilih jenis (Kontrak PKWT, SP1, Mutasi, dll), masukkan konten dengan variabel seperti {{nama}}, {{nip}}, {{jabatan}} untuk data yang akan diganti otomatis saat membuat dokumen.",
  },
  {
    q: "Variabel apa saja yang bisa digunakan di templat dokumen?",
    a: "Variabel yang tersedia: {{nama}}, {{nip}}, {{jabatan}}, {{unit_kerja}}, {{tanggal_lahir}}, {{alamat}}, {{tanggal_mulai}}, {{tanggal_selesai}}, {{nomor_surat}}, {{tanggal_surat}}, {{nama_pejabat}}, {{nip_pejabat}}, {{jabatan_pejabat}}.",
  },
  {
    q: "Bagaimana cara filter pegawai berdasarkan status kepegawaian?",
    a: "Buka menu Status Kepegawaian, gunakan daftar filter untuk memilih status (Aktif, Kontrak, Magang, Nonaktif). Anda juga bisa memfilter berdasarkan kategori dan mencari nama/NIP/unit kerja.",
  },
  {
    q: "Bagaimana cara mengekspor data status kepegawaian?",
    a: "Di halaman Status Kepegawaian, klik tombol Ekspor CSV di pojok kanan atas. File akan otomatis terunduh dengan data sesuai filter yang aktif.",
  },
  {
    q: "Bagaimana cara melihat riwayat mutasi jabatan seorang pegawai?",
    a: "Buka menu Riwayat Jabatan, gunakan pencarian untuk mencari nama pegawai. Linimasa mutasi akan menampilkan riwayat promosi, mutasi, atau demosi dengan detail jabatan lama/baru dan tanggal efektif.",
  },
  {
    q: "Bagaimana cara filter riwayat mutasi berdasarkan unit kerja?",
    a: "Di halaman Riwayat Jabatan, gunakan daftar Unit Kerja untuk memfilter mutasi berdasarkan unit tujuan. Anda juga bisa memfilter berdasarkan jenis mutasi (Promosi, Mutasi, Demosi).",
  },
  {
    q: "Bagaimana alur bantuan jika terjadi masalah data HR?",
    a: "Gunakan menu Tiket HR untuk membuat tiket, lalu pantau statusnya di halaman yang sama.",
  },
  {
    q: "Bagaimana melihat riwayat komentar dan perubahan status tiket HR?",
    a: "Buka menu Tiket HR lalu klik tombol Percakapan pada tiket terkait. Di sana tersedia komentar tindak lanjut dan audit perubahan status.",
  },
  {
    q: "Siapa yang boleh membuat, mengubah status, dan mengatur PIC/SLA tiket?",
    a: "Saat ini aksi tulis tiket HR dibatasi untuk role admin organisasi. Role operator dapat memantau tiket untuk kebutuhan koordinasi.",
  },
  {
    q: "Apa yang terjadi jika tiket melewati SLA?",
    a: "Sistem menambahkan audit otomatis untuk tiket overdue: reminder saat melewati 24 jam dan escalation saat melewati 72 jam.",
  },
  {
    q: "Kenapa perubahan data penting HR atau absensi di database tidak boleh langsung dijalankan tanpa backup?",
    a: "Karena database utama repo ini adalah Supabase remote. Sebelum perubahan penting pada schema atau data, lakukan backup SQL lokal lebih dulu agar ada jalur pemulihan bila hasil perubahan tidak sesuai.",
  },
  {
    q: "Apa yang harus dicek sebelum menjalankan test browser atau smoke HR di localhost?",
    a: "Jalankan preflight sandbox doctor terlebih dahulu. Jika environment localhost belum siap, hasil test bisa gagal karena masalah runtime, bukan karena bug fitur.",
  },
  {
    q: "Kapan masalah operasional perlu diarahkan ke tim internal, bukan diselesaikan dari FAQ saja?",
    a: "Arahkan ke tim internal jika masalah menyentuh error ref atau trace, perubahan data tenant spesifik, kebutuhan audit, atau indikasi bug platform yang berulang lintas user atau lintas tenant.",
  },
];

export default function OrgHRFAQ() {
  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Bantuan</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">FAQ HR</h1>
          <p className="text-sm text-muted-foreground">
            Pertanyaan umum untuk operasional HR, termasuk cara membaca tahap akses agar admin organisasi tahu kapan modul hanya bisa ditinjau dan kapan sudah bisa dikelola penuh.
          </p>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Cara membaca tahap akses HR</CardTitle>
            <CardDescription>
              Empat istilah ini paling sering muncul saat organisasi mulai menyiapkan HR di atas fondasi absensi.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {ACCESS_EXPLANATION_ITEMS.map((item) => (
              <div key={item.title} className="rounded-lg border bg-background/90 p-4">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {HR_FAQ_ITEMS.map((item) => (
            <Card key={item.q}>
              <CardHeader>
                <CardTitle className="text-base">{item.q}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{item.a}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </OrganizationLayout>
  );
}
