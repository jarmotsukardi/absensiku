import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Briefcase, CheckCircle2, FolderOpen, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

type PayrollHomeItem = {
  title: string;
  path: string;
  badge: string;
  description: string;
};

type PayrollHomeSection = {
  title: string;
  description: string;
  icon: React.ElementType;
  items: PayrollHomeItem[];
};

const PAYROLL_HOME_SECTIONS: PayrollHomeSection[] = [
  {
    title: "Inti",
    description: "Alur utama payroll sederhana yang dipakai dari awal sampai laporan ringkas.",
    icon: CheckCircle2,
    items: [
      {
        title: "Beranda Payroll",
        path: "/org/payroll",
        badge: "Inti",
        description: "Ringkasan langkah kerja payroll dan fokus periode berjalan.",
      },
      {
        title: "Kebijakan Payroll",
        path: "/org/payroll/policies",
        badge: "Inti",
        description: "Atur cutoff, prorata, pembulatan, dan aturan dasar payroll.",
      },
      {
        title: "Periode Payroll",
        path: "/org/payroll/periods",
        badge: "Inti",
        description: "Buka dan kelola siklus payroll bulanan.",
      },
      {
        title: "Input Variabel",
        path: "/org/payroll/variable-input",
        badge: "Inti",
        description: "Masukkan bonus, koreksi, dan penyesuaian non-rutin.",
      },
      {
        title: "Validasi Payroll",
        path: "/org/payroll/validation",
        badge: "Inti",
        description: "Periksa kesiapan data sebelum proses payroll dijalankan.",
      },
      {
        title: "Proses Payroll",
        path: "/org/payroll/run-engine",
        badge: "Inti",
        description: "Jalankan simulasi dan proses payroll sederhana.",
      },
      {
        title: "Persetujuan Payroll",
        path: "/org/payroll/approval",
        badge: "Inti",
        description: "Gunakan persetujuan satu tahap untuk hasil payroll awal.",
      },
      {
        title: "Laporan Payroll",
        path: "/org/payroll/reports",
        badge: "Inti",
        description: "Lihat hasil ringkas payroll per periode.",
      },
    ],
  },
  {
    title: "Referensi",
    description: "Data sumber dari HR ditampilkan sebagai acuan, bukan master payroll baru.",
    icon: FolderOpen,
    items: [
      {
        title: "Data Pegawai Payroll",
        path: "/org/payroll/employees",
        badge: "Referensi HR",
        description: "Lihat kesiapan data pegawai untuk proses payroll.",
      },
      {
        title: "Struktur Organisasi dan Grade",
        path: "/org/payroll/org-grade",
        badge: "Referensi HR",
        description: "Gunakan struktur dan grade dari HR sebagai konteks payroll.",
      },
    ],
  },
  {
    title: "Lanjutan",
    description: "Tetap terlihat di sidebar, tetapi belum menjadi fokus pengerjaan awal.",
    icon: Briefcase,
    items: [
      {
        title: "Komponen Penghasilan",
        path: "/org/payroll/income-components",
        badge: "Lanjutan",
        description: "Pengembangan setelah alur inti payroll stabil.",
      },
      {
        title: "Komponen Potongan",
        path: "/org/payroll/deduction-components",
        badge: "Lanjutan",
        description: "Disiapkan untuk tahap lanjutan setelah kebutuhan inti aman.",
      },
      {
        title: "Slip Gaji",
        path: "/org/payroll/slips",
        badge: "Ditunda",
        description: "Belum menjadi prioritas pada payroll sederhana tahap awal.",
      },
      {
        title: "Pembayaran Payroll",
        path: "/org/payroll/payment",
        badge: "Ditunda",
        description: "Dikerjakan setelah proses payroll inti cukup stabil.",
      },
      {
        title: "Pajak dan Kepatuhan",
        path: "/org/payroll/tax-compliance",
        badge: "Ditunda",
        description: "Ditunda sampai payroll dasar benar-benar siap dipakai.",
      },
      {
        title: "Log Audit Payroll",
        path: "/org/payroll/audit-log",
        badge: "Ditunda",
        description: "Diprioritaskan setelah progres payroll melewati 75%.",
      },
      {
        title: "Log Error Payroll",
        path: "/org/payroll/error-log",
        badge: "Ditunda",
        description: "Diaktifkan mendekati 75% untuk mempercepat triase error aktif.",
      },
      {
        title: "Integrasi Payroll",
        path: "/org/payroll/integrations",
        badge: "Ditunda",
        description: "Belum menjadi target aktif pada fase awal.",
      },
    ],
  },
  {
    title: "Pengaturan",
    description: "Kontrol akses dan bantuan kerja payroll.",
    icon: Settings,
    items: [
      {
        title: "Hak Akses Payroll",
        path: "/org/payroll/roles",
        badge: "Inti",
        description: "Atur siapa yang boleh melihat, memproses, dan menyetujui payroll.",
      },
      {
        title: "Bantuan Payroll",
        path: "/org/payroll/help",
        badge: "Info",
        description: "Bantuan singkat saat tim membutuhkan arahan penggunaan payroll.",
      },
    ],
  },
];

const QUICK_ACTIONS = [
  { title: "Kebijakan Payroll", path: "/org/payroll/policies" },
  { title: "Periode Payroll", path: "/org/payroll/periods" },
  { title: "Input Variabel", path: "/org/payroll/variable-input" },
  { title: "Validasi Payroll", path: "/org/payroll/validation" },
  { title: "Proses Payroll", path: "/org/payroll/run-engine" },
  { title: "Laporan Payroll", path: "/org/payroll/reports" },
];

export default function OrgPayrollHome() {
  const navigate = useNavigate();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Inti</Badge>
            <Badge variant="outline">Beranda Payroll</Badge>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Beranda Payroll</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Payroll sederhana dimulai dari alur inti: kebijakan, periode, input variabel, validasi,
              proses, persetujuan, lalu laporan ringkas.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Urutan kerja yang disarankan</CardTitle>
            <CardDescription>
              Fokuskan penggunaan payroll pada tahapan inti. Menu referensi dan lanjutan tetap tersedia,
              tetapi bukan pusat kerja awal.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {QUICK_ACTIONS.map((item, index) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Badge variant="secondary" className="text-[10px]">
                    Langkah {index + 1}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{item.title}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {PAYROLL_HOME_SECTIONS.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/30">
                    <section.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle>{section.title}</CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.items.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="flex w-full items-start justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{item.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {item.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/org/payroll/policies")}>Mulai dari Kebijakan Payroll</Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/roles")}>
            Buka Hak Akses Payroll
          </Button>
          <Button variant="ghost" onClick={() => navigate("/org/payroll/help")}>
            Bantuan Payroll
          </Button>
        </div>

        <OrgPayrollPageGuide pathname="/org/payroll" />
      </div>
    </OrganizationLayout>
  );
}
