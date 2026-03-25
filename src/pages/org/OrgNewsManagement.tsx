import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Newspaper, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { NewsThumbnailPreview } from "@/components/common/NewsThumbnailPreview";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

interface NewsItem {
  id: string;
  title: string;
  content: string;
  image_url?: string;
  is_published: boolean;
  is_pinned: boolean;
  created_at: string;
  tenant_id?: string;
}

const MAX_ANNOUNCEMENTS = 15;

const htmlToPlainText = (value: string): string => {
  if (!value) return "";
  const withBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n");
  const tmp = document.createElement("div");
  tmp.innerHTML = withBreaks;
  return (tmp.textContent || tmp.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
};

export default function OrgNewsManagement() {
  const ORG_NEWS_QUERY_TIMEOUT_MS = 15000;
  const ORG_NEWS_QUERY_RETRY_MAX = 1;
  const [news, setNews] = useState<NewsItem[]>([]);
  const [totalNews, setTotalNews] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    is_published: true,
    is_pinned: false,
  });
  
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const enforceAnnouncementLimit = useCallback(async (tid: string): Promise<number> => {
    let totalDeleted = 0;
    const batchSize = 100;

    while (true) {
      const { data: overflowRows, error: overflowError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("announcements")
              .select("id")
              .eq("tenant_id", tid)
              .order("created_at", { ascending: false })
              .range(MAX_ANNOUNCEMENTS, MAX_ANNOUNCEMENTS + batchSize - 1),
            ORG_NEWS_QUERY_TIMEOUT_MS,
            "org.news.enforce_limit.select_overflow timeout",
          ),
        {
          maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (overflowError) throw overflowError;

      const idsToDelete = (overflowRows || []).map((row) => row.id);
      if (idsToDelete.length === 0) break;

      const { error: deleteError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("announcements")
              .delete()
              .eq("tenant_id", tid)
              .in("id", idsToDelete),
            ORG_NEWS_QUERY_TIMEOUT_MS,
            "org.news.enforce_limit.delete_overflow timeout",
          ),
        {
          maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (deleteError) throw deleteError;

      totalDeleted += idsToDelete.length;
      if (idsToDelete.length < batchSize) break;
    }

    return totalDeleted;
  }, []);

  const fetchNews = useCallback(async (tid: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      let query = supabase
        .from("announcements")
        .select("*", { count: "exact" })
        .eq("tenant_id", tid);

      if (filterStatus === "published") {
        query = query.eq("is_published", true);
      } else if (filterStatus === "draft") {
        query = query.eq("is_published", false);
      }
      if (searchQuery.trim()) {
        const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
        query = query.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      const { data, error, count } = await withExponentialBackoff(
        () =>
          withTimeout(
            query
              .order("is_pinned", { ascending: false })
              .order("created_at", { ascending: false })
              .range(from, to),
            ORG_NEWS_QUERY_TIMEOUT_MS,
            "org.news.fetch timeout",
          ),
        {
          maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      setNews(data || []);
      setTotalNews(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "org.news.fetch", { tenant_id: tid });
      const message = appendErrorReference("Gagal memuat daftar pengumuman", errorRef);
      setLoadError(message);
      toast.error(message);
      setNews([]);
      setTotalNews(0);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [currentPage, filterStatus, itemsPerPage, searchQuery]);

  const fetchTenantAndNews = useCallback(async () => {
    let shouldStopLoading = true;
    try {
      setIsRetrying(false);
      const resolvedTenantId = await withExponentialBackoff(
        () =>
          withTimeout(
            resolveOrgTenantId(),
            ORG_NEWS_QUERY_TIMEOUT_MS,
            "org.news.fetch_tenant_and_news timeout",
          ),
        {
          maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (resolvedTenantId) {
        shouldStopLoading = false;
        setTenantId(resolvedTenantId);
      } else {
        setLoadError("Tenant organisasi tidak ditemukan. Hubungi admin.");
      }
    } catch (error) {
      const errorRef = reportError(error, "org.news.fetch_tenant_and_news");
      const message = appendErrorReference("Gagal memuat halaman pengumuman", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      if (shouldStopLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchTenantAndNews();
  }, [fetchTenantAndNews]);

  useEffect(() => {
    if (tenantId) {
      void (async () => {
        try {
          await enforceAnnouncementLimit(tenantId);
        } catch (error) {
          const errorRef = reportError(error, "org.news.enforce_limit", { tenant_id: tenantId });
          toast.error(appendErrorReference("Gagal membersihkan pengumuman lama otomatis", errorRef));
        }
        await fetchNews(tenantId);
      })();
    }
  }, [enforceAnnouncementLimit, fetchNews, tenantId]);

  const handleSubmit = async () => {
    const normalizedContent = htmlToPlainText(formData.content);
    if (!formData.title.trim() || !normalizedContent) {
      toast.error("Judul dan konten harus diisi");
      return;
    }

    try {
      setIsRetrying(false);
      if (isEditing && editingId) {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("announcements")
                .update({
                  title: formData.title,
                  content: normalizedContent,
                  is_published: formData.is_published,
                  is_pinned: formData.is_pinned,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", editingId)
                .eq("tenant_id", tenantId),
              ORG_NEWS_QUERY_TIMEOUT_MS,
              "org.news.submit.update timeout",
            ),
          {
            maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (error) throw error;
        toast.success("Pengumuman berhasil diperbarui");
      } else {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("announcements")
                .insert({
                  title: formData.title,
                  content: normalizedContent,
                  is_published: formData.is_published,
                  is_pinned: formData.is_pinned,
                  tenant_id: tenantId,
                }),
              ORG_NEWS_QUERY_TIMEOUT_MS,
              "org.news.submit.insert timeout",
            ),
          {
            maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (error) throw error;
        const deletedCount = tenantId ? await enforceAnnouncementLimit(tenantId) : 0;
        if (deletedCount > 0) {
          toast.info(`${deletedCount} pengumuman terlama dihapus otomatis (maksimal ${MAX_ANNOUNCEMENTS} data).`);
        }
        toast.success("Pengumuman berhasil ditambahkan");
      }

      setIsFormOpen(false);
      resetForm();
      if (tenantId) void fetchNews(tenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.news.submit", {
        is_editing: isEditing,
        announcement_id: editingId,
      });
      toast.error(appendErrorReference("Gagal menyimpan pengumuman", errorRef));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleEdit = (item: NewsItem) => {
    setFormData({
      title: item.title,
      content: htmlToPlainText(item.content),
      is_published: item.is_published,
      is_pinned: item.is_pinned,
    });
    setEditingId(item.id);
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("announcements")
              .delete()
              .eq("id", deletingId)
              .eq("tenant_id", tenantId),
            ORG_NEWS_QUERY_TIMEOUT_MS,
            "org.news.delete timeout",
          ),
        {
          maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      toast.success("Pengumuman berhasil dihapus");
      setDeleteDialogOpen(false);
      setDeletingId(null);
      if (tenantId) void fetchNews(tenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.news.delete", { announcement_id: deletingId });
      toast.error(appendErrorReference("Gagal menghapus pengumuman", errorRef));
    } finally {
      setIsRetrying(false);
    }
  };

  const togglePublish = async (id: string, currentStatus: boolean) => {
    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("announcements")
              .update({ is_published: !currentStatus })
              .eq("id", id)
              .eq("tenant_id", tenantId),
            ORG_NEWS_QUERY_TIMEOUT_MS,
            "org.news.toggle_publish timeout",
          ),
        {
          maxRetries: ORG_NEWS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      toast.success(currentStatus ? "Pengumuman disembunyikan" : "Pengumuman dipublikasikan");
      if (tenantId) void fetchNews(tenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.news.toggle_publish", {
        announcement_id: id,
        current_status: currentStatus,
      });
      toast.error(appendErrorReference("Gagal mengubah status", errorRef));
    } finally {
      setIsRetrying(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      is_published: true,
      is_pinned: false,
    });
    setIsEditing(false);
    setEditingId(null);
  };

  const totalPages = Math.max(1, Math.ceil(totalNews / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalNews / itemsPerPage));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalNews]);

  // Strip HTML untuk preview
  const stripHtml = (html: string) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Newspaper className="h-6 w-6" />
              Kelola Pengumuman
            </h1>
            <p className="text-muted-foreground">
              Kelola pengumuman dan informasi untuk pegawai. Konten ditulis dalam teks biasa (non-HTML).
            </p>
          </div>

          <Dialog open={isFormOpen} onOpenChange={(open) => {
            setIsFormOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
              <Plus className="h-4 w-4 mr-2" />
              Tambah Pengumuman
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {isEditing ? "Edit Pengumuman" : "Tambah Pengumuman Baru"}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Gunakan konten teks biasa. Sistem menyimpan maksimal {MAX_ANNOUNCEMENTS} pengumuman terbaru.
                </p>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Judul Pengumuman</Label>
                  <Input
                    placeholder="Masukkan judul pengumuman"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Konten</Label>
                  <Textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Tulis konten pengumuman"
                    rows={10}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_published}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                  />
                  <Label>Publikasikan langsung</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_pinned}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_pinned: checked })}
                  />
                  <Label>Sematkan di atas daftar</Label>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => {
                    setIsFormOpen(false);
                    resetForm();
                  }}>
                    Batal
                  </Button>
                  <Button onClick={handleSubmit}>
                    {isEditing ? "Simpan Perubahan" : "Tambah Pengumuman"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (tenantId) {
                      void fetchNews(tenantId);
                    } else {
                      void fetchTenantAndNews();
                    }
                  }}
                >
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data pengumuman...</p>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari pengumuman..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterStatus === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setFilterStatus("all"); setCurrentPage(1); }}
                >
                  Semua
                </Button>
                <Button
                  variant={filterStatus === "published" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setFilterStatus("published"); setCurrentPage(1); }}
                >
                  Dipublikasikan
                </Button>
                <Button
                  variant={filterStatus === "draft" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setFilterStatus("draft"); setCurrentPage(1); }}
                >
                  Draft
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Announcements Table */}
        <Card>
          <CardHeader>
            <CardTitle>Daftar Pengumuman ({totalNews})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Maksimal {MAX_ANNOUNCEMENTS} pengumuman per organisasi. Saat melebihi batas, pengumuman terlama dihapus otomatis.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : news.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery || filterStatus !== "all" 
                  ? "Tidak ada pengumuman yang sesuai filter"
                  : "Belum ada pengumuman. Klik tombol 'Tambah Pengumuman' untuk membuat."}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Cover</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Jam</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {news.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <NewsThumbnailPreview 
                            imageUrl={item.image_url} 
                            title={item.title} 
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium line-clamp-1">{item.title}</p>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {stripHtml(item.content).substring(0, 80)}...
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(item.created_at), "dd MMM yyyy", { locale: id })}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(item.created_at), "HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.is_published ? "default" : "secondary"}>
                            {item.is_published ? "Dipublikasikan" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => togglePublish(item.id, item.is_published)}
                              title={item.is_published ? "Sembunyikan" : "Publikasikan"}
                            >
                              {item.is_published ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDeletingId(item.id);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalNews > 0 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(currentPage - 1)}
                    >
                      Sebelumnya
                    </Button>
                    <span className="flex items-center px-3 text-sm">
                      Halaman {currentPage} dari {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(currentPage + 1)}
                    >
                      Selanjutnya
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_news" />
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pengumuman?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Pengumuman akan dihapus secara permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </OrganizationLayout>
  );
}
