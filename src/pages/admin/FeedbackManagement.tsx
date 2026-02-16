import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Star, Bug, Lightbulb, Download, Search, MessageSquare, CheckCircle2, Loader2, Printer, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface FeedbackItem {
  id: string;
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

export default function FeedbackManagement() {
  const PAGE_SIZE = 20;
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [filterType, setFilterType] = useState("all");
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

  // Stats
  const [stats, setStats] = useState({ total: 0, avgRating: 0, openBugs: 0 });

  const fetchAccessRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsSuperAdminUser(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      if (error) throw error;
      setIsSuperAdminUser(Boolean(data));
    } catch (error) {
      reportError(error, "admin.feedback.fetch_access_role");
      setIsSuperAdminUser(false);
    }
  };

  const fetchFeedbackSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "feedback_bug_settings")
        .maybeSingle();

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
      let query = supabase
        .from("feedback_reports")
        .select("*, tenants(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (activeTab === "admin") {
        query = query.eq("reporter_role", "admin_organisasi");
      } else if (activeTab === "pegawai") {
        query = query.eq("reporter_role", "pegawai");
      }
      if (filterRating !== "all") {
        query = query.eq("rating", Number(filterRating));
      }
      if (filterType !== "all") {
        query = query.eq("feedback_type", filterType);
      }
      if (searchQuery.trim()) {
        const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
        query = query.or(`message.ilike.%${escaped}%,reporter_name.ilike.%${escaped}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setTotalCount(count || 0);

      const items = (data || []) as FeedbackItem[];
      setFeedbacks(items);

      // Calculate stats
      const total = items.length;
      const ratings = items.filter(f => f.rating).map(f => f.rating!);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      const openBugs = items.filter(f => f.feedback_type === "bug" && f.status === "open").length;
      setStats({ total, avgRating: Math.round(avgRating * 10) / 10, openBugs });
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
      setStats({ total: 0, avgRating: 0, openBugs: 0 });
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, currentPage, filterRating, filterType, searchQuery]);

  useEffect(() => {
    void fetchFeedbackSettings();
    void fetchAccessRole();
  }, []);

  useEffect(() => {
    void fetchFeedbacks();
  }, [fetchFeedbacks]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterRating, filterType, searchQuery]);

  const handleResolve = async () => {
    if (!selectedFeedback) return;
    setIsResolving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("feedback_reports")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: resolutionNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedFeedback.id);
      if (error) throw error;

      toast.success("Feedback ditandai selesai");
      setSelectedFeedback(null);
      setResolutionNotes("");
      fetchFeedbacks();
    } catch (error) {
      const errorRef = reportError(error, "admin.feedback.resolve", {
        feedback_id: selectedFeedback.id,
      });
      toast.error(appendErrorReference("Gagal mengupdate feedback", errorRef));
    } finally {
      setIsResolving(false);
    }
  };

  const fetchAllFilteredFeedbacks = async (): Promise<FeedbackItem[]> => {
    let query = supabase
      .from("feedback_reports")
      .select("*, tenants(name)")
      .order("created_at", { ascending: false });

    if (activeTab === "admin") {
      query = query.eq("reporter_role", "admin_organisasi");
    } else if (activeTab === "pegawai") {
      query = query.eq("reporter_role", "pegawai");
    }
    if (filterRating !== "all") {
      query = query.eq("rating", Number(filterRating));
    }
    if (filterType !== "all") {
      query = query.eq("feedback_type", filterType);
    }
    if (searchQuery.trim()) {
      const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
      query = query.or(`message.ilike.%${escaped}%,reporter_name.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as FeedbackItem[];
  };

  const exportCsv = async () => {
    try {
      const filtered = await fetchAllFilteredFeedbacks();
      const headers = ["Tanggal", "Organisasi", "Nama", "Role", "Tipe", "Rating", "Pesan", "OS", "Browser", "Status"];
      const rows = filtered.map(f => [
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
      ]);

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
      toast.error(appendErrorReference("Gagal export CSV", errorRef));
    }
  };

  const printPdf = async () => {
    try {
      const filtered = await fetchAllFilteredFeedbacks();
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
            <td>${rating}</td>
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
          <title>Laporan Feedback</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { font-size: 20px; margin: 0 0 6px; }
            .meta { margin-bottom: 14px; font-size: 12px; color: #444; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; vertical-align: top; word-wrap: break-word; }
            th { background: #f5f5f5; text-align: left; }
            th:nth-child(1), td:nth-child(1) { width: 30px; text-align: center; }
            th:nth-child(2), td:nth-child(2) { width: 110px; }
            th:nth-child(7), td:nth-child(7) { width: 60px; text-align: center; }
            th:nth-child(8), td:nth-child(8) { width: 70px; text-align: center; }
            .empty { margin-top: 24px; color: #555; font-size: 13px; }
            @page { size: A4 landscape; margin: 12mm; }
          </style>
        </head>
        <body>
          <h1>Laporan Feedback & Bug</h1>
          <div class="meta">
            Dicetak: ${format(new Date(), "dd MMMM yyyy HH:mm", { locale: idLocale })}<br/>
            Total Data: ${filtered.length}
          </div>
          ${filtered.length === 0 ? "<div class='empty'>Tidak ada data feedback untuk dicetak.</div>" : `
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Organisasi</th>
                  <th>Nama</th>
                  <th>Role</th>
                  <th>Tipe</th>
                  <th>Rating</th>
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
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visiblePages =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : currentPage <= 3
        ? [1, 2, 3, 4, 5]
        : currentPage >= totalPages - 2
          ? [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];

  return (
    <SuperAdminLayout title="Feedback & Bug Report" subtitle="Kelola feedback dan laporan bug dari pengguna">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><MessageSquare className="w-5 h-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total Feedback</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10"><Star className="w-5 h-5 text-yellow-500" /></div>
            <div><p className="text-2xl font-bold">{stats.avgRating}</p><p className="text-xs text-muted-foreground">Rata-rata Rating</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><Bug className="w-5 h-5 text-destructive" /></div>
            <div><p className="text-2xl font-bold">{stats.openBugs}</p><p className="text-xs text-muted-foreground">Bug Terbuka</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b">
            <div>
              <p className="text-sm font-medium">Pengaturan Feedback & Bug</p>
              <p className="text-xs text-muted-foreground">
                Matikan sementara agar input feedback dari user tidak menumpuk.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={feedbackSettings.is_enabled ? "default" : "destructive"} className="text-[11px]">
                {feedbackSettings.is_enabled ? "Feedback ON" : "Feedback OFF"}
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
              Hanya role super_admin yang dapat mengubah pengaturan feedback.
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>Daftar Feedback</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={printPdf}>
                <Printer className="w-4 h-4 mr-2" /> Print PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadError && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </div>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">Semua</TabsTrigger>
              <TabsTrigger value="admin">Admin Organisasi</TabsTrigger>
              <TabsTrigger value="pegawai">Pegawai</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari feedback..." className="pl-10" />
            </div>
            <Select value={filterRating} onValueChange={setFilterRating}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Rating" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Rating</SelectItem>
                {[1, 2, 3, 4, 5].map(r => <SelectItem key={r} value={r.toString()}>⭐ {r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="saran">Saran</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Belum ada feedback</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organisasi</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead className="max-w-[200px]">Pesan</TableHead>
                    <TableHead>Metadata</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(f => (
                    <TableRow key={f.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedFeedback(f); setResolutionNotes(f.resolution_notes || ""); }}>
                      <TableCell className="text-sm">{f.tenants?.name || "-"}</TableCell>
                      <TableCell className="text-sm">{f.reporter_name || "-"}</TableCell>
                      <TableCell>{renderStars(f.rating)}</TableCell>
                      <TableCell>
                        <Badge variant={f.feedback_type === "bug" ? "destructive" : "secondary"} className="text-xs">
                          {f.feedback_type === "bug" ? <Bug className="w-3 h-3 mr-1" /> : <Lightbulb className="w-3 h-3 mr-1" />}
                          {f.feedback_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{f.message}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {f.os_info && <span>{f.os_info}</span>}
                        {f.browser_info && <span className="block">{f.browser_info}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.status === "open" ? "outline" : "default"} className="text-xs">
                          {f.status === "open" ? "Open" : "Resolved"}
                        </Badge>
                      </TableCell>
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedFeedback} onOpenChange={(open) => !open && setSelectedFeedback(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detail Feedback</DialogTitle>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Organisasi:</span><p className="font-medium">{selectedFeedback.tenants?.name || "-"}</p></div>
                <div><span className="text-muted-foreground">Nama:</span><p className="font-medium">{selectedFeedback.reporter_name}</p></div>
                <div><span className="text-muted-foreground">Role:</span><p className="font-medium">{selectedFeedback.reporter_role}</p></div>
                <div><span className="text-muted-foreground">Rating:</span><div>{renderStars(selectedFeedback.rating)}</div></div>
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
                  <span className="text-sm text-muted-foreground">Screenshot:</span>
                  <img src={selectedFeedback.screenshot_url} alt="Screenshot" className="mt-1 rounded-lg max-h-[200px] object-contain" />
                </div>
              )}
              {selectedFeedback.status === "open" && (
                <div className="space-y-2 border-t pt-4">
                  <span className="text-sm font-medium">Resolusi:</span>
                  <Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Catatan resolusi..." rows={2} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedFeedback(null)}>Tutup</Button>
            {selectedFeedback?.status === "open" && (
              <Button onClick={handleResolve} disabled={isResolving}>
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Tandai Resolved
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}
