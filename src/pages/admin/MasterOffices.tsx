import { useState, useEffect, useCallback } from "react";
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
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
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
  const ADMIN_MASTER_OFFICES_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_MASTER_OFFICES_QUERY_RETRY_MAX = 1;
  const { toast } = useToast();
  const [offices, setOffices] = useState<Office[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    radius_meters: "100",
  });

  const fetchOffices = useCallback(async () => {
    setIsLoading(true);
    setIsRetrying(false);
    setLoadError(null);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("offices")
              .select("*")
              .order("name"),
            ADMIN_MASTER_OFFICES_QUERY_TIMEOUT_MS,
            "admin.master_offices.fetch timeout",
          ),
        {
          maxRetries: ADMIN_MASTER_OFFICES_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;
      setOffices(data || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.master_offices.fetch");
      const message = appendErrorReference("Gagal memuat data kantor", errorRef);
      setLoadError(message);
      setOffices([]);
      toast({
        variant: "destructive",
        title: "Gagal",
        description: message,
      });
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchOffices();
  }, [fetchOffices]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      setIsRetrying(false);
      setLoadError(null);
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
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("offices")
                .update(officeData)
                .eq("id", editingOffice.id),
              ADMIN_MASTER_OFFICES_QUERY_TIMEOUT_MS,
              "admin.master_offices.save.update timeout",
            ),
          {
            maxRetries: ADMIN_MASTER_OFFICES_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (error) throw error;
        toast({ title: "Berhasil", description: "Kantor berhasil diperbarui" });
      } else {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("offices").insert(officeData),
              ADMIN_MASTER_OFFICES_QUERY_TIMEOUT_MS,
              "admin.master_offices.save.insert timeout",
            ),
          {
            maxRetries: ADMIN_MASTER_OFFICES_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
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
      setIsRetrying(false);
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
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data kantor...</p>
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchOffices()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Header Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm sm:flex-1">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari kantor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
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
