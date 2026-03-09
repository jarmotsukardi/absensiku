import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Search, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { sanitizeOrKeyword } from "@/lib/postgrestSearch";
import {
  DEFAULT_HR_TICKET_POLICY_SETTINGS,
  HR_TICKET_POLICY_DEFAULTS_KEY,
  HR_TICKET_POLICY_SETTING_KEY,
  canRolePerform,
  normalizeHrTicketPolicySettings,
  type HrTicketPolicySettings,
  type HrTicketRole,
} from "@/lib/hrTicketPolicySettings";

type TicketRow = Database["public"]["Tables"]["feedback_reports"]["Row"];
type HrTicketCommentRow = Database["public"]["Tables"]["hr_ticket_comments"]["Row"];
type HrTicketStatusAuditRow = Database["public"]["Tables"]["hr_ticket_status_audits"]["Row"];
type TicketStatus = "all" | "open" | "in_progress" | "resolved";
type Priority = "rendah" | "normal" | "tinggi" | "urgent";
type Category = "teknis" | "akses" | "data" | "kontrak" | "dokumen" | "lainnya";

type TicketMeta = {
  subject?: string;
  category?: Category;
  priority?: Priority;
  reference?: string;
  assignee_name?: string;
  due_date?: string;
  sla_hours?: number;
  comments?: TicketComment[];
  status_history?: TicketStatusAudit[];
};

type TicketComment = {
  id: string;
  message: string;
  author: string;
  created_at: string;
};

type TicketStatusAudit = {
  id: string;
  from_status: string;
  to_status: string;
  actor: string;
  at: string;
  note?: string;
};

type TicketFormState = {
  subject: string;
  category: Category;
  priority: Priority;
  reference: string;
  assignee_name: string;
  due_date: string;
  sla_hours: string;
  message: string;
};

const createInitialFormState = (defaultSlaHours: number): TicketFormState => ({
  subject: "",
  category: "teknis",
  priority: "normal",
  reference: "",
  assignee_name: "",
  due_date: "",
  sla_hours: String(defaultSlaHours),
  message: "",
});

const toTicketCode = (id: string) => `HR-TIK-${id.slice(0, 8).toUpperCase()}`;

const parseMeta = (value: string | null): TicketMeta => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as TicketMeta;
    if (!parsed || typeof parsed !== "object") return {};
    const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    const statusHistory = Array.isArray(parsed.status_history) ? parsed.status_history : [];
    return {
      ...parsed,
      comments,
      status_history: statusHistory,
    };
  } catch {
    return {};
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const priorityBadge = (priority: Priority) => {
  if (priority === "urgent") return <Badge variant="destructive">Urgent</Badge>;
  if (priority === "tinggi") return <Badge className="bg-orange-600 hover:bg-orange-600">Tinggi</Badge>;
  if (priority === "normal") return <Badge variant="secondary">Normal</Badge>;
  return <Badge variant="outline">Rendah</Badge>;
};

const formatSla = (meta: TicketMeta) => {
  if (meta.due_date) return meta.due_date;
  if (meta.sla_hours && Number.isFinite(meta.sla_hours)) return `${meta.sla_hours} jam`;
  return "-";
};

const isNetworkFetchFailure = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? `${error.name || ""} ${error.message || ""}`.toLowerCase()
      : String(error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed")
  );
};

const isSlaOverdue = (status: string, meta: TicketMeta) => {
  if (status === "resolved" || !meta.due_date) return false;
  const due = new Date(`${meta.due_date}T23:59:59`);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
};

const buildLegacyThreadMaps = (tickets: TicketRow[]) => {
  const commentsByTicketId: Record<string, TicketComment[]> = {};
  const auditsByTicketId: Record<string, TicketStatusAudit[]> = {};

  tickets.forEach((ticket) => {
    const meta = parseMeta(ticket.browser_info);
    commentsByTicketId[ticket.id] = Array.isArray(meta.comments) ? meta.comments : [];
    auditsByTicketId[ticket.id] = Array.isArray(meta.status_history) ? meta.status_history : [];
  });

  return { commentsByTicketId, auditsByTicketId };
};

