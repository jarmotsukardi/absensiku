import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Edit, Link2, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import DOMPurify from "dompurify";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

interface QuickLink {
  id: string;
  label: string;
  url: string;
  content: string;
  sort_order: number;
  link_type: "internal" | "anchor" | "overlay";
  is_active: boolean;
}

const ITEMS_PER_PAGE = 10;

export function QuickLinksSettings() {
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QuickLink | null>(null);
  const [formData, setFormData] = useState<Omit<QuickLink, "id">>({
    label: "",
    url: "#",
    content: "",
    sort_order: 1,
    link_type: "anchor",
    is_active: true,
  });
  const [previewContent, setPreviewContent] = useState<{ title: string; content: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "quick_links_settings")
            .maybeSingle(),
        10000,
        "Load quick links settings timeout"
      );

      if (data?.value && Array.isArray(data.value)) {
        setLinks((data.value as unknown as QuickLink[]).sort((a, b) => a.sort_order - b.sort_order));
      } else {
        // Default quick links
        setLinks([
          { id: "1", label: "Fitur", url: "/#fitur", content: "", sort_order: 1, link_type: "anchor", is_active: true },
          { id: "2", label: "Harga", url: "/#harga", content: "", sort_order: 2, link_type: "anchor", is_active: true },
          { id: "3", label: "FAQ", url: "/#faq", content: "", sort_order: 3, link_type: "anchor", is_active: true },
          { id: "4", label: "Tentang", url: "/about", content: "", sort_order: 4, link_type: "internal", is_active: true },
        ]);
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.quick_links.fetch");
      toast.error(appendErrorReference("Gagal memuat quick links", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("id")
            .eq("key", "quick_links_settings")
            .maybeSingle(),
        10000,
        "Load quick links existing setting timeout"
      );

      const jsonValue = JSON.parse(JSON.stringify(links));

      if (existing) {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: jsonValue, updated_at: new Date().toISOString() })
              .eq("key", "quick_links_settings"),
          10000,
          "Update quick links settings timeout"
        );
        if (error) throw error;
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .insert({ key: "quick_links_settings", value: jsonValue }),
          10000,
          "Insert quick links settings timeout"
        );
        if (error) throw error;
      }

      // Also update footer_settings to sync quick_links
      const { data: footerData } = await withTimeout(
        () =>
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "footer_settings")
            .maybeSingle(),
        10000,
        "Load footer settings for quick links sync timeout"
      );

      if (footerData?.value) {
        const footerSettings = JSON.parse(JSON.stringify(footerData.value));
        footerSettings.quick_links = links.filter(l => l.is_active).map(l => ({
          id: l.id,
          label: l.label,
          url: l.link_type === "overlay" ? "#" : l.url,
          content: l.link_type === "overlay" ? l.content : undefined,
        }));
        const { error } = await withTimeout(
          () =>
            supabase
              .from("system_settings")
              .update({ value: footerSettings, updated_at: new Date().toISOString() })
              .eq("key", "footer_settings"),
          10000,
          "Update footer quick links sync timeout"
        );
        if (error) throw error;
      }

      toast.success("Quick links berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.quick_links.save");
      toast.error(appendErrorReference("Gagal menyimpan", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ label: "", url: "#", content: "", sort_order: links.length + 1, link_type: "anchor", is_active: true });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: QuickLink) => {
    setEditingItem(item);
    setFormData({
      label: item.label,
      url: item.url,
      content: item.content,
      sort_order: item.sort_order,
      link_type: item.link_type,
      is_active: item.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setLinks(links.filter(l => l.id !== id));
    toast.success("Item dihapus. Klik 'Simpan' untuk menyimpan perubahan.");
  };

  const handleSubmit = () => {
    if (!formData.label) {
      toast.error("Label wajib diisi");
      return;
    }

    if (editingItem) {
      setLinks(links.map(l => l.id === editingItem.id ? { ...l, ...formData } : l));
      toast.success("Item diperbarui");
    } else {
      setLinks([...links, { id: Date.now().toString(), ...formData }]);
      toast.success("Item ditambahkan");
    }
    setIsDialogOpen(false);
  };

  const handlePreview = (item: QuickLink) => {
    setPreviewContent({ title: item.label, content: item.content });
    setIsPreviewOpen(true);
  };

  const getLinkTypeLabel = (type: string) => {
    switch (type) {
      case "internal": return "Halaman Internal";
      case "anchor": return "Anchor (gulir ke bagian)";
      case "overlay": return "Overlay/Popup";
      default: return type;
    }
  };

  const totalPages = Math.ceil(links.length / ITEMS_PER_PAGE);
  const paginatedLinks = links.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Tautan Cepat
            </CardTitle>
            <CardDescription>Kelola link navigasi seperti Fitur, Harga, FAQ yang tampil di footer dan header</CardDescription>
          </div>
          <Button onClick={handleAdd} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Tambah
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">No</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>URL/Konten</TableHead>
                <TableHead className="w-[80px]">Aktif</TableHead>
                <TableHead className="w-[120px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Belum ada quick links
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLinks.map((link, index) => (
                  <TableRow key={link.id} className={!link.is_active ? "opacity-50" : ""}>
                    <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                    <TableCell className="font-medium">{link.label}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${
                        link.link_type === "overlay" ? "bg-primary/10 text-primary" :
                        link.link_type === "internal" ? "bg-blue-500/10 text-blue-600" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {getLinkTypeLabel(link.link_type)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {link.link_type === "overlay" ? (
                        <Button variant="ghost" size="sm" onClick={() => handlePreview(link)}>
                          <Eye className="h-4 w-4 mr-1" />
                          Pratinjau
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">{link.url}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={link.is_active}
                        onCheckedChange={(checked) => {
                          setLinks(links.map(l => l.id === link.id ? { ...l, is_active: checked } : l));
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(link)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(link.id)}>
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
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Quick Link" : "Tambah Quick Link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Label *</Label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Fitur"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe Link</Label>
                <Select
                  value={formData.link_type}
                  onValueChange={(value: "internal" | "anchor" | "overlay") => setFormData({ ...formData, link_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anchor">Anchor (gulir ke bagian)</SelectItem>
                    <SelectItem value="internal">Halaman Internal (/path)</SelectItem>
                    <SelectItem value="overlay">Overlay/Popup dengan Rich Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.link_type !== "overlay" && (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder={formData.link_type === "anchor" ? "/#fitur" : "/about"}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.link_type === "anchor" 
                    ? "Gunakan format /#section-id untuk scroll ke section"
                    : "Gunakan format /path untuk halaman internal"}
                </p>
              </div>
            )}

            {formData.link_type === "overlay" && (
              <div className="space-y-2">
                <Label>Konten (Rich Text)</Label>
                <RichTextEditor
                  value={formData.content}
                  onChange={(value) => setFormData({ ...formData, content: value })}
                  placeholder="Tulis konten overlay..."
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pratinjau */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewContent?.title}</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {previewContent?.content && (
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(previewContent.content, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                    ALLOWED_ATTR: ['href', 'target', 'rel'],
                  }),
                }}
              />
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
