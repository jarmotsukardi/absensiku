import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Loader2, Plus, RefreshCcw, Search, Ticket } from "lucide-react";
import { toast } from "sonner";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

type FeedbackReportRow = Tables<"feedback_reports">;
type TicketStatus = "all" | "open" | "resolved";
type TicketPriority = "rendah" | "normal" | "tinggi" | "urgent";
type TicketCategory = "teknis" | "akses" | "aplikasi" | "integrasi" | "tagihan" | "lainnya";

interface TicketMeta {
  subject?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
}

interface TicketRecord {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: string;
  message: string;
  resolutionNotes: string | null;
  reporterName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

const DEFAULT_FORM = {
  subject: "",
  category: "teknis" as TicketCategory,
  priority: "normal" as TicketPriority,
  message: "",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  rendah: "Rendah",
  normal: "Normal",
  tinggi: "Tinggi",
  urgent: "Urgent",
};

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  teknis: "Teknis",
  akses: "Akses Akun",
  aplikasi: "Aplikasi",
  integrasi: "Integrasi",
  tagihan: "Tagihan",
  lainnya: "Lainnya",
};

const parseTicketMeta = (value: string | null, fallbackMessage: string): TicketMeta => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as TicketMeta;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    // Backward compatible parser if old format text is found.
    const parts = fallbackMessage.split("\n");
    const subjectLine = parts.find((line) => line.toLowerCase().startsWith("subject:"));
    const categoryLine = parts.find((line) => line.toLowerCase().startsWith("category:"));
    const priorityLine = parts.find((line) => line.toLowerCase().startsWith("priority:"));
    return {
      subject: subjectLine?.split(":")[1]?.trim(),
      category: categoryLine?.split(":")[1]?.trim() as TicketCategory | undefined,
      priority: priorityLine?.split(":")[1]?.trim() as TicketPriority | undefined,
    };
  }
};

