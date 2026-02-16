import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Search, Edit, Trash2, Building, Hospital, GraduationCap, Landmark, Factory, Store, Hotel, HardHat, Truck, Briefcase, Palette } from "lucide-react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { RichTextEditor } from "@/components/editor/RichTextEditor";

interface InstitutionType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  description_html: string | null;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

const getIcon = (iconType: string) => {
  switch (iconType) {
    case "landmark": return Landmark;
    case "hospital": return Hospital;
    case "graduation": return GraduationCap;
    case "factory": return Factory;
    case "store": return Store;
    case "hotel": return Hotel;
    case "hard-hat": return HardHat;
    case "truck": return Truck;
    case "briefcase": return Briefcase;
    case "palette": return Palette;
    default: return Building;
  }
};

const iconOptions = [
  { value: "landmark", label: "Pemerintahan", Icon: Landmark },
  { value: "hospital", label: "Rumah Sakit", Icon: Hospital },
  { value: "building", label: "Gedung", Icon: Building },
  { value: "graduation", label: "Pendidikan", Icon: GraduationCap },
  { value: "factory", label: "Pabrik", Icon: Factory },
  { value: "store", label: "Toko", Icon: Store },
  { value: "hotel", label: "Hotel", Icon: Hotel },
  { value: "hard-hat", label: "Konstruksi", Icon: HardHat },
  { value: "truck", label: "Logistik", Icon: Truck },
  { value: "briefcase", label: "Kantor", Icon: Briefcase },
  { value: "palette", label: "Kreatif", Icon: Palette },
];
const ITEMS_PER_PAGE = 10;

export default function AdminInstitutionTypesManagement({ embedded = false }: { embedded?: boolean }) {
  const [types, setTypes] = useState<InstitutionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingType, setEditingType] = useState<InstitutionType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    description_html: "",
    icon: "building",
    is_active: true,
    sort_order: 0,
  });

  useEffect(() => { fetchTypes(); }, []);

  const fetchTypes = async () => {
    try {
      const { data, error } = await supabase.from("institution_types").select("*").order("sort_order");
      if (error) throw error;
      setTypes(data || []);
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        code: formData.code,
        description: formData.description,
        description_html: formData.description_html,
        icon: formData.icon,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
      };

      if (editingType) {
        const { error } = await supabase.from("institution_types").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingType.id);
        if (error) throw error;
        toast.success("Jenis instansi berhasil diperbarui");
      } else {
        const { error } = await supabase.from("institution_types").insert(payload);
        if (error) throw error;
        toast.success("Jenis instansi berhasil ditambahkan");
      }
      setIsDialogOpen(false);
      resetForm();
      fetchTypes();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (type: InstitutionType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      code: type.code,
      description: type.description || "",
      description_html: type.description_html || "",
      icon: type.icon,
      is_active: type.is_active,
      sort_order: type.sort_order,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin hapus jenis instansi ini?")) return;
    try {
      const { error } = await supabase.from("institution_types").delete().eq("id", id);
      if (error) throw error;
      toast.success("Berhasil dihapus");
      fetchTypes();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menghapus";
      toast.error(message);
    }
  };

  const resetForm = () => {
    setEditingType(null);
    setFormData({ name: "", code: "", description: "", description_html: "", icon: "building", is_active: true, sort_order: 0 });
  };

  const filteredTypes = types.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.code.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredTypes.length / ITEMS_PER_PAGE));
  const paginatedTypes = filteredTypes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, types.length]);

  const content = (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Manajemen Jenis Instansi</h1>
          <p className="text-muted-foreground">Kelola jenis instansi secara terpusat. Perubahan berlaku untuk semua organisasi.</p>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit" : "Tambah"} Jenis Instansi</DialogTitle>
            <DialogDescription>{editingType ? "Perbarui informasi" : "Tambahkan jenis baru"}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Kode</Label>
              <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} required />
            </div>
            <div className="space-y-2">
              <Label>Deskripsi (Rich Text)</Label>
              <RichTextEditor
                value={formData.description_html || formData.description || ""}
                onChange={(html) => {
                  const plainText = html.replace(/<[^>]*>/g, "").trim();
                  setFormData({ ...formData, description_html: html, description: plainText });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Ikon</Label>
              <div className="flex gap-1.5 flex-wrap">
                {iconOptions.map(({ value, label, Icon }) => (
                  <Button key={value} type="button" variant={formData.icon === value ? "default" : "outline"} size="sm" onClick={() => setFormData({ ...formData, icon: value })} className="gap-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5" />{label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Urutan</Label>
              <Input type="number" value={formData.sort_order} onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={(c) => setFormData({ ...formData, is_active: c })} />
              <Label>Aktif</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div><CardTitle>Daftar Jenis Instansi</CardTitle><CardDescription>Total {filteredTypes.length}</CardDescription></div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-full sm:w-64" />
              </div>
              <Button onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Tambah</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div> : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-12">No</TableHead><TableHead>Ikon</TableHead><TableHead>Nama</TableHead><TableHead>Kode</TableHead>
                    <TableHead className="hidden md:table-cell">Deskripsi</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filteredTypes.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Tidak ada data</TableCell></TableRow>
                    ) : paginatedTypes.map((type, i) => {
                      const IC = getIcon(type.icon);
                      return (
                        <TableRow key={type.id}>
                          <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + i + 1}</TableCell>
                          <TableCell><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><IC className="h-5 w-5 text-primary" /></div></TableCell>
                          <TableCell className="font-medium">{type.name}</TableCell>
                          <TableCell><Badge variant="outline">{type.code}</Badge></TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">{type.description || "-"}</TableCell>
                          <TableCell><Badge variant={type.is_active ? "default" : "secondary"}>{type.is_active ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(type)}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(type.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {filteredTypes.length > 0 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Halaman {currentPage} dari {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );

  if (embedded) return content;

  return (
    <SuperAdminLayout>
      {content}
    </SuperAdminLayout>
  );
}
