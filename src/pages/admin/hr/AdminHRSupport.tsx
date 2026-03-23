import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, LifeBuoy, ShieldCheck, Ticket } from "lucide-react";
import { toast } from "sonner";

type SupportStats = {
  openTickets: number;
  inProgressTickets: number;
  overdueEvents24h: number;
  criticalErrors24h: number;
};

const INITIAL_STATS: SupportStats = {
  openTickets: 0,
  inProgressTickets: 0,
  overdueEvents24h: 0,
  criticalErrors24h: 0,
};

const ESCALATION_PLAYBOOK = [
  {
    title: "Triase Awal",
    owner: "Dukungan HR",
    checks: [
      "Kumpulkan tenant, rute, error_ref/trace_id, dan dampak bisnis.",
      "Pisahkan isu konfigurasi tenant vs indikasi bug sistem lintas tenant.",
      "Cocokkan dulu dengan FAQ HR dan tiket serupa yang masih terbuka.",
    ],
  },
  {
    title: "Eskalasi Operasional",
    owner: "Lead Dukungan / Admin HR",
    checks: [
      "Naikkan prioritas jika tiket menyentuh kontrak, approval, dokumen legal, atau status kepegawaian.",
      "Gunakan audit HR untuk cek pola lintas tenant sebelum menyimpulkan akar masalah.",
      "Pastikan setiap pindah status tiket menyimpan PIC, catatan tindak lanjut, dan SLA target.",
    ],
  },
  {
    title: "Eskalasi Engineering",
    owner: "Engineering",
    checks: [
      "Lampirkan error_ref, rute sumber, tenant terdampak, dan langkah reproduksi.",
      "Cantumkan apakah masalah hanya muncul di satu tenant atau lintas tenant.",
      "Tutup loop ke tim dukungan setelah perbaikan dengan referensi perubahan atau RCA singkat.",
    ],
  },
];

const INCIDENT_SEVERITY = [
  {
    level: "P1",
    label: "Kritis Multi-Tenant",
    note: "Banyak tenant terdampak, error kritis berulang, atau rute HR utama tidak bisa dipakai.",
    action: "Eskalasi segera ke engineering dan pantau audit/error log setiap saat.",
  },
  {
    level: "P2",
    label: "Kritis Single Tenant",
    note: "Satu tenant terdampak pada workflow penting seperti kontrak, approval, atau dokumen.",
    action: "Koordinasikan dengan admin tenant, buka tiket rinci, dan siapkan bukti error_ref.",
  },
  {
    level: "P3",
    label: "Operasional Non-Kritis",
    note: "Dampak terbatas, ada solusi sementara, atau hanya perlu koreksi konfigurasi/kebijakan.",
    action: "Tangani di dukungan HR dengan FAQ, pengaturan, atau tindak lanjut tenant.",
  },
];