const normalizeTicket = (row: FeedbackReportRow): TicketRecord => {
  const meta = parseTicketMeta(row.browser_info, row.message);
  const category = meta.category && meta.category in CATEGORY_LABEL ? meta.category : "lainnya";
  const priority = meta.priority && meta.priority in PRIORITY_LABEL ? meta.priority : "normal";
  const subject = meta.subject?.trim() || "Tiket tanpa judul";
  return {
    id: row.id,
    subject,
    category,
    priority,
    status: row.status || "open",
    message: row.message,
    resolutionNotes: row.resolution_notes,
    reporterName: row.reporter_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
};

const formatTicketCode = (id: string) => `TIK-${id.slice(0, 8).toUpperCase()}`;

const getStatusBadge = (status: string) => {
  if (status === "open") return <Badge variant="outline" className="border-amber-500 text-amber-700">Open</Badge>;
  if (status === "resolved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Resolved</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
};

const getPriorityBadge = (priority: TicketPriority) => {
  if (priority === "urgent") return <Badge variant="destructive">Urgent</Badge>;
  if (priority === "tinggi") return <Badge className="bg-orange-600 hover:bg-orange-600">Tinggi</Badge>;
  if (priority === "normal") return <Badge variant="secondary">Normal</Badge>;
  return <Badge variant="outline">Rendah</Badge>;
};

export default function OrgSupportTickets() {
  const SUPPORT_TICKETS_QUERY_TIMEOUT_MS = 15000;
  const SUPPORT_TICKETS_QUERY_RETRY_MAX = 1;
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TicketStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);

  const fetchTickets = useCallback(async (resolvedTenantId: string) => {
    setIsLoading(true);
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("feedback_reports")
              .select("*")
              .eq("tenant_id", resolvedTenantId)
              .eq("feedback_type", "ticket")
              .eq("reporter_role", "admin_organisasi")
              .order("created_at", { ascending: false }),
            SUPPORT_TICKETS_QUERY_TIMEOUT_MS,
            "org.help.tickets.fetch timeout",
          ),
        {
          maxRetries: SUPPORT_TICKETS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;
      setTickets((data || []).map(normalizeTicket));
    } catch (error) {
      const errorRef = reportError(error, "org.help.tickets.fetch", { tenant_id: resolvedTenantId });
      const message = appendErrorReference("Gagal memuat daftar tiket", errorRef);
      setLoadError(message);
      toast.error(message);
      setTickets([]);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, []);

  const initPage = useCallback(async () => {
      try {
        setLoadError(null);
        setIsRetrying(false);
        const { data: authData, error: authError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.auth.getUser(),
              SUPPORT_TICKETS_QUERY_TIMEOUT_MS,
              "org.help.tickets.init.auth timeout",
            ),
          {
            maxRetries: SUPPORT_TICKETS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (authError) throw authError;
        const currentUserId = authData.user?.id || null;
        setUserId(currentUserId);

        const resolvedTenantId = await withExponentialBackoff(
          () =>
            withTimeout(
              resolveOrgTenantId(),
              SUPPORT_TICKETS_QUERY_TIMEOUT_MS,
              "org.help.tickets.init.resolve_tenant timeout",
            ),
          {
            maxRetries: SUPPORT_TICKETS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (!resolvedTenantId) {
          toast.error("Tenant organisasi tidak ditemukan.");
          setIsLoading(false);
          return;
        }

        try {
          const { data: subscriptionRow, error: subscriptionError } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("subscriptions")
                  .select("status")
                  .eq("tenant_id", resolvedTenantId)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle(),
                SUPPORT_TICKETS_QUERY_TIMEOUT_MS,
                "org.help.tickets.check_subscription timeout",
              ),
            {
              maxRetries: SUPPORT_TICKETS_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            },
          );
          if (subscriptionError) throw subscriptionError;

          if (subscriptionRow?.status !== "active") {
            toast.info("Tiket bantuan hanya untuk organisasi berlangganan aktif. Silakan gunakan FAQ.");
            navigate("/org/help/faq", { replace: true });
            setIsLoading(false);
            return;
          }
        } catch (error) {
          const errorRef = reportError(error, "org.help.tickets.check_subscription", { tenant_id: resolvedTenantId });
          toast.error(appendErrorReference("Gagal memverifikasi langganan. Dialihkan ke FAQ.", errorRef));
          navigate("/org/help/faq", { replace: true });
          setIsLoading(false);
          return;
        }

        setTenantId(resolvedTenantId);
        await fetchTickets(resolvedTenantId);
      } catch (error) {
        const errorRef = reportError(error, "org.help.tickets.init");
        const message = appendErrorReference("Gagal memuat halaman tiket", errorRef);
        setLoadError(message);
        toast.error(message);
        setIsLoading(false);
      } finally {
        setIsRetrying(false);
      }
    }, [fetchTickets, navigate]);

  useEffect(() => {
    void initPage();
  }, [initPage]);

  const filteredTickets = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        ticket.subject.toLowerCase().includes(needle) ||
        ticket.message.toLowerCase().includes(needle) ||
        formatTicketCode(ticket.id).toLowerCase().includes(needle)
      );
    });
  }, [tickets, statusFilter, searchQuery]);

  const handleSubmitTicket = async () => {
    if (!tenantId) {
      toast.error("Tenant organisasi tidak ditemukan.");
      return;
    }
    if (!form.subject.trim() || !form.message.trim()) {
      toast.error("Subjek dan detail tiket wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: authData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            SUPPORT_TICKETS_QUERY_TIMEOUT_MS,
            "org.help.tickets.create.auth timeout",
          ),
        {
          maxRetries: SUPPORT_TICKETS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      const reporterName =
        authData.user?.user_metadata?.full_name ||
        authData.user?.user_metadata?.name ||
        authData.user?.email ||
        "Admin Organisasi";

      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("feedback_reports").insert({
              tenant_id: tenantId,
              user_id: userId,
              reporter_role: "admin_organisasi",
              reporter_name: String(reporterName),
              feedback_type: "ticket",
              status: "open",
              message: form.message.trim(),
              browser_info: JSON.stringify({
                subject: form.subject.trim(),
                category: form.category,
                priority: form.priority,
                source: "org_help_ticket",
              } as TicketMeta),
            }),
            SUPPORT_TICKETS_QUERY_TIMEOUT_MS,
            "org.help.tickets.create.insert timeout",
          ),
        {
          maxRetries: SUPPORT_TICKETS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (error) throw error;

      toast.success("Tiket berhasil dibuat.");
      setForm(DEFAULT_FORM);
      await fetchTickets(tenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.help.tickets.create", {
        tenant_id: tenantId,
        category: form.category,
        priority: form.priority,
      });
      toast.error(appendErrorReference("Gagal membuat tiket", errorRef));
    } finally {
      setIsSubmitting(false);
      setIsRetrying(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Ticket className="h-6 w-6" />
              Buat Tiket Bantuan
            </h1>
            <p className="text-muted-foreground">
              Laporkan kendala dan pantau status penyelesaiannya dalam satu tempat. Tiket otomatis masuk ke dashboard super admin.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => tenantId && fetchTickets(tenantId)}
            disabled={isLoading || !tenantId}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sedang mencoba ulang koneksi data tiket...
          </div>
        )}
        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{loadError}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void initPage()}>
                Coba Lagi
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Form Tiket
            </CardTitle>
            <CardDescription>Isi detail kendala sejelas mungkin agar tim support cepat menindaklanjuti.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="ticket-subject">Subjek</Label>
                <Input
                  id="ticket-subject"
                  value={form.subject}
                  onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                  placeholder="Contoh: Error sinkron absensi harian"
                />
              </div>
              <div className="grid gap-2">
                <Label>Kategori</Label>
                <Select value={form.category} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as TicketCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioritas</Label>
                <Select value={form.priority} onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value as TicketPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 md:col-span-3">
                <Label htmlFor="ticket-message">Detail Kendala</Label>
                <Textarea
                  id="ticket-message"
                  value={form.message}
                  onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                  rows={6}
                  placeholder="Jelaskan langkah kejadian, pesan error, waktu kejadian, dan dampak operasional."
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSubmitTicket} disabled={isSubmitting || !tenantId}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ticket className="mr-2 h-4 w-4" />}
                Kirim Tiket
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Tiket</CardTitle>
            <CardDescription>{filteredTickets.length} tiket ditemukan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari kode tiket, subjek, atau detail..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TicketStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Subjek</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Prioritas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : filteredTickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Belum ada tiket. Buat tiket pertama dari form di atas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-mono text-xs">{formatTicketCode(ticket.id)}</TableCell>
                        <TableCell className="font-medium">{ticket.subject}</TableCell>
                        <TableCell>{CATEGORY_LABEL[ticket.category]}</TableCell>
                        <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                        <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                        <TableCell>{format(new Date(ticket.createdAt), "d MMM yyyy HH:mm", { locale: localeId })}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => setSelectedTicket(ticket)}>
                            Lihat
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_help_center" />
      </div>

      <Dialog open={Boolean(selectedTicket)} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTicket ? `${formatTicketCode(selectedTicket.id)} - ${selectedTicket.subject}` : "Detail Tiket"}</DialogTitle>
            <DialogDescription>
              {selectedTicket
                ? `Dibuat ${format(new Date(selectedTicket.createdAt), "d MMMM yyyy HH:mm", { locale: localeId })}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {getStatusBadge(selectedTicket.status)}
                {getPriorityBadge(selectedTicket.priority)}
                <Badge variant="outline">{CATEGORY_LABEL[selectedTicket.category]}</Badge>
              </div>
              <div className="rounded-md border p-3">
                <p className="font-medium mb-1">Detail Kendala</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{selectedTicket.message}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="font-medium mb-1">Catatan Penyelesaian</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {selectedTicket.resolutionNotes || "Belum ada catatan penyelesaian."}
                </p>
              </div>
              {selectedTicket.resolvedAt && (
                <p className="text-xs text-muted-foreground">
                  Diselesaikan: {format(new Date(selectedTicket.resolvedAt), "d MMM yyyy HH:mm", { locale: localeId })}
                </p>
              )}
            </div>
          )}
          <DialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>
              Pantau status tiket secara berkala di daftar tiket.
            </DialogActionHint>
            <Button variant="outline" className="bg-white" onClick={() => setSelectedTicket(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
