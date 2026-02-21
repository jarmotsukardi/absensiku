import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, MapPin, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { validateOfficeCoordinateInput } from "@/lib/officeCoordinates";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type Office = Tables<"offices">;
type OPD = Tables<"opd">;

const ITEMS_PER_PAGE = 15;

export default function OrgWorkLocationsManagement() {
  const confirmDialog = useConfirmDialog();
  const [offices, setOffices] = useState<(Office & { opd?: OPD | null })[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOpdId, setFilterOpdId] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    opd_id: "",
    latitude: "",
    longitude: "",
    radius_meters: "100",
    address: "",
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterOpdId]);

  const fetchData = useCallback(async () => {
    setLoadError(null);
    try {
      const [officesRes, opdsRes] = await Promise.all([
        supabase.from("offices").select("*, opd(*)").order("name"),
        supabase.from("opd").select("*").order("name"),
      ]);

      if (officesRes.error) throw officesRes.error;
      if (opdsRes.error) throw opdsRes.error;

      setOffices(officesRes.data || []);
      setOpds(opdsRes.data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.work_locations.fetch");
      const message = appendErrorReference("Gagal memuat data lokasi kerja", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.latitude || !formData.longitude) {
      toast.error("Nama dan koordinat harus diisi");
      return;
    }
    const coordinateValidation = validateOfficeCoordinateInput(formData.latitude, formData.longitude);
    if (!coordinateValidation.ok) {
      toast.error(coordinateValidation.message);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleData?.tenant_id) {
        toast.error("Tenant tidak ditemukan");
        return;
      }

      const payload = {
        name: formData.name,
        opd_id: formData.opd_id || null,
        latitude: coordinateValidation.latitude,
        longitude: coordinateValidation.longitude,
        radius_meters: parseInt(formData.radius_meters) || 100,
        address: formData.address || null,
        tenant_id: roleData.tenant_id,
      };

      if (isEditing) {
        const { error } = await supabase.from("offices").update(payload).eq("id", formData.id);
        if (error) throw error;
        toast.success("Lokasi kerja berhasil diperbarui");
      } else {
        const { error } = await supabase.from("offices").insert(payload);
        if (error) throw error;
        toast.success("Lokasi kerja berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "org.work_locations.save", { location_id: formData.id || undefined });
      toast.error(appendErrorReference("Gagal menyimpan lokasi kerja", errorRef));
    }
  };

  const resetForm = () => {
    setFormData({ id: "", name: "", opd_id: "", latitude: "", longitude: "", radius_meters: "100", address: "" });
    setIsEditing(false);
  };

  const handleEdit = (office: Office) => {
    setFormData({
      id: office.id,
      name: office.name,
      opd_id: office.opd_id || "",
      latitude: office.latitude.toString(),
      longitude: office.longitude.toString(),
      radius_meters: (office.radius_meters || 100).toString(),
      address: office.address || "",
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Lokasi Kerja",
        description: "Yakin ingin menghapus lokasi kerja ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    try {
      const { error } = await supabase.from("offices").delete().eq("id", id);
      if (error) throw error;
      toast.success("Lokasi kerja berhasil dihapus");
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "org.work_locations.delete", { location_id: id });
      toast.error(appendErrorReference("Gagal menghapus lokasi kerja", errorRef));
    }
  };

  // Filter offices based on search and OPD filter
  const filteredOffices = offices.filter(office => {
    const matchesSearch = office.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOPD = filterOpdId === "all" || office.opd_id === filterOpdId;
    return matchesSearch && matchesOPD;
  });

  // Pagination
  const totalPages = Math.ceil(filteredOffices.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedOffices = filteredOffices.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleClearFilters = () => {
    setSearchTerm("");
    setFilterOpdId("all");
    setCurrentPage(1);
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6" />
              Data Lokasi Kerja
            </h1>
            <p className="text-muted-foreground">Kelola lokasi kerja dan koordinat GPS</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Lokasi
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Lokasi Kerja" : "Tambah Lokasi Kerja"}</DialogTitle>
                <DialogDescription>
                  {isEditing ? "Perbarui data lokasi kerja" : "Tambahkan lokasi kerja baru"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Nama Lokasi</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Contoh: Kantor Pusat"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>OPD</Label>
                  <Select value={formData.opd_id} onValueChange={(v) => setFormData({ ...formData, opd_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      {opds.map(opd => (
                        <SelectItem key={opd.id} value={opd.id}>{opd.code} - {opd.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Location Picker */}
                <div className="grid gap-2">
                  <Label>Pilih Lokasi dari Peta</Label>
                  <LocationPicker
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    onLocationChange={(lat, lng) => {
                      setFormData(prev => ({
                        ...prev,
                        latitude: lat,
                        longitude: lng,
                      }));
                    }}
                    address={formData.address}
                    onAddressChange={(addr) => setFormData(prev => ({ ...prev, address: addr }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Radius GPS (meter)</Label>
                  <Input
                    type="number"
                    value={formData.radius_meters}
                    onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })}
                    placeholder="100"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSubmit}>{isEditing ? "Simpan" : "Tambah"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Lokasi Kerja</CardTitle>
            <CardDescription>
              Menampilkan {paginatedOffices.length} dari {filteredOffices.length} lokasi kerja
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filter Section */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari lokasi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterOpdId} onValueChange={setFilterOpdId}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Filter OPD" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua OPD</SelectItem>
                    {opds.map(opd => (
                      <SelectItem key={opd.id} value={opd.id}>{opd.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(searchTerm || filterOpdId !== "all") && (
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  Reset Filter
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Nama Lokasi</TableHead>
                  <TableHead>OPD</TableHead>
                  <TableHead>Koordinat</TableHead>
                  <TableHead>Radius</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedOffices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {filteredOffices.length === 0 && (searchTerm || filterOpdId !== "all") 
                        ? "Tidak ada data yang sesuai filter" 
                        : "Belum ada data lokasi kerja"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOffices.map((office, index) => (
                    <TableRow key={office.id}>
                      <TableCell>{startIndex + index + 1}</TableCell>
                      <TableCell className="font-medium">{office.name}</TableCell>
                      <TableCell>
                        {(office.opd as OPD)?.code ? (
                          <Badge variant="outline">{(office.opd as OPD).code}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {office.latitude}, {office.longitude}
                      </TableCell>
                      <TableCell>{office.radius_meters}m</TableCell>
                      <TableCell>
                        <Badge variant={office.is_active ? "default" : "secondary"}>
                          {office.is_active ? "Aktif" : "Non-Aktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(office)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(office.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Sebelumnya
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Selanjutnya
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_master_data" />
      </div>
    </OrganizationLayout>
  );
}
