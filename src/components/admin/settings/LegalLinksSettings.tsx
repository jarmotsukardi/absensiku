import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2, Edit, FileText, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import DOMPurify from "dompurify";

interface LegalLink {
  id: string;
  label: string;
  url: string;
  content: string;
  sort_order: number;
}

const ITEMS_PER_PAGE = 10;

export function LegalLinksSettings() {
  const [links, setLinks] = useState<LegalLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LegalLink | null>(null);
  const [formData, setFormData] = useState({ label: "", url: "#", content: "", sort_order: 1 });
  const [previewContent, setPreviewContent] = useState<{ title: string; content: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "legal_links_settings")
        .maybeSingle();

      if (data?.value && Array.isArray(data.value)) {
        setLinks((data.value as unknown as LegalLink[]).sort((a, b) => a.sort_order - b.sort_order));
      } else {
        // Default legal links
        setLinks([
          { id: "1", label: "Kebijakan Privasi", url: "/privacy-policy", content: "", sort_order: 1 },
          { id: "2", label: "Syarat & Ketentuan", url: "#", content: "<p>Syarat dan ketentuan penggunaan layanan.</p>", sort_order: 2 },
        ]);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "legal_links_settings")
        .maybeSingle();

      const jsonValue = JSON.parse(JSON.stringify(links));

      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: jsonValue, updated_at: new Date().toISOString() })
          .eq("key", "legal_links_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({ key: "legal_links_settings", value: jsonValue });
      }

      // Also update footer_settings to sync legal_links
      const { data: footerData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "footer_settings")
        .maybeSingle();

      if (footerData?.value) {
        const footerSettings = footerData.value as Record<string, unknown>;
        footerSettings.legal_links = links;
        await supabase
          .from("system_settings")
          .update({ value: footerSettings, updated_at: new Date().toISOString() })
          .eq("key", "footer_settings");
      }

      toast.success("Legal links berhasil disimpan");
    } catch (err) {
      toast.error("Gagal menyimpan");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ label: "", url: "#", content: "", sort_order: links.length + 1 });
    setIsDialogOpen(true);
  };

  const handleEdit = (item: LegalLink) => {
    setEditingItem(item);
    setFormData({
      label: item.label,
      url: item.url,
      content: item.content,
      sort_order: item.sort_order,
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

  const handlePreview = (item: LegalLink) => {
    setPreviewContent({ title: item.label, content: item.content });
    setIsPreviewOpen(true);
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
              <FileText className="h-5 w-5" />
              Legal Links & Syarat Ketentuan
            </CardTitle>
            <CardDescription>Kelola halaman legal seperti Syarat & Ketentuan yang tampil di footer</CardDescription>
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
                <TableHead>URL</TableHead>
                <TableHead>Konten</TableHead>
                <TableHead className="w-[120px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Belum ada legal links
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLinks.map((link, index) => (
                  <TableRow key={link.id}>
                    <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                    <TableCell className="font-medium">{link.label}</TableCell>
                    <TableCell className="text-muted-foreground">{link.url}</TableCell>
                    <TableCell>
                      {link.content ? (
                        <Button variant="ghost" size="sm" onClick={() => handlePreview(link)}>
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
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
            <DialogTitle>{editingItem ? "Edit Legal Link" : "Tambah Legal Link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Label *</Label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Syarat & Ketentuan"
                />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="# untuk overlay atau /path"
                />
                <p className="text-xs text-muted-foreground">Gunakan # jika ingin menampilkan konten sebagai overlay</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Konten (Rich Text)</Label>
              <RichTextEditor
                value={formData.content}
                onChange={(value) => setFormData({ ...formData, content: value })}
                placeholder="Tulis konten syarat & ketentuan..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewContent?.title}</DialogTitle>
          </DialogHeader>
          <div className="legal-content-preview prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
            {previewContent?.content && (
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(previewContent.content, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div'],
                    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height', 'style'],
                    ALLOW_DATA_ATTR: false
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
