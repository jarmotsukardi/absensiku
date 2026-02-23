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
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

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
const ORG_OFFICES_READ_TIMEOUT_MS = 12000;
const ORG_OFFICES_MAX_RETRIES = 2;

export function OrganizationOffices({ tenantId }: OrganizationOfficesProps) {
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchOffices = useCallback(async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("offices")
              .select("*")
              .eq("tenant_id", tenantId)
              .order("name"),
            ORG_OFFICES_READ_TIMEOUT_MS,
            "Permintaan data kantor organisasi timeout."
          ),
        {
          maxRetries: ORG_OFFICES_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setOffices(data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.components.organization_offices.fetch", {
        tenant_id: tenantId,
      });
      const message = appendErrorReference("Gagal memuat data kantor", errorRef);
      toast.error(message);
      setLoadError(message);
      setOffices([]);
    } finally {
      setIsRetrying(false);
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
        {isRetrying && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat data kantor...
          </div>
        )}
        {loadError && (
          <div className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchOffices()}>
              Coba Lagi
            </Button>
          </div>
        )}
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
