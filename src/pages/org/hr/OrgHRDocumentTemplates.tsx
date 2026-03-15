import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Plus, Pencil, Trash2, FileText, Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type DocumentTemplate = {
  id?: string;
  template_name: string;
  template_type: string;
  template_content: string;
  variables: string[];
  description?: string;
  is_active: boolean;
  version: number;
};

const TEMPLATE_TYPES = [
  { value: "KONTRAK_PKWT", label: "Kontrak PKWT" },
  { value: "KONTRAK_PKWTT", label: "Kontrak PKWTT" },
  { value: "KONTRAK_MAGANG", label: "Kontrak Magang" },
  { value: "SP1", label: "Surat Peringatan 1 (SP1)" },
  { value: "SP2", label: "Surat Peringatan 2 (SP2)" },
  { value: "SP3", label: "Surat Peringatan 3 (SP3)" },
  { value: "MUTASI", label: "Surat Mutasi" },
  { value: "PROMOSI", label: "Surat Promosi" },
  { value: "RESIGN", label: "Surat Pengunduran Diri" },
  { value: "REKOMENDASI", label: "Surat Rekomendasi" },
  { value: "LAINNYA", label: "Lainnya" },
];

const COMMON_VARIABLES = [
  "{{nama}}",
  "{{nip}}",
  "{{jabatan}}",
  "{{unit_kerja}}",
  "{{tanggal_lahir}}",
  "{{alamat}}",
  "{{tanggal_mulai}}",
  "{{tanggal_selesai}}",
  "{{nomor_surat}}",
  "{{tanggal_surat}}",
  "{{nama_pejabat}}",
  "{{nip_pejabat}}",
  "{{jabatan_pejabat}}",
];

const initialTemplateState: DocumentTemplate = {
  template_name: "",
  template_type: "KONTRAK_PKWT",
  template_content: "",
  variables: [],
  description: "",
  is_active: true,
  version: 1,
};

const PAGE_SIZE = 10;

