import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { validateOfficeCoordinateInput } from "@/lib/officeCoordinates";
import { LocationPicker } from "@/components/maps/LocationPicker";
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Edit,
  Loader2,
} from "lucide-react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";

type Office = Tables<"offices">;

export default function MasterOffices() {
  const { toast } = useToast();
  const [offices, setOffices] = useState<Office[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    radius_meters: "100",
  });

  useEffect(() => {
    fetchOffices();
  }, []);

  const fetchOffices = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("offices")
      .select("*")
      .order("name");

    if (!error && data) {
      setOffices(data);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const coordinateValidation = validateOfficeCoordinateInput(formData.latitude, formData.longitude);
      if (!coordinateValidation.ok) {
        toast({ variant: "destructive", title: "Validasi lokasi gagal", description: coordinateValidation.message });
        return;
      }

      const officeData = {
        name: formData.name,
        address: formData.address,
        latitude: coordinateValidation.latitude,
        longitude: coordinateValidation.longitude,
        radius_meters: parseInt(formData.radius_meters),
        tenant_id: editingOffice?.tenant_id || crypto.randomUUID(),
      };

      if (editingOffice) {
        const { error } = await supabase
          .from("offices")
          .update(officeData)
          .eq("id", editingOffice.id);

        if (error) throw error;
        toast({ title: "Berhasil", description: "Kantor berhasil diperbarui" });
      } else {
        const { error } = await supabase.from("offices").insert(officeData);
        if (error) throw error;
        toast({ title: "Berhasil", description: "Kantor berhasil ditambahkan" });
      }

      setDialogOpen(false);
      resetForm();
      fetchOffices();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.master_offices.save", {
        is_edit: Boolean(editingOffice),
      });
      toast({
        variant: "destructive",
        title: "Gagal",
        description: appendErrorReference("Terjadi kesalahan saat menyimpan data kantor", errorRef),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      latitude: "",
      longitude: "",
      radius_meters: "100",
    });
    setEditingOffice(null);
  };

  const handleEdit = (office: Office) => {
    setEditingOffice(office);
    setFormData({
      name: office.name,
      address: office.address || "",
      latitude: String(office.latitude),
      longitude: String(office.longitude),
      radius_meters: String(office.radius_meters || 100),
    });
    setDialogOpen(true);
  };

  const filteredOffices = offices.filter((office) =>
    office.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    office.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SuperAdminLayout
      title="Master Kantor"
      subtitle="Kelola data lokasi kantor untuk absensi GPS"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari kantor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Kantor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingOffice ? "Edit Kantor" : "Tambah Kantor Baru"}</DialogTitle>
                <DialogDescription>Isi data lokasi kantor untuk absensi GPS</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nama Kantor</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Kantor Pusat"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Pilih Lokasi dari Google Maps</Label>
                  <LocationPicker
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    onLocationChange={(lat, lng) => {
                      setFormData((prev) => ({
                        ...prev,
                        latitude: lat,
                        longitude: lng,
                      }));
                    }}
                    address={formData.address}
                    onAddressChange={(addr) => {
                      setFormData((prev) => ({
                        ...prev,
                        address: addr,
                      }));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Radius GPS (meter)</Label>
                  <Input
                    type="number"
                    value={formData.radius_meters}
                    onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })}
                    placeholder="100"
                  />
                </div>
                <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  Jam kerja dan toleransi keterlambatan kini dikelola terpusat di menu{" "}
                  <span className="font-semibold">/org/schedule/work-hours</span>.
                </p>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="flex-1">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Office Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredOffices.map((office) => (
              <Card key={office.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{office.name}</h3>
                        {office.address && (
                          <p className="text-sm text-muted-foreground">{office.address}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            <MapPin className="w-3 h-3 mr-1" />
                            {office.radius_meters}m
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(office)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredOffices.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada data kantor</p>
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