export default function OrgHRTickets() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [commentsByTicketId, setCommentsByTicketId] = useState<Record<string, TicketComment[]>>({});
  const [auditsByTicketId, setAuditsByTicketId] = useState<Record<string, TicketStatusAudit[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [ticketRole, setTicketRole] = useState<HrTicketRole>("operator");
  const [ticketPolicy, setTicketPolicy] = useState<HrTicketPolicySettings>(DEFAULT_HR_TICKET_POLICY_SETTINGS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TicketStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [assignmentTicket, setAssignmentTicket] = useState<TicketRow | null>(null);
  const [assignmentPic, setAssignmentPic] = useState("");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [assignmentSlaHours, setAssignmentSlaHours] = useState(
    String(DEFAULT_HR_TICKET_POLICY_SETTINGS.defaultSlaHours),
  );
  const [formState, setFormState] = useState<TicketFormState>(
    createInitialFormState(DEFAULT_HR_TICKET_POLICY_SETTINGS.defaultSlaHours),
  );
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyTicket, setHistoryTicket] = useState<TicketRow | null>(null);
  const [commentInput, setCommentInput] = useState("");

  const loadTicketPolicy = useCallback(async (resolvedTenantId: string) => {
    try {
      const [{ data: tenantPolicyRow, error: tenantPolicyError }, { data: globalPolicyRow, error: globalPolicyError }] =
        await Promise.all([
          supabase
            .from("organization_settings")
            .select("setting_value")
            .eq("tenant_id", resolvedTenantId)
            .eq("setting_key", HR_TICKET_POLICY_SETTING_KEY)
            .maybeSingle(),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", HR_TICKET_POLICY_DEFAULTS_KEY)
            .maybeSingle(),
        ]);
      if (tenantPolicyError && tenantPolicyError.code !== "PGRST116") throw tenantPolicyError;
      if (globalPolicyError && globalPolicyError.code !== "PGRST116") throw globalPolicyError;

      const fallback = normalizeHrTicketPolicySettings(globalPolicyRow?.value);
      const resolved = tenantPolicyRow?.setting_value
        ? normalizeHrTicketPolicySettings(tenantPolicyRow.setting_value)
        : fallback;
      setTicketPolicy(resolved);
      setAssignmentSlaHours(String(resolved.defaultSlaHours));
      setFormState((prev) => {
        if (prev.sla_hours.trim() && Number(prev.sla_hours) > 0) return prev;
        return { ...prev, sla_hours: String(resolved.defaultSlaHours) };
      });
    } catch (error) {
      const ref = reportError(error, "org.hr.tickets.policy.load");
      toast.error(appendErrorReference("Gagal memuat policy tiket HR, fallback default diterapkan", ref));
      setTicketPolicy(DEFAULT_HR_TICKET_POLICY_SETTINGS);
    }
  }, []);

  const getActorName = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return (
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      "Admin Organisasi"
    );
  }, []);

  const loadAccessLevel = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setTicketRole("operator");
        return;
      }
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["super_admin", "admin_instansi", "atasan"]);
      if (error) throw error;
      const roles = (roleRows || []).map((row) => row.role);
      if (roles.includes("super_admin")) {
        setTicketRole("super_admin");
      } else if (roles.includes("admin_instansi")) {
        setTicketRole("admin_instansi");
      } else if (roles.includes("atasan")) {
        setTicketRole("atasan");
      } else {
        setTicketRole("operator");
      }
    } catch {
      setTicketRole("operator");
    }
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);
      await loadTicketPolicy(resolvedTenantId);

      const { error: slaAutomationError } = await supabase.rpc("hr_ticket_run_sla_automation", {
        p_tenant_id: resolvedTenantId,
      });
      if (slaAutomationError) {
        reportError(slaAutomationError, "org.hr.tickets.sla_automation");
      }

      let query = supabase
        .from("feedback_reports")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .eq("feedback_type", "ticket")
        .eq("reporter_role", "admin_organisasi")
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      const keyword = sanitizeOrKeyword(searchTerm).toLowerCase();
      const normalizeSearchValue = (value: string | null | undefined) =>
        sanitizeOrKeyword(value || "").toLowerCase();
      const ticketRows = (data || []).filter((item) => {
        if (!keyword) return true;
        const meta = parseMeta(item.browser_info);
        return [
          normalizeSearchValue(item.message),
          normalizeSearchValue(item.reporter_name),
          normalizeSearchValue(item.resolution_notes),
          normalizeSearchValue(meta.subject),
        ].some((value) => value.includes(keyword));
      });
      setRows(ticketRows);

      if (ticketRows.length === 0) {
        setCommentsByTicketId({});
        setAuditsByTicketId({});
        return;
      }

      const ticketIds = ticketRows.map((item) => item.id);
      const legacyMaps = buildLegacyThreadMaps(ticketRows);

      const [commentRes, auditRes] = await Promise.all([
        supabase
          .from("hr_ticket_comments")
          .select("id, ticket_id, message, author_name, created_at")
          .in("ticket_id", ticketIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("hr_ticket_status_audits")
          .select("id, ticket_id, from_status, to_status, actor_name, note, created_at")
          .in("ticket_id", ticketIds)
          .order("created_at", { ascending: true }),
      ]);

      if (commentRes.error || auditRes.error) {
        setCommentsByTicketId(legacyMaps.commentsByTicketId);
        setAuditsByTicketId(legacyMaps.auditsByTicketId);
        return;
      }

      const commentsMap: Record<string, TicketComment[]> = {};
      (commentRes.data as HrTicketCommentRow[]).forEach((item) => {
        if (!commentsMap[item.ticket_id]) commentsMap[item.ticket_id] = [];
        commentsMap[item.ticket_id].push({
          id: item.id,
          message: item.message,
          author: item.author_name,
          created_at: item.created_at,
        });
      });

      const auditsMap: Record<string, TicketStatusAudit[]> = {};
      (auditRes.data as HrTicketStatusAuditRow[]).forEach((item) => {
        if (!auditsMap[item.ticket_id]) auditsMap[item.ticket_id] = [];
        auditsMap[item.ticket_id].push({
          id: item.id,
          from_status: item.from_status,
          to_status: item.to_status,
          actor: item.actor_name,
          at: item.created_at,
          note: item.note || undefined,
        });
      });

      setCommentsByTicketId({ ...legacyMaps.commentsByTicketId, ...commentsMap });
      setAuditsByTicketId({ ...legacyMaps.auditsByTicketId, ...auditsMap });
    } catch (error) {
      if (isNetworkFetchFailure(error)) {
        toast.warning("Koneksi jaringan tidak stabil. Daftar tiket HR belum dapat dimuat.");
      } else {
        const ref = reportError(error, "org.hr.tickets.fetch");
        toast.error(appendErrorReference("Gagal memuat tiket HR", ref));
      }
      setRows([]);
      setCommentsByTicketId({});
      setAuditsByTicketId({});
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, searchTerm, loadTicketPolicy]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    void loadAccessLevel();
  }, [loadAccessLevel]);

  const metrics = useMemo(() => {
    const open = rows.filter((item) => item.status === "open").length;
    const inProgress = rows.filter((item) => item.status === "in_progress").length;
    const resolved = rows.filter((item) => item.status === "resolved").length;
    const overdue = rows.filter((item) => {
      const meta = parseMeta(item.browser_info);
      return isSlaOverdue(item.status, meta);
    }).length;
    return {
      total: rows.length,
      open,
      inProgress,
      resolved,
      overdue,
    };
  }, [rows]);

  const getTicketComments = useCallback(
    (item: TicketRow) => commentsByTicketId[item.id] || [],
    [commentsByTicketId],
  );

  const getTicketAudits = useCallback(
    (item: TicketRow) => auditsByTicketId[item.id] || [],
    [auditsByTicketId],
  );

  const canCreateTicket = canRolePerform(ticketPolicy, ticketRole, "create");
  const canAssignTicket = canRolePerform(ticketPolicy, ticketRole, "assign");
  const canCommentTicket = canRolePerform(ticketPolicy, ticketRole, "comment");
  const canTakeTicket = canRolePerform(ticketPolicy, ticketRole, "take");
  const canResolveTicket = canRolePerform(ticketPolicy, ticketRole, "resolve");
  const canReopenTicket = canRolePerform(ticketPolicy, ticketRole, "reopen");

  const roleLabel = useMemo(() => {
    if (ticketRole === "super_admin") return "Super Admin";
    if (ticketRole === "admin_instansi") return "Admin";
    if (ticketRole === "atasan") return "Operator";
    return "Operator (Read-only)";
  }, [ticketRole]);

  const handleCreateTicket = async () => {
    if (!canCreateTicket) {
      toast.error("Akses ditolak. Hanya admin organisasi yang dapat membuat tiket HR.");
      return;
    }
    if (!formState.subject.trim() || !formState.message.trim()) {
      toast.error("Subjek dan detail tiket wajib diisi.");
      return;
    }
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const reporterName = await getActorName();

      const slaHours = Number(formState.sla_hours);
      const metadata: TicketMeta = {
        subject: formState.subject.trim(),
        category: formState.category,
        priority: formState.priority,
        reference: formState.reference.trim() || undefined,
        assignee_name: formState.assignee_name.trim() || undefined,
        due_date: formState.due_date || undefined,
        sla_hours: Number.isFinite(slaHours) && slaHours > 0 ? slaHours : undefined,
      };

      const { data: createdTicket, error } = await supabase
        .from("feedback_reports")
        .insert({
          tenant_id: resolvedTenantId,
          user_id: user?.id || null,
          reporter_role: "admin_organisasi",
          reporter_name: String(reporterName),
          feedback_type: "ticket",
          status: "open",
          message: formState.message.trim(),
          browser_info: JSON.stringify(metadata),
        })
        .select("id, tenant_id, status")
        .single();
      if (error) throw error;

      if (createdTicket?.tenant_id) {
        const { error: auditError } = await supabase.from("hr_ticket_status_audits").insert({
          ticket_id: createdTicket.id,
          tenant_id: createdTicket.tenant_id,
          from_status: "open",
          to_status: "open",
          actor_name: reporterName,
          actor_user_id: user?.id || null,
          note: "Tiket dibuat",
        });
        if (auditError) {
          const ref = reportError(auditError, "org.hr.tickets.create.audit");
          toast.error(appendErrorReference("Tiket dibuat, tetapi audit awal gagal dicatat.", ref));
        }
      }

      toast.success("Tiket HR berhasil dibuat.");
      setFormState(createInitialFormState(ticketPolicy.defaultSlaHours));
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.tickets.create");
      toast.error(appendErrorReference("Gagal membuat tiket HR", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (item: TicketRow, nextStatus: "open" | "in_progress" | "resolved") => {
    const isAllowed =
      (nextStatus === "in_progress" && canTakeTicket) ||
      (nextStatus === "resolved" && canResolveTicket) ||
      (nextStatus === "open" && canReopenTicket);
    if (!isAllowed) {
      toast.error("Akses ditolak untuk perubahan status tiket ini.");
      return;
    }
    try {
      const actorName = await getActorName();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload: Database["public"]["Tables"]["feedback_reports"]["Update"] = {
        status: nextStatus,
        resolved_at: nextStatus === "resolved" ? new Date().toISOString() : null,
        resolved_by: nextStatus === "resolved" ? user?.id || null : null,
      };
      const { error } = await supabase
        .from("feedback_reports")
        .update(payload)
        .eq("id", item.id);
      if (error) throw error;

      if (item.tenant_id) {
        const { error: auditError } = await supabase.from("hr_ticket_status_audits").insert({
          ticket_id: item.id,
          tenant_id: item.tenant_id,
          from_status: item.status,
          to_status: nextStatus,
          actor_name: actorName,
          actor_user_id: user?.id || null,
          note: `Status diubah ke ${nextStatus}`,
        });
        if (auditError) {
          const ref = reportError(auditError, "org.hr.tickets.update_status.audit");
          toast.error(appendErrorReference("Status berubah, tetapi audit gagal dicatat.", ref));
        }
      }

      toast.success(`Status tiket diperbarui ke ${nextStatus}.`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.tickets.update_status");
      toast.error(appendErrorReference("Gagal memperbarui status tiket HR", ref));
    }
  };

  const openAssignmentDialog = (item: TicketRow) => {
    const meta = parseMeta(item.browser_info);
    setAssignmentTicket(item);
    setAssignmentPic(meta.assignee_name || "");
    setAssignmentDueDate(meta.due_date || "");
    setAssignmentSlaHours(meta.sla_hours ? String(meta.sla_hours) : String(ticketPolicy.defaultSlaHours));
    setIsAssignmentDialogOpen(true);
  };

  const saveAssignment = async () => {
    if (!canAssignTicket) {
      toast.error("Akses ditolak. Hanya admin organisasi yang dapat mengubah PIC/SLA tiket.");
      return;
    }
    if (!assignmentTicket) return;
    try {
      setIsSubmitting(true);
      const meta = parseMeta(assignmentTicket.browser_info);
      const parsedSlaHours = Number(assignmentSlaHours);
      const actorName = await getActorName();
      const nextMeta: TicketMeta = {
        ...meta,
        assignee_name: assignmentPic.trim() || undefined,
        due_date: assignmentDueDate || undefined,
        sla_hours: Number.isFinite(parsedSlaHours) && parsedSlaHours > 0 ? parsedSlaHours : undefined,
      };

      const { error } = await supabase
        .from("feedback_reports")
        .update({ browser_info: JSON.stringify(nextMeta) })
        .eq("id", assignmentTicket.id);
      if (error) throw error;

      if (assignmentTicket.tenant_id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error: auditError } = await supabase.from("hr_ticket_status_audits").insert({
          ticket_id: assignmentTicket.id,
          tenant_id: assignmentTicket.tenant_id,
          from_status: assignmentTicket.status,
          to_status: assignmentTicket.status,
          actor_name: actorName,
          actor_user_id: user?.id || null,
          note: `Update PIC/SLA ke ${assignmentPic.trim() || "-"} / ${assignmentDueDate || "-"} / ${Number.isFinite(parsedSlaHours) ? `${parsedSlaHours} jam` : "-"}`,
        });
        if (auditError) {
          const ref = reportError(auditError, "org.hr.tickets.update_assignment.audit");
          toast.error(appendErrorReference("PIC/SLA tersimpan, tetapi audit gagal dicatat.", ref));
        }
      }

      toast.success("PIC dan SLA tiket berhasil diperbarui.");
      setIsAssignmentDialogOpen(false);
      setAssignmentTicket(null);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.tickets.update_assignment");
      toast.error(appendErrorReference("Gagal memperbarui PIC/SLA tiket", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openHistoryDialog = (item: TicketRow) => {
    setHistoryTicket(item);
    setCommentInput("");
    setIsHistoryDialogOpen(true);
  };

  const addComment = async () => {
    if (!canCommentTicket) {
      toast.error("Akses ditolak. Hanya admin organisasi yang dapat menambah komentar tiket.");
      return;
    }
    if (!historyTicket || !commentInput.trim()) {
      toast.error("Komentar tidak boleh kosong.");
      return;
    }
    try {
      setIsSubmitting(true);
      const actorName = await getActorName();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!historyTicket.tenant_id) {
        throw new Error("Tenant tiket tidak valid.");
      }
      const { error } = await supabase.from("hr_ticket_comments").insert({
        ticket_id: historyTicket.id,
        tenant_id: historyTicket.tenant_id,
        message: commentInput.trim(),
        author_name: actorName,
        author_user_id: user?.id || null,
      });
      if (error) throw error;

      toast.success("Komentar tiket ditambahkan.");
      setCommentInput("");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.tickets.add_comment");
      toast.error(appendErrorReference("Gagal menambahkan komentar tiket", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">HR Help</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Tiket HR</h1>
          <p className="text-sm text-muted-foreground">
            Daftar tiket bantuan khusus HR untuk tindak lanjut masalah operasional.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          <StatCard title="Total Tiket" value={metrics.total} />
          <StatCard title="Open" value={metrics.open} />
          <StatCard title="In Progress" value={metrics.inProgress} />
          <StatCard title="Resolved" value={metrics.resolved} />
          <StatCard title="SLA Overdue" value={metrics.overdue} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Manajemen Tiket HR</CardTitle>
            <CardDescription>
              Setiap error operasional sebaiknya menyertakan `trace_id` atau `Ref` pada tiket. Akses aktif:{" "}
              <strong>{roleLabel}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setIsDialogOpen(true)} disabled={!canCreateTicket}>
                <Plus className="mr-2 h-4 w-4" />
                Buat Tiket HR
              </Button>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TicketStatus)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari subjek, detail, pelapor..."
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat tiket HR...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Subjek</TableHead>
                    <TableHead>Kategori/Prioritas</TableHead>
                    <TableHead>PIC/SLA</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Thread</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        Belum ada tiket HR.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((item) => {
                      const meta = parseMeta(item.browser_info);
                      const priority = (meta.priority || "normal") as Priority;
                      const category = (meta.category || "lainnya") as Category;
                      const overdue = isSlaOverdue(item.status, meta);
                      const threadComments = getTicketComments(item);
                      const threadAudits = getTicketAudits(item);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">{toTicketCode(item.id)}</TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium">{meta.subject || "Tiket tanpa subjek"}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{item.message}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline">{category}</Badge>
                              {priorityBadge(priority)}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <p>{meta.assignee_name || "Belum ditetapkan"}</p>
                            <p>{formatSla(meta)}</p>
                            {overdue ? <p className="text-destructive">SLA terlewat</p> : null}
                          </TableCell>
                          <TableCell>
                            {item.status === "resolved" ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Resolved</Badge>
                            ) : item.status === "in_progress" ? (
                              <Badge className="bg-blue-600 hover:bg-blue-600">In Progress</Badge>
                            ) : (
                              <Badge variant="secondary">Open</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <p>Komentar: {threadComments.length}</p>
                            <p>Audit: {threadAudits.length}</p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <p>{formatDateTime(item.created_at)}</p>
                            <p>{item.reporter_name || "-"}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => openHistoryDialog(item)}>Thread</Button>
                              <Button size="sm" variant="outline" onClick={() => openAssignmentDialog(item)} disabled={!canAssignTicket}>PIC/SLA</Button>
                              {item.status === "resolved" ? (
                                canReopenTicket ? (
                                  <Button size="sm" variant="outline" onClick={() => void updateStatus(item, "open")}>Reopen</Button>
                                ) : null
                              ) : item.status === "in_progress" ? (
                                <>
                                  {canResolveTicket ? (
                                    <Button size="sm" onClick={() => void updateStatus(item, "resolved")}>Resolve</Button>
                                  ) : null}
                                  {canReopenTicket ? (
                                    <Button size="sm" variant="outline" onClick={() => void updateStatus(item, "open")}>Kembali Open</Button>
                                  ) : null}
                                </>
                              ) : canTakeTicket ? (
                                <Button size="sm" onClick={() => void updateStatus(item, "in_progress")}>Take</Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Tiket HR</DialogTitle>
              <DialogDescription>
                Sertakan referensi `trace_id` atau `Ref error` bila ada agar triase lebih cepat.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="subject">Subjek</Label>
                <Input
                  id="subject"
                  value={formState.subject}
                  onChange={(event) => setFormState((prev) => ({ ...prev, subject: event.target.value }))}
                  placeholder="Contoh: Kontrak pegawai gagal disimpan"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Kategori</Label>
                  <Select value={formState.category} onValueChange={(value) => setFormState((prev) => ({ ...prev, category: value as Category }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teknis">Teknis</SelectItem>
                      <SelectItem value="akses">Akses</SelectItem>
                      <SelectItem value="data">Data</SelectItem>
                      <SelectItem value="kontrak">Kontrak</SelectItem>
                      <SelectItem value="dokumen">Dokumen</SelectItem>
                      <SelectItem value="lainnya">Lainnya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Prioritas</Label>
                  <Select value={formState.priority} onValueChange={(value) => setFormState((prev) => ({ ...prev, priority: value as Priority }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rendah">Rendah</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="tinggi">Tinggi</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="assignee_name">PIC (opsional)</Label>
                  <Input
                    id="assignee_name"
                    value={formState.assignee_name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, assignee_name: event.target.value }))}
                    placeholder="Nama PIC"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="due_date">Batas SLA (opsional)</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formState.due_date}
                    onChange={(event) => setFormState((prev) => ({ ...prev, due_date: event.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="sla_hours">SLA Jam (opsional)</Label>
                  <Input
                    id="sla_hours"
                    type="number"
                    value={formState.sla_hours}
                    onChange={(event) => setFormState((prev) => ({ ...prev, sla_hours: event.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="reference">Ref Error / Trace ID (opsional)</Label>
                  <Input
                    id="reference"
                    value={formState.reference}
                    onChange={(event) => setFormState((prev) => ({ ...prev, reference: event.target.value }))}
                    placeholder="Contoh: FE-ABC123"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="message">Detail</Label>
                <Textarea
                  id="message"
                  rows={4}
                  value={formState.message}
                  onChange={(event) => setFormState((prev) => ({ ...prev, message: event.target.value }))}
                  placeholder="Jelaskan kronologi, langkah reproduksi, dan dampaknya."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Batal</Button>
              <Button onClick={() => void handleCreateTicket()} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ticket className="mr-2 h-4 w-4" />}
                Kirim Tiket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atur PIC & SLA</DialogTitle>
              <DialogDescription>Perbarui penanggung jawab dan target SLA tiket.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="assignment_pic">PIC</Label>
                <Input
                  id="assignment_pic"
                  value={assignmentPic}
                  onChange={(event) => setAssignmentPic(event.target.value)}
                  placeholder="Nama PIC"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="assignment_due_date">Batas SLA</Label>
                  <Input
                    id="assignment_due_date"
                    type="date"
                    value={assignmentDueDate}
                    onChange={(event) => setAssignmentDueDate(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="assignment_sla_hours">SLA Jam</Label>
                  <Input
                    id="assignment_sla_hours"
                    type="number"
                    value={assignmentSlaHours}
                    onChange={(event) => setAssignmentSlaHours(event.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAssignmentDialogOpen(false)} disabled={isSubmitting}>Batal</Button>
              <Button onClick={() => void saveAssignment()} disabled={isSubmitting || !canAssignTicket}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Thread & Audit Tiket</DialogTitle>
              <DialogDescription>Lacak komentar dan riwayat perubahan status tiket HR.</DialogDescription>
            </DialogHeader>
            {historyTicket ? (
              <div className="space-y-4 py-2">
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{toTicketCode(historyTicket.id)}</p>
                  <p className="text-muted-foreground">{parseMeta(historyTicket.browser_info).subject || "Tiket tanpa subjek"}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Komentar</p>
                  <div className="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                    {getTicketComments(historyTicket).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada komentar.</p>
                    ) : (
                      getTicketComments(historyTicket).map((comment) => (
                        <div key={comment.id} className="rounded border p-2 text-sm">
                          <p>{comment.message}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{comment.author} • {formatDateTime(comment.created_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <Textarea
                    rows={3}
                    value={commentInput}
                    onChange={(event) => setCommentInput(event.target.value)}
                    placeholder="Tambah komentar tindak lanjut..."
                    disabled={!canCommentTicket}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => void addComment()} disabled={isSubmitting || !canCommentTicket}>Tambah Komentar</Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Audit Status</p>
                  <div className="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                    {getTicketAudits(historyTicket).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada audit status.</p>
                    ) : (
                      getTicketAudits(historyTicket).map((audit) => (
                        <div key={audit.id} className="rounded border p-2 text-sm">
                          <p>{audit.from_status} {"->"} {audit.to_status}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{audit.actor} • {formatDateTime(audit.at)}</p>
                          {audit.note ? <p className="mt-1 text-xs text-muted-foreground">{audit.note}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
