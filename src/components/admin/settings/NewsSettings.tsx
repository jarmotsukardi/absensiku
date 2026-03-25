import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, Newspaper, Plus, Edit, Trash2, Eye, EyeOff, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface NewsSettingsData {
  title: string;
  subtitle: string;
  max_display: number;
  show_category: boolean;
  show_date: boolean;
  show_excerpt: boolean;
}

interface NewsItem {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  image_url: string | null;
  category: string | null;
  is_published: boolean;
  created_at: string;
}

const defaultSettings: NewsSettingsData = {
  title: "Berita Terbaru",
  subtitle: "Update terbaru seputar AbsensiKu",
  max_display: 6,
  show_category: true,
  show_date: true,
  show_excerpt: true,
};

const ITEMS_PER_PAGE = 10;

export function NewsSettings() {
  const confirmDialog = useConfirmDialog();
  const [settings, setSettings] = useState<NewsSettingsData>(defaultSettings);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    excerpt: "",
    image_url: "",
    category: "berita",
    is_published: false,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch settings
      const { data: settingsData } = await withTimeout(
        () =>
          supabase
            .from("homepage_sections")
            .select("settings")
            .eq("section_key", "news")
            .maybeSingle(),
        10000,
        "Load news settings timeout"
      );

      if (settingsData?.settings && typeof settingsData.settings === 'object' && !Array.isArray(settingsData.settings)) {
        setSettings({ ...defaultSettings, ...(settingsData.settings as Record<string, unknown>) as Partial<NewsSettingsData> });
      }

      // Fetch news (using articles table with category = berita)
      const { data: newsData } = await withTimeout(
        () =>
          supabase
            .from("articles")
            .select("*")
            .eq("category", "berita")
            .order("created_at", { ascending: false }),
        10000,
        "Load news list timeout"
      );

      setNewsList(newsData || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.news.fetch");
      toast.error(appendErrorReference("Gagal memuat pengaturan berita", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const { error } = await withTimeout(
        () =>
          supabase
            .from("homepage_sections")
            .update({ 
              settings: JSON.parse(JSON.stringify(settings)) as Json,
              updated_at: new Date().toISOString()
            })
            .eq("section_key", "news"),
        10000,
        "Save news settings timeout"
      );

      if (error) throw error;
      toast.success("Pengaturan berita berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.news.save_settings");
      toast.error(appendErrorReference("Gagal menyimpan pengaturan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingNews(null);
    setFormData({ title: "", content: "", excerpt: "", image_url: "", category: "berita", is_published: false });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: NewsItem) => {
    setEditingNews(item);
    setFormData({
      title: item.title,
      content: item.content,
      excerpt: item.excerpt || "",
      image_url: item.image_url || "",
      category: item.category || "berita",
      is_published: item.is_published,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Berita",
        description: "Hapus berita ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }
    try {
      const { error } = await withTimeout(
        () => supabase.from("articles").delete().eq("id", id),
        10000,
        "Delete news timeout"
      );
      if (error) throw error;
      setNewsList(newsList.filter(n => n.id !== id));
      toast.success("Berita dihapus");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.news.delete", { article_id: id });
      toast.error(appendErrorReference("Gagal menghapus", errorRef));
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error("Judul wajib diisi");
      return;
    }

    try {
      const slug = formData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
      
      if (editingNews) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("articles")
              .update({
                title: formData.title,
                content: formData.content,
                excerpt: formData.excerpt || null,
                image_url: formData.image_url || null,
                category: "berita",
                is_published: formData.is_published,
                updated_at: new Date().toISOString(),
              })
              .eq("id", editingNews.id),
          10000,
          "Update news timeout"
        );
        
        if (error) throw error;
        toast.success("Berita diperbarui");
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("articles")
              .insert({
                title: formData.title,
                slug,
                content: formData.content,
                excerpt: formData.excerpt || null,
                image_url: formData.image_url || null,
                category: "berita",
                is_published: formData.is_published,
              }),
          10000,
          "Create news timeout"
        );
        
        if (error) throw error;
        toast.success("Berita ditambahkan");
      }
      
      setIsDialogOpen(false);
      fetchData();
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.news.submit", {
        article_id: editingNews?.id ?? null,
        mode: editingNews ? "edit" : "create",
      });
      const message = error instanceof Error ? error.message : "Gagal menyimpan data";
      toast.error(appendErrorReference("Gagal menyimpan: " + message, errorRef));
    }
  };

  const togglePublish = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await withTimeout(
        () => supabase.from("articles").update({ is_published: !currentStatus }).eq("id", id),
        10000,
        "Toggle publish news timeout"
      );
      if (error) throw error;
      setNewsList(newsList.map(n => n.id === id ? { ...n, is_published: !currentStatus } : n));
      toast.success(currentStatus ? "Berita di-unpublish" : "Berita dipublish");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.news.toggle_publish", {
        article_id: id,
        target_status: !currentStatus,
      });
      toast.error(appendErrorReference("Gagal mengubah status", errorRef));
    }
  };

  const totalPages = Math.ceil(newsList.length / ITEMS_PER_PAGE);
  const paginatedNews = newsList.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            Pengaturan Bagian Berita
          </CardTitle>
          <CardDescription>
            Atur tampilan bagian berita di halaman depan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Judul Bagian</Label>
              <Input
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="Berita Terbaru"
              />
            </div>
            <div className="space-y-2">
              <Label>Subjudul</Label>
              <Input
                value={settings.subtitle}
                onChange={(e) => setSettings({ ...settings, subtitle: e.target.value })}
                placeholder="Update terbaru seputar AbsensiKu"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Jumlah Berita Ditampilkan</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={settings.max_display}
              onChange={(e) => setSettings({ ...settings, max_display: parseInt(e.target.value) || 6 })}
              className="w-32"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label className="text-sm">Tampilkan Kategori</Label>
              <Switch checked={settings.show_category} onCheckedChange={(checked) => setSettings({ ...settings, show_category: checked })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label className="text-sm">Tampilkan Tanggal</Label>
              <Switch checked={settings.show_date} onCheckedChange={(checked) => setSettings({ ...settings, show_date: checked })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <Label className="text-sm">Tampilkan Ringkasan</Label>
              <Switch checked={settings.show_excerpt} onCheckedChange={(checked) => setSettings({ ...settings, show_excerpt: checked })} />
            </div>
          </div>

          <Button onClick={handleSaveSettings} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Simpan Pengaturan
          </Button>
        </CardContent>
      </Card>

      {/* News CRUD */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daftar Berita ({newsList.length})</CardTitle>
              <CardDescription>Kelola berita yang ditampilkan di halaman depan</CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Tambah Berita
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Judul</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedNews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Belum ada berita
                  </TableCell>
                </TableRow>
              ) : (
                paginatedNews.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium line-clamp-1">{item.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{item.excerpt}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.is_published ? "default" : "secondary"}>
                        {item.is_published ? "Dipublikasikan" : "Draf"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.created_at ? format(new Date(item.created_at), "d MMM yyyy", { locale: idLocale }) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => togglePublish(item.id, item.is_published)}>
                          {item.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">Halaman {currentPage} dari {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNews ? "Edit Berita" : "Tambah Berita"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Judul *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Judul berita" />
            </div>
            <div className="space-y-2">
              <Label>Ringkasan</Label>
              <Textarea value={formData.excerpt} onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })} placeholder="Ringkasan singkat..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>URL Gambar</Label>
              <Input value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Konten</Label>
              <RichTextEditor value={formData.content} onChange={(val) => setFormData({ ...formData, content: val })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_published} onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })} />
              <Label>Publish langsung</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