export default function AdminHRSupport() {
  const [stats, setStats] = useState<SupportStats>(INITIAL_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [openRes, progressRes, auditRes, errorsRes] = await Promise.all([
        supabase
          .from("feedback_reports")
          .select("id", { count: "exact", head: true })
          .eq("feedback_type", "ticket")
          .eq("reporter_role", "admin_organisasi")
          .eq("status", "open"),
        supabase
          .from("feedback_reports")
          .select("id", { count: "exact", head: true })
          .eq("feedback_type", "ticket")
          .eq("reporter_role", "admin_organisasi")
          .eq("status", "in_progress"),
        supabase
          .from("hr_ticket_status_audits")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayAgoIso)
          .or("to_status.eq.overdue,note.ilike.%overdue%,note.ilike.%escalat%,note.ilike.%sla%"),
        supabase
          .from("client_error_logs")
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", dayAgoIso)
          .ilike("context", "org.hr.%")
          .eq("is_non_critical", false)
          .eq("is_resolved", false)
          .eq("is_archived", false),
      ]);

      const error = openRes.error || progressRes.error || auditRes.error || errorsRes.error;
      if (error) throw error;

      setStats({
        openTickets: openRes.count ?? 0,
        inProgressTickets: progressRes.count ?? 0,
        overdueEvents24h: auditRes.count ?? 0,
        criticalErrors24h: errorsRes.count ?? 0,
      });
      setLastUpdatedAt(new Date());
    } catch (error) {
      const ref = reportError(error, "admin.hr.support.stats");
      toast.error(appendErrorReference("Gagal memuat statistik dukungan HR", ref));
      setStats(INITIAL_STATS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const prioritySignal = useMemo(() => {
    if (stats.criticalErrors24h > 0) {
      return {
        badge: "Kritis",
        title: "Perlu fokus ke error kritis HR",
        description: `${stats.criticalErrors24h} error kritis terbuka dalam 24 jam. Tinjau log error dan audit sebelum menutup tiket.`,
      };
    }
    if (stats.overdueEvents24h > 0) {
      return {
        badge: "SLA",
        title: "Ada sinyal pelanggaran SLA",
        description: `${stats.overdueEvents24h} event lewat SLA/eskalasi tercatat dalam 24 jam. Sinkronkan prioritas tim dukungan.`,
      };
    }
    return {
      badge: "Stabil",
      title: "Belum ada sinyal eskalasi tinggi",
      description: "Gunakan ruang ini untuk menjaga SOP tetap konsisten dan memperkaya FAQ sebelum antrean meningkat.",
    };
  }, [stats]);

  return (
    <AdminHRPageShell
      title="Dukungan HR Global"
      subtitle="Panduan troubleshooting dukungan HR"
      description="Panduan dukungan untuk insiden, tiket, dan eskalasi HR lintas tenant agar triase dukungan tetap seragam dan dapat diaudit."
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard title="Tiket Terbuka" value={stats.openTickets} note="Menunggu triase atau tindak lanjut." icon={Ticket} />
          <MetricCard title="Sedang Diproses" value={stats.inProgressTickets} note="Antrean aktif dukungan HR." icon={LifeBuoy} />
          <MetricCard title="Event SLA 24 Jam" value={stats.overdueEvents24h} note="Pengingat/eskalasi terlambat." icon={AlertTriangle} />
          <MetricCard title="Error Kritis 24 Jam" value={stats.criticalErrors24h} note="Belum selesai dan belum diarsipkan." icon={ShieldCheck} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Badge variant="outline">{prioritySignal.badge}</Badge>
                <CardTitle className="mt-2">{prioritySignal.title}</CardTitle>
                <CardDescription>{prioritySignal.description}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/hr/help/tickets">Buka Tiket HR</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/hr/error-logs">Buka Log Error HR</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/admin/hr/audit">Buka Audit HR</Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memuat statistik..." : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Panduan Eskalasi</CardTitle>
              <CardDescription>Urutan kerja minimal agar tiket HR tidak berhenti di respons tekstual tanpa bukti.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ESCALATION_PLAYBOOK.map((section) => (
                <div key={section.title} className="rounded-lg border p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="font-medium">{section.title}</p>
                    <Badge variant="outline">{section.owner}</Badge>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {section.checks.map((check) => (
                      <p key={check}>{check}</p>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Matriks Prioritas Insiden</CardTitle>
              <CardDescription>Tentukan tingkat keparahan lebih dulu sebelum memutuskan apakah cukup di dukungan atau perlu engineering.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {INCIDENT_SEVERITY.map((item) => (
                <div key={item.level} className="rounded-lg border p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant={item.level === "P1" ? "destructive" : item.level === "P2" ? "secondary" : "outline"}>
                      {item.level}
                    </Badge>
                    <p className="font-medium">{item.label}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.note}</p>
                  <p className="mt-2 text-sm">{item.action}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Jalur Navigasi Dukungan</CardTitle>
            <CardDescription>Gunakan jalur ini agar investigasi berjalan runtut dan setiap keputusan mudah dilacak kembali.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <ActionCard
              title="FAQ Dukungan HR"
              description="Mulai dari jawaban standar agar respons dukungan konsisten."
              path="/admin/hr/help/faq"
              cta="Buka FAQ"
            />
            <ActionCard
              title="Tiket HR"
              description="Lanjut ke tiket jika perlu PIC, SLA, komentar, dan jejak status."
              path="/admin/hr/help/tickets"
              cta="Buka Tiket"
            />
            <ActionCard
              title="Audit & Log Error"
              description="Naikkan ke audit/error log untuk kasus lintas tenant atau error kritis."
              path="/admin/hr/audit"
              cta="Buka Audit"
            />
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: number;
  note: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  title,
  description,
  path,
  cta,
}: {
  title: string;
  description: string;
  path: string;
  cta: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full justify-start">
          <Link to={path}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
