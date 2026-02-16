import { useState, useEffect } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";

type Office = Tables<"offices">;
type OPD = Tables<"opd">;

export default function WorkLocationsManagement() {
  const ITEMS_PER_PAGE = 15;
  const [locations, setLocations] = useState<(Office & { opd?: OPD })[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Office | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    opd_id: "",
    latitude: "",
    longitude: "",
    radius_meters: "100",
    address: "",
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const { data: opdData, error: opdError } = await supabase
        .from("opd")
        .select("*")
        .order("name");

      if (opdError) throw opdError;
      setOpdList(opdData || []);

      const { data: officesData, error: officesError } = await supabase
        .from("offices")
        .select("*, opd:opd_id(*)")
        .order("name");

      if (officesError) throw officesError;
      setLocations(officesData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const locationData = {
        name: formData.name,
        opd_id: formData.opd_id || null,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        radius_meters: parseInt(formData.radius_meters),
        address: formData.address,
      };

      if (editingLocation) {
        const { error } = await supabase
          .from("offices")
          .update(locationData)
          .eq("id", editingLocation.id);

        if (error) throw error;
        toast.success("Lokasi kerja berhasil diperbarui");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: employee } = await supabase
          .from("employees")
          .select("tenant_id")
          .eq("user_id", user.id)
          .single();

        if (!employee?.tenant_id) throw new Error("Tenant not found");

        const { error } = await supabase
          .from("offices")
          .insert({ ...locationData, tenant_id: employee.tenant_id });

        if (error) throw error;
        toast.success("Lokasi kerja berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      setEditingLocation(null);
      setFormData({ name: "", opd_id: "", latitude: "", longitude: "", radius_meters: "100", address: "" });
      fetchData();
    } catch (error) {
      console.error("Error saving location:", error);
      toast.error("Gagal menyimpan lokasi kerja");
    }
  };

  const handleEdit = (location: Office) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      opd_id: location.opd_id || "",
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
      radius_meters: (location.radius_meters || 100).toString(),
      address: location.address || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus lokasi kerja ini?")) return;

    try {
      const { error } = await supabase.from("offices").delete().eq("id", id);
      if (error) throw error;
      toast.success("Lokasi kerja berhasil dihapus");
      fetchData();
    } catch (error) {
      console.error("Error deleting location:", error);
      toast.error("Gagal menghapus lokasi kerja");
    }
  };

  const filteredLocations = locations.filter(
    (loc) =>
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loc.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredLocations.length / ITEMS_PER_PAGE));
  const paginatedLocations = filteredLocations.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Lokasi Kerja</h1>
            <p className="text-muted-foreground">
              Kelola lokasi kerja dengan koordinat GPS
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { 
                setEditingLocation(null); 
                setFormData({ name: "", opd_id: "", latitude: "", longitude: "", radius_meters: "100", address: "" }); 
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Lokasi
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingLocation ? "Edit Lokasi Kerja" : "Tambah Lokasi Kerja"}</DialogTitle>
                <DialogDescription>
                  {editingLocation ? "Perbarui data lokasi kerja" : "Masukkan data lokasi kerja baru"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Lokasi</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Contoh: Kantor Pusat"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="opd">OPD</Label>
                    <Select
                      value={formData.opd_id}
                      onValueChange={(value) => setFormData({ ...formData, opd_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih OPD" />
                      </SelectTrigger>
                      <SelectContent>
                        {opdList.map((opd) => (
                          <SelectItem key={opd.id} value={opd.id}>
                            {opd.code} - {opd.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="latitude">Latitude</Label>
                      <Input
                        id="latitude"
                        type="number"
                        step="any"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        placeholder="-6.123456"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="longitude">Longitude</Label>
                      <Input
                        id="longitude"
                        type="number"
                        step="any"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        placeholder="106.123456"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="radius">Radius GPS (meter)</Label>
                    <Input
                      id="radius"
                      type="number"
                      value={formData.radius_meters}
                      onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })}
                      placeholder="100"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Alamat</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Alamat lengkap"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit">Simpan</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Daftar Lokasi Kerja
            </CardTitle>
            <CardDescription>
              Total {filteredLocations.length} lokasi terdaftar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari lokasi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Nama Lokasi</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Koordinat</TableHead>
                    <TableHead>Radius</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-32 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : paginatedLocations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Tidak ada data lokasi kerja
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLocations.map((loc, index) => (
                      <TableRow key={loc.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">{loc.name}</TableCell>
                        <TableCell>{loc.opd?.code || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {loc.latitude}, {loc.longitude}
                        </TableCell>
                        <TableCell>{loc.radius_meters}m</TableCell>
                        <TableCell>
                          <Badge variant={loc.is_active ? "default" : "secondary"}>
                            {loc.is_active ? "Aktif" : "Non-Aktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(loc)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(loc.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Berikutnya
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