export default function OrgHRDocumentTemplates() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [formState, setFormState] = useState<DocumentTemplate>(initialTemplateState);
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/document-templates");
  const confirmDialog = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = await resolveOrgTenantId();
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      setTenantId(resolvedTenantId);

      const { data, error } = await supabase
        .from("hr_document_templates")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("template_name", { ascending: true });

      if (error) throw error;
      setTemplates((data || []) as DocumentTemplate[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.document-templates.fetch");
      toast.error(appendErrorReference("Gagal memuat template dokumen", ref));
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleOpenDialog = (template?: DocumentTemplate) => {
    if (!access.canConfigure) {
      toast.error("Aksi pengaturan template hanya tersedia untuk admin organisasi.");
      return;
    }
    if (template) {
      setEditingTemplateId(template.id || null);
      setFormState({
        template_name: template.template_name,
        template_type: template.template_type,
        template_content: template.template_content,
        variables: template.variables || [],
        description: template.description || "",
        is_active: template.is_active,
        version: template.version,
      });
    } else {
      setEditingTemplateId(null);
      setFormState({ ...initialTemplateState, variables: [] });
    }
    setIsDialogOpen(true);
  };

  const handleAddVariable = (variable: string) => {
    if (!formState.variables.includes(variable)) {
      setFormState((prev) => ({
        ...prev,
        variables: [...prev.variables, variable],
      }));
    }
  };

  const handleRemoveVariable = (variable: string) => {
    setFormState((prev) => ({
      ...prev,
      variables: prev.variables.filter((v) => v !== variable),
    }));
  };

  const handleInsertVariable = (variable: string) => {
    const textarea = document.getElementById("template_content") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formState.template_content;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + variable + after;
      setFormState((prev) => ({ ...prev, template_content: newText }));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      handleAddVariable(variable);
    }
  };

  const handleSave = async () => {
    if (!access.canConfigure) {
      toast.error("Aksi simpan template hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!formState.template_name.trim()) {
      toast.error("Nama template wajib diisi.");
      return;
    }
    if (!formState.template_content.trim()) {
      toast.error("Konten template wajib diisi.");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        tenant_id: tenantId,
        template_name: formState.template_name.trim(),
        template_type: formState.template_type,
        template_content: formState.template_content.trim(),
        variables: formState.variables,
        description: formState.description?.trim() || null,
        is_active: formState.is_active,
        version: editingTemplateId ? formState.version + 1 : 1,
      };

      let error: Error | null = null;

      if (editingTemplateId) {
        const { error: updateError } = await supabase
          .from("hr_document_templates")
          .update(payload)
          .eq("id", editingTemplateId)
          .eq("tenant_id", tenantId);
        error = updateError || null;
      } else {
        const { error: insertError } = await supabase.from("hr_document_templates").insert(payload);
        error = insertError || null;
      }

      if (error) throw error;

      toast.success(`Templat dokumen berhasil ${editingTemplateId ? "diperbarui" : "ditambahkan"}.`);
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.document-templates.save");
      toast.error(appendErrorReference(`Gagal menyimpan template dokumen`, ref));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (templateId: string, templateName: string) => {
    if (!access.canConfigure) {
      toast.error("Aksi hapus template hanya tersedia untuk admin organisasi.");
      return;
    }
    const confirmed = await confirmDialog({
      title: "Hapus Templat Dokumen",
      description: `Templat "${templateName}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("hr_document_templates")
        .delete()
        .eq("id", templateId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      toast.success(`Templat "${templateName}" berhasil dihapus.`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.document-templates.delete");
      toast.error(appendErrorReference("Gagal menghapus template dokumen", ref));
    }
  };

  const handleDuplicate = async (template: DocumentTemplate) => {
    if (!access.canConfigure) {
      toast.error("Aksi duplikasi template hanya tersedia untuk admin organisasi.");
      return;
    }
    try {
      const payload = {
        tenant_id: tenantId,
        template_name: `${template.template_name} (Copy)`,
        template_type: template.template_type,
        template_content: template.template_content,
        variables: template.variables,
        description: template.description,
        is_active: false,
        version: 1,
      };

      const { error } = await supabase.from("hr_document_templates").insert(payload);
      if (error) throw error;

      toast.success("Templat berhasil diduplikasi.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.document-templates.duplicate");
      toast.error(appendErrorReference("Gagal menduplikasi template", ref));
    }
  };

  const handlePreview = (template: DocumentTemplate) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
  };

  const templateStats = useMemo(() => {
    const active = templates.filter((t) => t.is_active).length;
    const byType = new Map<string, number>();
    templates.forEach((t) => {
      byType.set(t.template_type, (byType.get(t.template_type) || 0) + 1);
    });
    return { active, total: templates.length, byType };
  }, [templates]);
  const totalPages = Math.max(1, Math.ceil(templates.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedTemplates = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return templates.slice(from, from + PAGE_SIZE);
  }, [templates, safePage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Dokumen</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Templat Dokumen</h1>
          <p className="text-sm text-muted-foreground">
            Kelola templat HR untuk format, isi, dan penomoran surat tanpa menyimpan berkas file di aplikasi.
          </p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Templat Aktif"
            value={templateStats.active}
            icon={FileText}
            description="Templat yang aktif digunakan"
          />
          <StatCard
            title="Total Templat"
            value={templateStats.total}
            icon={FileText}
            description="Semua template dokumen"
          />
          <StatCard
            title="Jenis Templat"
            value={templateStats.byType.size}
            icon={FileText}
            description="Variasi jenis template"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daftar Templat Dokumen</CardTitle>
                <CardDescription>Templat untuk kontrak, surat peringatan, dan referensi surat HR lainnya.</CardDescription>
              </div>
              {access.canConfigure && (
                <Button onClick={() => handleOpenDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Templat
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Memuat data...</div>
            ) : templates.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Belum ada templat dokumen. Klik "Tambah Templat" untuk membuat.
              </div>
            ) : (
              <>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Nama Templat</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead className="text-center">Variabel</TableHead>
                    <TableHead className="text-center">Versi</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedTemplates.map((template, index) => (
                    <TableRow key={template.id}>
                      <TableCell>{(safePage - 1) * PAGE_SIZE + index + 1}</TableCell>
                      <TableCell className="font-medium">{template.template_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {TEMPLATE_TYPES.find((t) => t.value === template.template_type)?.label || template.template_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{template.variables.length}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">v{template.version}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={template.is_active ? "default" : "secondary"}>
                          {template.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreview(template)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {access.canConfigure && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDuplicate(template)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(template)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(template.id!, template.template_name)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
                <TablePaginationFooter
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalItems={templates.length}
                  pageSize={PAGE_SIZE}
                  itemLabel="template"
                  onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Dialog Tambah/Edit */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplateId ? "Ubah Templat Dokumen" : "Tambah Templat Dokumen"}
              </DialogTitle>
              <DialogDescription>
                Buat template dokumen dengan variabel yang dapat diganti otomatis.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="template_name">Nama Templat</Label>
                  <Input
                    id="template_name"
                    value={formState.template_name}
                    onChange={(e) => setFormState((prev) => ({ ...prev, template_name: e.target.value }))}
                    placeholder="Contoh: Templat Kontrak PKWT 2026"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="template_type">Jenis Templat</Label>
                  <Select
                    value={formState.template_type}
                    onValueChange={(value) => setFormState((prev) => ({ ...prev, template_type: value }))}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Deskripsi (opsional)</Label>
                  <Textarea
                    id="description"
                    value={formState.description}
                    onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Deskripsi singkat tentang template ini"
                    disabled={isLoading}
                    rows={2}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formState.is_active}
                    onChange={(e) => setFormState((prev) => ({ ...prev, is_active: e.target.checked }))}
                    disabled={isLoading}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="is_active">Aktif</Label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Variabel Templat</Label>
                  <p className="text-xs text-muted-foreground">
                    Klik variabel untuk menambahkan ke konten
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMMON_VARIABLES.map((variable) => (
                    <Button
                      key={variable}
                      variant={formState.variables.includes(variable) ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (formState.variables.includes(variable)) {
                          handleRemoveVariable(variable);
                        } else {
                          handleAddVariable(variable);
                        }
                      }}
                      disabled={isLoading || !access.canConfigure}
                      className="text-xs font-mono"
                    >
                      {variable}
                    </Button>
                  ))}
                </div>
                {formState.variables.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Label className="w-full text-sm">Variabel yang digunakan:</Label>
                    {formState.variables.map((variable) => (
                      <Badge key={variable} variant="secondary" className="font-mono text-xs">
                        {variable}
                        {access.canConfigure && (
                          <button
                            onClick={() => handleRemoveVariable(variable)}
                            className="ml-1 hover:text-destructive"
                          >
                            ×
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="template_content">Konten Templat</Label>
                <Textarea
                  id="template_content"
                  value={formState.template_content}
                  onChange={(e) => setFormState((prev) => ({ ...prev, template_content: e.target.value }))}
                  placeholder="Masukkan konten template. Gunakan variabel seperti {{nama}} untuk data yang akan diganti otomatis."
                  disabled={isLoading}
                  rows={15}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Tip: Gunakan variabel dari daftar di atas untuk data yang akan diganti otomatis saat generate dokumen.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !access.canConfigure}>
                {isLoading ? "Menyimpan..." : editingTemplateId ? "Perbarui" : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Preview */}
        {previewTemplate && (
          <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{previewTemplate.template_name}</DialogTitle>
                <DialogDescription>
                  Pratinjau templat - {TEMPLATE_TYPES.find((t) => t.value === previewTemplate.template_type)?.label}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={previewTemplate.is_active ? "default" : "secondary"}>
                    {previewTemplate.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Versi {previewTemplate.version}</span>
                </div>
                {previewTemplate.description && (
                  <div className="text-sm text-muted-foreground">{previewTemplate.description}</div>
                )}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Variabel yang Digunakan</Label>
                  <div className="flex flex-wrap gap-2">
                    {previewTemplate.variables.map((variable) => (
                      <Badge key={variable} variant="secondary" className="font-mono text-xs">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Konten Templat</Label>
                  <div className="rounded-md border bg-muted p-4 font-mono text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {previewTemplate.template_content}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
