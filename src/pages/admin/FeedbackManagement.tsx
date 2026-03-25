import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { Textarea } from "@/components/ui/textarea";
import { Star, Bug, Lightbulb, Download, Search, MessageSquare, CheckCircle2, Loader2, Printer, ShieldAlert, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface FeedbackItem {
  archive_note: string | null;
  archived_at: string | null;
  archived_by: string | null;
  id: string;
  is_archived: boolean;
  tenant_id: string | null;
  reporter_name: string | null;
  reporter_role: string;
  feedback_type: string;
  rating: number | null;
  message: string;
  screenshot_url: string | null;
  os_info: string | null;
  browser_info: string | null;
  status: string;
  survey_day: number | null;
  created_at: string;
  resolution_notes: string | null;
  tenants?: { name: string; } | null;
}

interface FeedbackBugSettings {
  is_enabled: boolean;
  bugs_enabled: boolean;
  suggestions_enabled: boolean;
}

type FeedbackQueryBuilder = ReturnType<typeof supabase.from<"feedback_reports", FeedbackItem>>;
type FeedbackTypeFilter = "all" | "bug" | "saran" | "ticket";
type TicketDeleteMode = "selected" | "all_filtered";

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeFeedbackSettings = (raw: unknown): FeedbackBugSettings => {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legacyEnabled = value.is_enabled !== false;
  const bugsEnabled = typeof value.bugs_enabled === "boolean" ? value.bugs_enabled : legacyEnabled;
  const suggestionsEnabled = typeof value.suggestions_enabled === "boolean" ? value.suggestions_enabled : legacyEnabled;
  return {
    is_enabled: bugsEnabled || suggestionsEnabled,
    bugs_enabled: bugsEnabled,
    suggestions_enabled: suggestionsEnabled,
  };
};

const chunkArray = <T,>(items: T[], chunkSize: number) => {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const getFeedbackStatusBadge = (feedbackType: string, status: string) => {
  if (feedbackType === "ticket") {
    if (status === "open") return <Badge variant="outline" className="text-xs">Open</Badge>;
    if (status === "in_progress") return <Badge className="bg-blue-600 hover:bg-blue-600 text-xs">Menunggu Balasan Org</Badge>;
    if (status === "closed") return <Badge variant="secondary" className="text-xs">Closed</Badge>;
    if (status === "resolved") return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">Resolved</Badge>;
    return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  }

  if (status === "open") return <Badge variant="outline" className="text-xs">Open</Badge>;
  if (status === "resolved") return <Badge className="text-xs">Resolved</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
};

export default function FeedbackManagement() {
  const PAGE_SIZE = 20;
  const ADMIN_FEEDBACK_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_FEEDBACK_QUERY_RETRY_MAX = 1;
  const location = useLocation();
  const isTicketRoute = location.pathname === "/admin/help/tickets";
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [filterType, setFilterType] = useState<FeedbackTypeFilter>(isTicketRoute ? "ticket" : "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [feedbackSettings, setFeedbackSettings] = useState<FeedbackBugSettings>({
    is_enabled: true,
    bugs_enabled: true,
    suggestions_enabled: true,
  });
  const [isSavingFeedbackSetting, setIsSavingFeedbackSetting] = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isDeletingTickets, setIsDeletingTickets] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteMode, setDeleteMode] = useState<TicketDeleteMode>("selected");

  // Stats
  const [stats, setStats] = useState({ total: 0, avgRating: 0, openIssues: 0 });

  const applyFeedbackFilters = useCallback((query: FeedbackQueryBuilder): FeedbackQueryBuilder => {
    let nextQuery = query.eq("is_archived", false);

    if (activeTab === "admin") {
      nextQuery = nextQuery.eq("reporter_role", "admin_organisasi");
    } else if (activeTab === "pegawai") {
      nextQuery = nextQuery.eq("reporter_role", "pegawai");
    }

    if (!isTicketRoute && filterRating !== "all") {
      nextQuery = nextQuery.eq("rating", Number(filterRating));
    }

    if (isTicketRoute) {
      nextQuery = nextQuery.eq("feedback_type", "ticket");
    } else if (filterType !== "all") {
      nextQuery = nextQuery.eq("feedback_type", filterType);
    }

    if (searchQuery.trim()) {
      const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
      nextQuery = nextQuery.or(`message.ilike.%${escaped}%,reporter_name.ilike.%${escaped}%`);
    }

    return nextQuery;
  }, [activeTab, filterRating, filterType, isTicketRoute, searchQuery]);

  const fetchAccessRole = async () => {
    try {
      setIsRetrying(false);
      const { data: { user } } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
            "admin.feedback.fetch_access_role.get_user timeout",
          ),
        {
          maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (!user) {
        setIsSuperAdminUser(false);
        return;
      }

      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", user.id)
              .eq("role", "super_admin")
              .maybeSingle(),
            ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
            "admin.feedback.fetch_access_role.query timeout",
          ),
        {
          maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setIsSuperAdminUser(Boolean(data));
    } catch (error) {
      reportError(error, "admin.feedback.fetch_access_role");
      setIsSuperAdminUser(false);
    } finally {
      setIsRetrying(false);
    }
  };

  const fetchFeedbackSettings = async () => {
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("value")
              .eq("key", "feedback_bug_settings")
              .maybeSingle(),
            ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
            "admin.feedback.fetch_settings timeout",
          ),
        {
          maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setFeedbackSettings(normalizeFeedbackSettings(data?.value));
    } catch (error) {
      const errorRef = reportError(error, "admin.feedback.fetch_settings");
      const message = appendErrorReference("Gagal memuat pengaturan feedback", errorRef);
      toast.error(message);
      setLoadError(message);
      setFeedbackSettings({
        is_enabled: true,
        bugs_enabled: true,
        suggestions_enabled: true,
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const saveFeedbackSettings = async (next: FeedbackBugSettings, successMessage: string) => {
    const { data: existing, error: checkErr } = await supabase
      .from("system_settings")
      .select("id")
      .eq("key", "feedback_bug_settings")
      .maybeSingle();
    if (checkErr) throw checkErr;

    if (existing?.id) {
      const { error } = await supabase
        .from("system_settings")
        .update({ value: next, updated_at: new Date().toISOString() })
        .eq("key", "feedback_bug_settings");
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("system_settings")
        .insert({ key: "feedback_bug_settings", value: next });
      if (error) throw error;
    }
    toast.success(successMessage);
  };

  const handleToggleFeedbackEnabled = async (type: "bugs_enabled" | "suggestions_enabled", checked: boolean) => {
    if (!isSuperAdminUser) {
      toast.error("Hanya super admin yang dapat mengubah pengaturan ini.");
      return;
    }
    const prev = feedbackSettings;
    const next: FeedbackBugSettings = {
      ...feedbackSettings,
      [type]: checked,
      is_enabled: type === "bugs_enabled"
        ? checked || feedbackSettings.suggestions_enabled
        : feedbackSettings.bugs_enabled || checked,
    };
    setFeedbackSettings(next);
    setIsSavingFeedbackSetting(true);
    try {
      const label = type === "bugs_enabled" ? "Bug" : "Saran";
      await saveFeedbackSettings(next, `Input ${label} ${checked ? "diaktifkan" : "dinonaktifkan"}`);
    } catch (error) {
      setFeedbackSettings(prev);
      const errorRef = reportError(error, "admin.feedback.save_settings", {
        field: type,
        checked,
      });
      toast.error(appendErrorReference("Gagal menyimpan pengaturan feedback", errorRef));
    } finally {
      setIsSavingFeedbackSetting(false);
    }
  };

  const fetchFeedbacks = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      const pagedQuery = applyFeedbackFilters(
        supabase
        .from("feedback_reports")
        .select("*, tenants(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1)
      );

      const openIssueCountBaseQuery = applyFeedbackFilters(
        supabase
          .from("feedback_reports")
          .select("id", { count: "exact", head: true })
          .eq("feedback_type", isTicketRoute ? "ticket" : "bug")
      );
      const openIssueCountQuery = isTicketRoute
        ? openIssueCountBaseQuery.in("status", ["open", "in_progress"])
        : openIssueCountBaseQuery.eq("status", "open");

      const ratingRowsQuery = applyFeedbackFilters(
        supabase
          .from("feedback_reports")
          .select("rating")
          .not("rating", "is", null)
      );

      const reporterRoleFilter =
        activeTab === "admin"
          ? "admin_organisasi"
          : activeTab === "pegawai"
            ? "pegawai"
            : null;
      const feedbackTypeFilter = filterType !== "all" ? filterType : null;
      const ratingFilter = filterRating !== "all" ? Number(filterRating) : null;
      const searchFilter = searchQuery.trim() ? searchQuery.trim() : null;

      const [
        { data, error, count },
        { count: openIssueCount, error: openIssueCountError },
        { data: ratingRows, error: ratingRowsError },
        { data: statsRows, error: statsRpcError },
      ] = await Promise.all([
        withExponentialBackoff(
          () =>
            withTimeout(
              pagedQuery,
              ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
              "admin.feedback.fetch_reports.paged timeout",
            ),
          {
            maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              openIssueCountQuery,
              ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
              "admin.feedback.fetch_reports.open_issue_count timeout",
            ),
          {
            maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              ratingRowsQuery,
              ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
              "admin.feedback.fetch_reports.rating_rows timeout",
            ),
          {
            maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase.rpc("get_feedback_stats_filtered", {
                p_reporter_role: reporterRoleFilter,
                p_feedback_type: feedbackTypeFilter,
                p_rating: ratingFilter,
                p_search: searchFilter,
              }),
              ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
              "admin.feedback.fetch_reports.stats_rpc timeout",
            ),
          {
            maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        ),
      ]);

      if (error) throw error;
      setTotalCount(count || 0);

      const items = (data || []) as FeedbackItem[];
      setFeedbacks(items);

      // Calculate stats
      if (!isTicketRoute && !statsRpcError && Array.isArray(statsRows) && statsRows.length > 0) {
        const row = statsRows[0] as {
          total_count: number | null;
          avg_rating: number | null;
          open_bug_count: number | null;
        };
        setStats({
          total: Number(row.total_count || 0),
          avgRating: Number(row.avg_rating || 0),
          openIssues: Number(row.open_bug_count || 0),
        });
      } else {
        if (openIssueCountError) throw openIssueCountError;
        if (ratingRowsError) throw ratingRowsError;
        const total = count || 0;
        const ratings = (ratingRows || [])
          .map((row) => row.rating)
          .filter((rating): rating is number => typeof rating === "number");
        const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
        const openIssues = openIssueCount || 0;
        setStats({ total, avgRating: Math.round(avgRating * 10) / 10, openIssues });
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.feedback.fetch_reports", {
        tab: activeTab,
        rating_filter: filterRating,
        type_filter: filterType,
        page: currentPage,
      });
      const message = appendErrorReference("Gagal memuat feedback", errorRef);
      toast.error(message);
      setLoadError(message);
      setFeedbacks([]);
      setTotalCount(0);
      setStats({ total: 0, avgRating: 0, openIssues: 0 });
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [activeTab, applyFeedbackFilters, currentPage, filterRating, filterType, isTicketRoute, searchQuery]);

  useEffect(() => {
    void fetchFeedbackSettings();
    void fetchAccessRole();
  }, []);

  useEffect(() => {
    void fetchFeedbacks();
  }, [fetchFeedbacks]);

  useEffect(() => {
    if (isTicketRoute) {
      setFilterType("ticket");
      setFilterRating("all");
    }
  }, [isTicketRoute]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterRating, filterType, searchQuery]);

  useEffect(() => {
    if (!isTicketRoute) {
      setSelectedTicketIds([]);
      return;
    }

    setSelectedTicketIds((previous) =>
      previous.filter((id) => feedbacks.some((item) => item.id === id && item.feedback_type === "ticket")),
    );
  }, [feedbacks, isTicketRoute]);

  const handleResolve = async () => {
    if (!selectedFeedback) return;
    const isTicketReply = selectedFeedback.feedback_type === "ticket";
    if (isTicketReply && !resolutionNotes.trim()) {
      toast.error("Jawaban super admin wajib diisi sebelum mengirim balasan tiket.");
      return;
    }

    setIsResolving(true);
    try {
      setIsRetrying(false);
      const { data: { user } } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
            "admin.feedback.resolve.get_user timeout",
          ),
        {
          maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("feedback_reports")
              .update({
                status: isTicketReply ? "in_progress" : "resolved",
                resolved_at: isTicketReply ? null : new Date().toISOString(),
                resolved_by: isTicketReply ? null : user?.id,
                resolution_notes: resolutionNotes.trim() || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", selectedFeedback.id),
            ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
            "admin.feedback.resolve.update timeout",
          ),
        {
          maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;

      toast.success(
        isTicketReply
          ? "Jawaban tiket terkirim. Status tiket menjadi Menunggu Balasan Org."
          : "Masukan ditandai selesai",
      );
      setSelectedFeedback(null);
      setResolutionNotes("");
      await fetchFeedbacks();
    } catch (error) {
      const errorRef = reportError(error, "admin.feedback.resolve", {
        feedback_id: selectedFeedback.id,
        feedback_type: selectedFeedback.feedback_type,
      });
      toast.error(appendErrorReference("Gagal mengupdate feedback", errorRef));
    } finally {
      setIsResolving(false);
      setIsRetrying(false);
    }
  };

  const fetchAllFilteredFeedbacks = async (): Promise<FeedbackItem[]> => {
    const query = applyFeedbackFilters(
      supabase
      .from("feedback_reports")
      .select("*, tenants(name)")
      .order("created_at", { ascending: false })
    );

    const { data, error } = await withExponentialBackoff(
      () =>
        withTimeout(
          query,
          ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
          "admin.feedback.fetch_all_filtered timeout",
        ),
      {
        maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
        shouldRetry: isRetryableError,
        onRetry: () => setIsRetrying(true),
      }
    );
    if (error) throw error;
    return (data || []) as FeedbackItem[];
  };

  const fetchAllFilteredTicketIds = async (): Promise<string[]> => {
    const query = applyFeedbackFilters(
      supabase
      .from("feedback_reports")
      .select("id, feedback_type")
      .order("created_at", { ascending: false })
    );

    const { data, error } = await withExponentialBackoff(
      () =>
        withTimeout(
          query,
          ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
          "admin.feedback.fetch_all_filtered_ticket_ids timeout",
        ),
      {
        maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
        shouldRetry: isRetryableError,
        onRetry: () => setIsRetrying(true),
      }
    );
    if (error) throw error;

    return ((data || []) as Array<Pick<FeedbackItem, "id" | "feedback_type">>)
      .filter((item) => item.feedback_type === "ticket")
      .map((item) => item.id);
  };

  const handleTicketCheckboxChange = (ticketId: string, checked: boolean | "indeterminate") => {
    if (checked === true) {
      setSelectedTicketIds((previous) => (previous.includes(ticketId) ? previous : [...previous, ticketId]));
      return;
    }

    setSelectedTicketIds((previous) => previous.filter((id) => id !== ticketId));
  };

  const handleSelectAllTicketsOnPage = (checked: boolean | "indeterminate", pageTicketIds: string[]) => {
    if (checked === true) {
      setSelectedTicketIds((previous) => {
        const next = new Set(previous);
        pageTicketIds.forEach((id) => next.add(id));
        return Array.from(next);
      });
      return;
    }

    setSelectedTicketIds((previous) => previous.filter((id) => !pageTicketIds.includes(id)));
  };

  const openDeleteDialog = (mode: TicketDeleteMode) => {
    if (!isSuperAdminUser) {
      toast.error("Hanya super admin yang dapat mengarsipkan tiket.");
      return;
    }

    if (mode === "selected" && selectedTicketIds.length === 0) {
      toast.error("Pilih minimal 1 tiket terlebih dahulu.");
      return;
    }

    if (mode === "all_filtered" && totalCount === 0) {
      toast.error("Tidak ada tiket pada filter saat ini.");
      return;
    }

    setDeleteMode(mode);
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteTickets = async () => {
    if (!isSuperAdminUser) {
      toast.error("Hanya super admin yang dapat mengarsipkan tiket.");
      return;
    }

    if (deleteConfirmText.trim().toUpperCase() !== "ARSIP") {
      toast.error("Ketik ARSIP untuk melanjutkan.");
      return;
    }

    setIsDeletingTickets(true);
    try {
      const { data: authData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
            "admin.feedback.archive_tickets.get_user timeout",
          ),
        {
          maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      const archivedBy = authData.user?.id || null;
      const targetIds =
        deleteMode === "selected" ? [...selectedTicketIds] : await fetchAllFilteredTicketIds();

      if (targetIds.length === 0) {
        toast.error("Tidak ada tiket yang bisa diarsipkan.");
        setDeleteDialogOpen(false);
        setDeleteConfirmText("");
        return;
      }

      const archiveTimestamp = new Date().toISOString();
      const archiveNote =
        deleteMode === "selected"
          ? "[Sistem] Tiket diarsipkan manual oleh super admin (batch terpilih)."
          : "[Sistem] Tiket diarsipkan manual oleh super admin (semua sesuai filter).";
      const chunks = chunkArray(targetIds, 200);
      for (const chunk of chunks) {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("feedback_reports")
                .update({
                  is_archived: true,
                  archived_at: archiveTimestamp,
                  archived_by: archivedBy,
                  archive_note: archiveNote,
                  status: "closed",
                  updated_at: archiveTimestamp,
                })
                .in("id", chunk)
                .eq("feedback_type", "ticket")
                .eq("is_archived", false),
              ADMIN_FEEDBACK_QUERY_TIMEOUT_MS,
              "admin.feedback.archive_tickets timeout",
            ),
          {
            maxRetries: ADMIN_FEEDBACK_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (error) throw error;
      }

      if (selectedFeedback && targetIds.includes(selectedFeedback.id)) {
        setSelectedFeedback(null);
        setResolutionNotes("");
      }

      if (deleteMode === "selected") {
        setSelectedTicketIds((previous) => previous.filter((id) => !targetIds.includes(id)));
      } else {
        setSelectedTicketIds([]);
      }

      setDeleteDialogOpen(false);
      setDeleteConfirmText("");
      toast.success(`${targetIds.length} tiket berhasil diarsipkan.`);
      await fetchFeedbacks();
    } catch (error) {
      const errorRef = reportError(error, "admin.feedback.archive_tickets", {
        mode: deleteMode,
      });
      toast.error(appendErrorReference("Gagal mengarsipkan tiket", errorRef));
    } finally {
      setIsDeletingTickets(false);
      setIsRetrying(false);
    }
  };

  const exportCsv = async () => {
    try {
      const filtered = await fetchAllFilteredFeedbacks();
      const headers = isTicketRoute
        ? ["Tanggal", "Organisasi", "Nama", "Peran", "Tipe", "Pesan", "Status"]
        : ["Tanggal", "Organisasi", "Nama", "Peran", "Tipe", "Rating", "Pesan", "OS", "Browser", "Status"];
      const rows = filtered.map((f) =>
        isTicketRoute
          ? [
              format(new Date(f.created_at), "yyyy-MM-dd HH:mm"),
              f.tenants?.name || "-",
              f.reporter_name || "-",
              f.reporter_role,
              f.feedback_type,
              `"${f.message.replace(/"/g, '""')}"`,
              f.status,
            ]
          : [
              format(new Date(f.created_at), "yyyy-MM-dd HH:mm"),
              f.tenants?.name || "-",
              f.reporter_name || "-",
              f.reporter_role,
              f.feedback_type,
              f.rating?.toString() || "-",
              `"${f.message.replace(/"/g, '""')}"`,
              f.os_info || "-",
              f.browser_info || "-",
              f.status,
            ]
      );

      const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `feedback_${format(new Date(), "yyyyMMdd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const errorRef = reportError(error, "admin.feedback.export_csv");
      toast.error(appendErrorReference("Gagal ekspor CSV", errorRef));
    }
  };

  const printPdf = async () => {
    try {
      const filtered = await fetchAllFilteredFeedbacks();
      const statusColumnIndex = isTicketRoute ? 7 : 8;
      const rowsHtml = filtered
        .map((f, index) => {
        const createdAt = format(new Date(f.created_at), "dd MMM yyyy HH:mm", { locale: idLocale });
        const organization = escapeHtml(f.tenants?.name || "-");
        const reporterName = escapeHtml(f.reporter_name || "-");
        const reporterRole = escapeHtml(f.reporter_role || "-");
        const feedbackType = escapeHtml(f.feedback_type || "-");
        const rating = f.rating ? `${f.rating}/5` : "-";
        const status = escapeHtml(f.status || "-");
        const message = escapeHtml(f.message || "-");

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${createdAt}</td>
            <td>${organization}</td>
            <td>${reporterName}</td>
            <td>${reporterRole}</td>
            <td>${feedbackType}</td>
            ${isTicketRoute ? "" : `<td>${rating}</td>`}
            <td>${status}</td>
            <td>${message}</td>
          </tr>
        `;
        })
        .join("");

      const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Laporan Masukan</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { font-size: 20px; margin: 0 0 6px; }
            .meta { margin-bottom: 14px; font-size: 12px; color: #444; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; vertical-align: top; word-wrap: break-word; }
            th { background: #f5f5f5; text-align: left; }
            th:nth-child(1), td:nth-child(1) { width: 30px; text-align: center; }
            th:nth-child(2), td:nth-child(2) { width: 110px; }
            th:nth-child(${statusColumnIndex}), td:nth-child(${statusColumnIndex}) { width: 70px; text-align: center; }
            .empty { margin-top: 24px; color: #555; font-size: 13px; }
            @page { size: A4 landscape; margin: 12mm; }
          </style>
        </head>
        <body>
          <h1>Laporan Masukan & Bug</h1>
          <div class="meta">
            Dicetak: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: idLocale })}<br/>
            Total Data: ${filtered.length}
          </div>
            ${filtered.length === 0 ? "<div class='empty'>Tidak ada data masukan untuk dicetak.</div>" : `
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Organisasi</th>
                  <th>Nama</th>
                  <th>Peran</th>
                  <th>Tipe</th>
                  ${isTicketRoute ? "" : "<th>Rating</th>"}
                  <th>Status</th>
                  <th>Pesan</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          `}
        </body>
      </html>
    `;

      const printWindow = window.open("", "_blank", "width=1200,height=800");
      if (!printWindow) {
        toast.error("Gagal membuka jendela print. Izinkan popup browser.");
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      const errorRef = reportError(error, "admin.feedback.print_pdf");
      toast.error(appendErrorReference("Gagal print PDF", errorRef));
    }
  };

  const getFilteredData = () => feedbacks;

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-xs text-muted-foreground">-</span>;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(s => (
          <Star key={s} className={cn("w-3.5 h-3.5", s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
        ))}
      </div>
    );
  };

  const filtered = getFilteredData();
  const filteredTicketRows = filtered.filter((item) => item.feedback_type === "ticket");
  const selectedTicketCountOnPage = filteredTicketRows.filter((item) => selectedTicketIds.includes(item.id)).length;
  const allTicketsOnPageSelected = filteredTicketRows.length > 0 && selectedTicketCountOnPage === filteredTicketRows.length;
  const ticketHeaderCheckboxState: boolean | "indeterminate" =
    allTicketsOnPageSelected ? true : selectedTicketCountOnPage > 0 ? "indeterminate" : false;
  const deleteTargetCount = deleteMode === "selected" ? selectedTicketIds.length : totalCount;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visiblePages =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : currentPage <= 3
        ? [1, 2, 3, 4, 5]
        : currentPage >= totalPages - 2
          ? [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];

  const pageTitle = isTicketRoute ? "Tiket Bantuan Org" : "Laporan Masukan & Bug";
  const pageSubtitle = isTicketRoute
    ? "Tiket dari /org/help/tickets untuk tindak lanjut super admin."
    : "Kelola masukan dan laporan bug dari pengguna";
  const canHandleSelectedFeedback = Boolean(
    selectedFeedback && (
      (selectedFeedback.feedback_type === "ticket" && ["open", "in_progress"].includes(selectedFeedback.status)) ||
      (selectedFeedback.feedback_type !== "ticket" && selectedFeedback.status === "open")
    ),
  );

  return (
    <SuperAdminLayout title={pageTitle} subtitle={pageSubtitle}>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><MessageSquare className="w-5 h-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">{isTicketRoute ? "Total Tiket" : "Total Masukan"}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              {isTicketRoute ? <CheckCircle2 className="w-5 h-5 text-yellow-500" /> : <Star className="w-5 h-5 text-yellow-500" />}
            </div>
            <div>
              <p className="text-2xl font-bold">{isTicketRoute ? Math.max(0, stats.total - stats.openIssues) : stats.avgRating}</p>
              <p className="text-xs text-muted-foreground">{isTicketRoute ? "Tiket Selesai" : "Rata-rata Rating"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              {isTicketRoute ? <Ticket className="w-5 h-5 text-destructive" /> : <Bug className="w-5 h-5 text-destructive" />}
            </div>
            <div><p className="text-2xl font-bold">{stats.openIssues}</p><p className="text-xs text-muted-foreground">{isTicketRoute ? "Tiket Aktif" : "Bug Terbuka"}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b">
            <div>
              <p className="text-sm font-medium">Pengaturan Masukan & Bug</p>
              <p className="text-xs text-muted-foreground">
                Matikan sementara agar input masukan dari pengguna tidak menumpuk.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={feedbackSettings.is_enabled ? "default" : "destructive"} className="text-[11px]">
                {feedbackSettings.is_enabled ? "Masukan Aktif" : "Masukan Nonaktif"}
              </Badge>
              <Label htmlFor="feedback-enabled-bug" className="text-sm">
                Bug
              </Label>
              <Switch
                id="feedback-enabled-bug"
                checked={feedbackSettings.bugs_enabled}
                disabled={isSavingFeedbackSetting || !isSuperAdminUser}
                onCheckedChange={(checked) => handleToggleFeedbackEnabled("bugs_enabled", checked)}
              />
              <Label htmlFor="feedback-enabled-saran" className="text-sm">
                Saran
              </Label>
              <Switch
                id="feedback-enabled-saran"
                checked={feedbackSettings.suggestions_enabled}
                disabled={isSavingFeedbackSetting || !isSuperAdminUser}
                onCheckedChange={(checked) => handleToggleFeedbackEnabled("suggestions_enabled", checked)}
              />
            </div>
          </div>
          {!isSuperAdminUser && (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-600">
              <ShieldAlert className="w-4 h-4" />
              Hanya role super_admin yang dapat mengubah pengaturan masukan.
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>{isTicketRoute ? "Daftar Tiket Bantuan Org" : "Daftar Masukan"}</CardTitle>
            <div className="flex items-center gap-2">
              {isTicketRoute && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteDialog("selected")}
                    disabled={!isSuperAdminUser || isDeletingTickets || selectedTicketIds.length === 0}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Arsipkan Terpilih ({selectedTicketIds.length})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => openDeleteDialog("all_filtered")}
                    disabled={!isSuperAdminUser || isDeletingTickets || totalCount === 0}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Arsipkan Semua
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={printPdf}>
                <Printer className="w-4 h-4 mr-2" /> Cetak PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="w-4 h-4 mr-2" /> Ekspor CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isRetrying && (
            <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sedang mencoba ulang koneksi data feedback...
            </div>
          )}
          {loadError && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{loadError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchFeedbacks()}>
                  Coba Lagi
                </Button>
              </div>
            </div>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
            <div className="overflow-x-auto pb-1">
              <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                <TabsTrigger value="all" className="whitespace-nowrap">Semua</TabsTrigger>
                <TabsTrigger value="admin" className="whitespace-nowrap">Admin Organisasi</TabsTrigger>
                <TabsTrigger value="pegawai" className="whitespace-nowrap">Pegawai</TabsTrigger>
              </TabsList>
            </div>
          </Tabs>

          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isTicketRoute ? "Cari tiket..." : "Cari masukan..."}
                className="pl-10"
              />
            </div>
            {!isTicketRoute && (
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Rating" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Rating</SelectItem>
                  {[1, 2, 3, 4, 5].map(r => <SelectItem key={r} value={r.toString()}>⭐ {r}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select
              value={isTicketRoute ? "ticket" : filterType}
              onValueChange={(value) => {
                if (!isTicketRoute) setFilterType(value as FeedbackTypeFilter);
              }}
              disabled={isTicketRoute}
            >
              <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="Tipe" /></SelectTrigger>
              <SelectContent>
                {!isTicketRoute && <SelectItem value="all">Semua Tipe</SelectItem>}
                {!isTicketRoute && <SelectItem value="bug">Bug</SelectItem>}
                {!isTicketRoute && <SelectItem value="saran">Saran</SelectItem>}
                <SelectItem value="ticket">Tiket</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{isTicketRoute ? "Belum ada tiket" : "Belum ada masukan"}</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isTicketRoute && (
                      <TableHead className="w-[44px]">
                        <Checkbox
                          checked={ticketHeaderCheckboxState}
                          onCheckedChange={(checked) =>
                            handleSelectAllTicketsOnPage(
                              checked,
                              filteredTicketRows.map((item) => item.id),
                            )
                          }
                          aria-label="Pilih semua tiket pada halaman ini"
                        />
                      </TableHead>
                    )}
                    <TableHead>Organisasi</TableHead>
                    <TableHead>Nama</TableHead>
                    {!isTicketRoute && <TableHead>Rating</TableHead>}
                    <TableHead>Tipe</TableHead>
                    <TableHead className="max-w-[200px]">Pesan</TableHead>
                    {!isTicketRoute && <TableHead>Metadata</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(f => (
                    <TableRow
                      key={f.id}
                      className={cn("cursor-pointer hover:bg-muted/50", isTicketRoute && selectedTicketIds.includes(f.id) && "bg-muted/40")}
                      onClick={() => { setSelectedFeedback(f); setResolutionNotes(f.resolution_notes || ""); }}
                    >
                      {isTicketRoute && (
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selectedTicketIds.includes(f.id)}
                            onCheckedChange={(checked) => handleTicketCheckboxChange(f.id, checked)}
                            aria-label={`Pilih tiket ${f.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-sm">{f.tenants?.name || "-"}</TableCell>
                      <TableCell className="text-sm">{f.reporter_name || "-"}</TableCell>
                      {!isTicketRoute && <TableCell>{renderStars(f.rating)}</TableCell>}
                      <TableCell>
                        <Badge
                          variant={f.feedback_type === "bug" ? "destructive" : f.feedback_type === "ticket" ? "outline" : "secondary"}
                          className={cn("text-xs", f.feedback_type === "ticket" && "border-blue-500 text-blue-700")}
                        >
                          {f.feedback_type === "bug"
                            ? <Bug className="w-3 h-3 mr-1" />
                            : f.feedback_type === "ticket"
                              ? <Ticket className="w-3 h-3 mr-1" />
                              : <Lightbulb className="w-3 h-3 mr-1" />}
                          {f.feedback_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{f.message}</TableCell>
                      {!isTicketRoute && (
                        <TableCell className="text-xs text-muted-foreground">
                          {f.os_info && <span>{f.os_info}</span>}
                          {f.browser_info && <span className="block">{f.browser_info}</span>}
                        </TableCell>
                      )}
                      <TableCell>{getFeedbackStatusBadge(f.feedback_type, f.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(f.created_at), "dd MMM yyyy", { locale: idLocale })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => {
                        if (currentPage > 1) setCurrentPage((prev) => prev - 1);
                      }}
                      className={currentPage <= 1 ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {visiblePages.map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => {
                        if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
                      }}
                      className={currentPage >= totalPages ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      <PageGlossarySection preset="admin_feedback" />

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeletingTickets) {
            setDeleteDialogOpen(open);
            if (!open) setDeleteConfirmText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi Arsip Tiket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Anda akan mengarsipkan{" "}
              <span className="font-semibold">
                {deleteTargetCount} tiket
              </span>
              {deleteMode === "all_filtered" ? " sesuai filter saat ini" : " terpilih"}.
            </p>
            <p className="text-xs text-muted-foreground">
              Tiket arsip tidak tampil di daftar utama, tetapi masih tersimpan untuk kebutuhan audit internal.
            </p>
            <div className="space-y-2">
              <Label htmlFor="confirm-delete-ticket-input">Ketik ARSIP untuk konfirmasi</Label>
              <Input
                id="confirm-delete-ticket-input"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="ARSIP"
                disabled={isDeletingTickets}
              />
            </div>
          </div>
          <DialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>
              Gunakan fitur ini hanya saat tiket memang sudah tidak diperlukan.
            </DialogActionHint>
            <Button
              type="button"
              variant="outline"
              className="bg-white"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteConfirmText("");
              }}
              disabled={isDeletingTickets}
            >
              Batal
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteTickets} disabled={isDeletingTickets}>
              {isDeletingTickets ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Arsipkan Tiket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Rincian */}
      <Dialog open={!!selectedFeedback} onOpenChange={(open) => !open && setSelectedFeedback(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedFeedback?.feedback_type === "ticket" ? "Rincian Tiket" : "Rincian Masukan"}</DialogTitle>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Organisasi:</span><p className="font-medium">{selectedFeedback.tenants?.name || "-"}</p></div>
                <div><span className="text-muted-foreground">Nama:</span><p className="font-medium">{selectedFeedback.reporter_name}</p></div>
                <div><span className="text-muted-foreground">Peran:</span><p className="font-medium">{selectedFeedback.reporter_role}</p></div>
                <div><span className="text-muted-foreground">Tipe:</span><p className="font-medium">{selectedFeedback.feedback_type}</p></div>
                <div><span className="text-muted-foreground">Status:</span><div className="pt-1">{getFeedbackStatusBadge(selectedFeedback.feedback_type, selectedFeedback.status)}</div></div>
                {selectedFeedback.feedback_type !== "ticket" && (
                  <div><span className="text-muted-foreground">Rating:</span><div>{renderStars(selectedFeedback.rating)}</div></div>
                )}
                {selectedFeedback.survey_day && (
                  <div><span className="text-muted-foreground">Survei Hari:</span><p className="font-medium">Ke-{selectedFeedback.survey_day}</p></div>
                )}
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Pesan:</span>
                <p className="mt-1 text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">{selectedFeedback.message}</p>
              </div>
              {selectedFeedback.screenshot_url && (
                <div>
                  <span className="text-sm text-muted-foreground">Tangkapan Layar:</span>
                  <img src={selectedFeedback.screenshot_url} alt="Screenshot" className="mt-1 rounded-lg max-h-[200px] object-contain" />
                </div>
              )}
              {canHandleSelectedFeedback && (
                <div className="space-y-2 border-t pt-4">
                  <span className="text-sm font-medium">
                    {selectedFeedback.feedback_type === "ticket" ? "Jawaban Superadmin:" : "Resolusi:"}
                  </span>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder={selectedFeedback.feedback_type === "ticket" ? "Tulis jawaban untuk admin organisasi..." : "Catatan resolusi..."}
                    rows={2}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>
              {selectedFeedback?.feedback_type === "ticket"
                ? "Balasan tiket akan mengubah status menjadi Menunggu Balasan Org."
                : "Gunakan resolusi singkat dan jelas agar riwayat penanganan mudah diaudit."}
            </DialogActionHint>
            <Button variant="outline" className="bg-white" onClick={() => setSelectedFeedback(null)}>Tutup</Button>
            {canHandleSelectedFeedback && (
              <Button className="min-w-[170px]" onClick={handleResolve} disabled={isResolving}>
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {selectedFeedback?.feedback_type === "ticket" ? "Kirim Jawaban" : "Tandai Resolved"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}
