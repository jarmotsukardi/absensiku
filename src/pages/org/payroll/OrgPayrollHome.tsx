import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const PAYROLL_MVP_MENUS = [
  { title: "Dashboard Payroll", path: "/org/payroll", phase: 1, desc: "Ringkasan KPI payroll lintas status periode." },
  { title: "Master Karyawan Payroll", path: "/org/payroll/employees", phase: 1, desc: "Kelola data payroll pegawai (bank, NPWP, PTKP)." },
  { title: "Struktur Organisasi & Grade", path: "/org/payroll/org-grade", phase: 4, desc: "Grade payroll dan baseline skala gaji." },
  { title: "Komponen Penghasilan", path: "/org/payroll/income-components", phase: 1, desc: "Komponen fixed, variable, dan formula income." },
  { title: "Komponen Potongan", path: "/org/payroll/deduction-components", phase: 1, desc: "Potongan BPJS, PPh21, pinjaman, dan denda." },
  { title: "Kebijakan Payroll", path: "/org/payroll/policies", phase: 1, desc: "Cutoff, prorata, pembulatan, dan aturan lembur." },
  { title: "Periode Payroll", path: "/org/payroll/periods", phase: 1, desc: "Buka, lock, review, approve, dan close periode." },
  { title: "Input Variabel Bulanan", path: "/org/payroll/variable-input", phase: 2, desc: "Input bonus/lembur/koreksi bulanan." },
  { title: "Validasi & Rekonsiliasi", path: "/org/payroll/validation", phase: 2, desc: "Deteksi error sebelum payroll run." },
  { title: "Proses Payroll (Run Engine)", path: "/org/payroll/run-engine", phase: 2, desc: "Simulasi dan eksekusi payroll run." },
  { title: "Approval Payroll", path: "/org/payroll/approval", phase: 2, desc: "Approval berlapis HR -> Finance -> Pimpinan." },
  { title: "Slip Gaji & Distribusi", path: "/org/payroll/slips", phase: 3, desc: "Generate slip PDF dan distribusi ke pegawai." },
  { title: "Pembayaran & Bank File", path: "/org/payroll/payment", phase: 3, desc: "Export bank file dan rekonsiliasi pembayaran." },
  { title: "Pajak & Kepatuhan", path: "/org/payroll/tax-compliance", phase: 4, desc: "Rekap PPh21/BPJS dan data pelaporan." },
  { title: "Laporan & Analitik", path: "/org/payroll/reports", phase: 3, desc: "Analitik biaya payroll lintas unit/periode." },
  { title: "Audit Log Payroll", path: "/org/payroll/audit-log", phase: 3, desc: "Trace aksi kritikal payroll by user dan waktu." },
  { title: "Log Error Payroll", path: "/org/payroll/error-log", phase: 3, desc: "Monitoring error payroll realtime berbasis ref/trace." },
  { title: "Role & Permission Payroll", path: "/org/payroll/roles", phase: 4, desc: "Kontrol akses granular fitur payroll." },
  { title: "Integrasi", path: "/org/payroll/integrations", phase: 4, desc: "Integrasi absensi, akuntansi, bank, dan webhook." },
];

export default function OrgPayrollHome() {
  const navigate = useNavigate();

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Payroll</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Fondasi modul payroll organisasi. Tahap ini adalah scaffold menu sebagai baseline implementasi.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Blueprint Menu Payroll</CardTitle>
            <CardDescription>
              Semua menu payroll sudah dipetakan sesuai fase implementasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PAYROLL_MVP_MENUS.map((item) => (
              <button
                type="button"
                key={item.title}
                onClick={() => navigate(item.path)}
                className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    Phase {item.phase}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/org/payroll/policies")}>Kebijakan Payroll</Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/periods")}>
            Periode Payroll
          </Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/validation")}>
            Validasi Payroll
          </Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/run-engine")}>
            Run Engine
          </Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/reports")}>
            Laporan Payroll
          </Button>
          <Button variant="outline" onClick={() => navigate("/org/payroll/error-log")}>
            Log Error
          </Button>
          <Button variant="ghost" onClick={() => navigate("/org/payroll/integrations")}>
            Integrasi
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </OrganizationLayout>
  );
}
