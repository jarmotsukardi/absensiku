import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, FileText, Eye, EyeOff, ChevronLeft, ChevronRight, Plus, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { RichTextEditor } from "@/components/editor/RichTextEditor";

interface ArticlesSectionSettings {
  section_title: string;
  section_subtitle: string;
  show_section: boolean;
  max_articles: number;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  image_url: string | null;
  category: string | null;
  is_published: boolean;
  created_at: string;
}

const defaultSettings: ArticlesSectionSettings = {
  section_title: "Artikel & Berita Terbaru",
  section_subtitle: "Update informasi seputar absensi dan manajemen kehadiran",
  show_section: true,
  max_articles: 6,
};

const ITEMS_PER_PAGE = 10;

export function ArticlesSettings() {
  const [settings, setSettings] = useState<ArticlesSectionSettings>(defaultSettings);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    excerpt: "",
    image_url: "",
    category: "artikel",
    is_published: false,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch section settings
      const { data: settingsData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "articles_section_settings")
        .maybeSingle();

      if (settingsData?.value) {
        setSettings({ ...defaultSettings, ...(settingsData.value as Record<string, unknown>) });
      }

      // Fetch articles (excluding berita category)
      const { data: articlesData } = await supabase
        .from("articles")
        .select("*")
        .or("category.neq.berita,category.is.null")
        .order("created_at", { ascending: false });

      setArticles(articlesData || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "articles_section_settings")
        .maybeSingle();

      const jsonValue = JSON.parse(JSON.stringify(settings));

      if (existing) {
        await supabase.from("system_settings").update({ value: jsonValue, updated_at: new Date().toISOString() }).eq("key", "articles_section_settings");
      } else {
        await supabase.from("system_settings").insert({ key: "articles_section_settings", value: jsonValue });
      }
      
      toast.success("Pengaturan artikel berhasil disimpan");
    } catch (err) {
      toast.error("Gagal menyimpan pengaturan");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingArticle(null);
    setFormData({ title: "", content: "", excerpt: "", image_url: "", category: "artikel", is_published: false });
    setIsDialogOpen(true);
  };

  const handleEdit = (article: Article) => {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      content: article.content,
      excerpt: article.excerpt || "",
      image_url: article.image_url || "",
      category: article.category || "artikel",
      is_published: article.is_published,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus artikel ini?")) return;
    try {
      await supabase.from("articles").delete().eq("id", id);
      setArticles(articles.filter(a => a.id !== id));
      toast.success("Artikel dihapus");
    } catch (error) {
      toast.error("Gagal menghapus");
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error("Judul wajib diisi");
      return;
    }

    try {
      const slug = formData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
      
      if (editingArticle) {
        const { error } = await supabase
          .from("articles")
          .update({
            title: formData.title,
            content: formData.content,
            excerpt: formData.excerpt || null,
            image_url: formData.image_url || null,
            category: formData.category,
            is_published: formData.is_published,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingArticle.id);
        
        if (error) throw error;
        toast.success("Artikel diperbarui");
      } else {
        const { error } = await supabase
          .from("articles")
          .insert({
            title: formData.title,
            slug,
            content: formData.content,
            excerpt: formData.excerpt || null,
            image_url: formData.image_url || null,
            category: formData.category,
            is_published: formData.is_published,
          });
        
        if (error) throw error;
        toast.success("Artikel ditambahkan");
      }
      
      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error("Gagal menyimpan: " + error.message);
    }
  };

  const togglePublish = async (articleId: string, currentStatus: boolean) => {
    try {
      await supabase.from("articles").update({ is_published: !currentStatus }).eq("id", articleId);
      setArticles(articles.map(a => a.id === articleId ? { ...a, is_published: !currentStatus } : a));
      toast.success(currentStatus ? "Artikel di-unpublish" : "Artikel dipublish");
    } catch (error) {
      toast.error("Gagal mengubah status");
    }
  };

  const totalPages = Math.ceil(articles.length / ITEMS_PER_PAGE);
  const paginatedArticles = articles.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Section Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Pengaturan Section Artikel
          </CardTitle>
          <CardDescription>Atur tampilan section artikel di halaman depan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Tampilkan Section</Label>
              <p className="text-sm text-muted-foreground">Aktifkan section artikel di halaman depan</p>
            </div>
            <Switch 
              checked={settings.show_section} 
              onCheckedChange={(checked) => setSettings({ ...settings, show_section: checked })} 
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Judul Section</Label>
              <Input 
                value={settings.section_title} 
                onChange={(e) => setSettings({ ...settings, section_title: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label>Max Artikel Ditampilkan</Label>
              <Input 
                type="number" 
                min={1} 
                max={12}
                value={settings.max_articles} 
                onChange={(e) => setSettings({ ...settings, max_articles: parseInt(e.target.value) || 6 })} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sub Judul</Label>
            <Input 
              value={settings.section_subtitle} 
              onChange={(e) => setSettings({ ...settings, section_subtitle: e.target.value })} 
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan Pengaturan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Articles CRUD */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daftar Artikel ({articles.length})</CardTitle>
              <CardDescription>Kelola artikel yang ditampilkan di halaman depan</CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Tambah Artikel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Judul</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Belum ada artikel
                  </TableCell>
                </TableRow>
              ) : (
                paginatedArticles.map((article) => (
                  <TableRow key={article.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium line-clamp-1">{article.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{article.excerpt}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{article.category || "Umum"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={article.is_published ? "default" : "secondary"}>
                        {article.is_published ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {article.created_at ? format(new Date(article.created_at), "d MMM yyyy", { locale: idLocale }) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => togglePublish(article.id, article.is_published)}>
                          {article.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(article)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(article.id)}>
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
            <DialogTitle>{editingArticle ? "Edit Artikel" : "Tambah Artikel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Judul *</Label>
                <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Judul artikel" />
              </div>
              <div className="space-y-2">
                <Label>Kategori</Label>
                <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="artikel, tutorial, tips" />
              </div>
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
