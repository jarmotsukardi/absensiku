import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Star, Bug, Lightbulb, Download, Search, MessageSquare, CheckCircle2, Loader2, BarChart3, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

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

export default function FeedbackManagement() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [filterRating, setFilterRating] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  // Stats
  const [stats, setStats] = useState({ total: 0, avgRating: 0, openBugs: 0 });

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("feedback_reports")
        .select("*, tenants(name)")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      const items = (data || []) as FeedbackItem[];
      setFeedbacks(items);

      // Calculate stats
      const total = items.length;
      const ratings = items.filter(f => f.rating).map(f => f.rating!);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      const openBugs = items.filter(f => f.feedback_type === "bug" && f.status === "open").length;
      setStats({ total, avgRating: Math.round(avgRating * 10) / 10, openBugs });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedFeedback) return;
    setIsResolving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("feedback_reports")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: resolutionNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedFeedback.id);

      toast.success("Feedback ditandai selesai");
      setSelectedFeedback(null);
      setResolutionNotes("");
      fetchFeedbacks();
    } catch {
      toast.error("Gagal mengupdate feedback");
    } finally {
      setIsResolving(false);
    }
  };

  const exportCsv = () => {
    const filtered = getFilteredData();
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
  };

  const getFilteredData = () => {
    return feedbacks.filter(f => {
      if (activeTab === "admin" && f.reporter_role !== "admin_organisasi") return false;
      if (activeTab === "pegawai" && f.reporter_role !== "pegawai") return false;
      if (filterRating !== "all" && f.rating?.toString() !== filterRating) return false;
      if (filterType !== "all" && f.feedback_type !== filterType) return false;
      if (searchQuery && !f.message.toLowerCase().includes(searchQuery.toLowerCase()) && !f.reporter_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  };

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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>Daftar Feedback</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
