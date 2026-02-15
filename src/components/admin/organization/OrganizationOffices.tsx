import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, Plus, Clock, MapPinned } from "lucide-react";
import { toast } from "sonner";

interface Office {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number | null;
  work_start_time: string | null;
  work_end_time: string | null;
  is_active: boolean | null;
}

interface OrganizationOfficesProps {
  tenantId: string;
}

export function OrganizationOffices({ tenantId }: OrganizationOfficesProps) {
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOffices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("offices")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");

      if (error) throw error;
      setOffices(data || []);
    } catch (error) {
      console.error("Error fetching offices:", error);
      toast.error("Gagal memuat data kantor");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchOffices();
  }, [fetchOffices]);

  const formatTime = (time: string | null) => {
    if (!time) return "-";
    return time.slice(0, 5);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Lokasi Kantor
            </CardTitle>
            <CardDescription>
              {offices.length} lokasi kantor terdaftar
            </CardDescription>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Kantor
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : offices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Belum ada lokasi kantor terdaftar
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {offices.map((office) => (
              <Card key={office.id} className="relative">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <MapPinned className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-semibold">{office.name}</h4>
                        <p className="text-sm text-muted-foreground">{office.address || "-"}</p>
                      </div>
                    </div>
                    <Badge variant={office.is_active ? "default" : "secondary"}>
                      {office.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>

                  <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Jam Kerja</p>
                      <p className="font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(office.work_start_time)} - {formatTime(office.work_end_time)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Radius GPS</p>
                      <p className="font-medium">{office.radius_meters || 100} meter</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Koordinat</p>
                      <p className="font-mono text-xs">
                        {office.latitude.toFixed(6)}, {office.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
