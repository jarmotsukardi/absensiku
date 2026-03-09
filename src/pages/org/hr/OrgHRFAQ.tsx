import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HR_FAQ_ITEMS = [
  {
    q: "Bagaimana menambah pegawai baru di workspace HR?",
    a: "Gunakan menu Data Pegawai HR, lalu lengkapi data pegawai dari alur HR tanpa pindah ke workspace Absensi.",
  },
  {
    q: "Bagaimana memeriksa kontrak yang segera berakhir?",
    a: "Buka Laporan HR, lihat metrik Kontrak Berakhir <=30 Hari dan Kontrak Lewat Jatuh Tempo.",
  },
  {
    q: "Bagaimana alur bantuan jika terjadi masalah data HR?",
    a: "Gunakan menu Bantuan HR untuk membuat tiket, lalu pantau statusnya di Tiket HR.",
  },
  {
    q: "Bagaimana melihat riwayat komentar dan perubahan status tiket HR?",
    a: "Buka menu Tiket HR lalu klik tombol Thread pada tiket terkait. Di sana tersedia komentar tindak lanjut dan audit perubahan status.",
  },
  {
    q: "Siapa yang boleh membuat, mengubah status, dan mengatur PIC/SLA tiket?",
    a: "Saat ini aksi tulis tiket HR dibatasi untuk role admin organisasi. Role operator dapat memantau tiket untuk kebutuhan koordinasi.",
  },
  {
    q: "Apa yang terjadi jika tiket melewati SLA?",
    a: "Sistem menambahkan audit otomatis untuk tiket overdue: reminder saat melewati 24 jam dan escalation saat melewati 72 jam.",
  },
];

export default function OrgHRFAQ() {
  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">HR Help</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">FAQ HR</h1>
          <p className="text-sm text-muted-foreground">
            Pertanyaan umum untuk operasional HR tanpa perlu keluar dari workspace HR.
          </p>
        </div>

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
