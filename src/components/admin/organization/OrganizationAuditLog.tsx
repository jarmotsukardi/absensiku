import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileText, Search, User, Calendar, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { Button } from "@/components/ui/button";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

type AuditLog = Omit<Tables<"audit_logs">, "old_values" | "new_values"> & {
  old_values: Json | null;
  new_values: Json | null;
  employee?: {
    name: string;
  } | null;
};

interface OrganizationAuditLogProps {
  tenantId: string;
}

const actionLabels: Record<string, { label: string; color: string }> = {
  INSERT: { label: "Tambah", color: "bg-green-500" },
  UPDATE: { label: "Ubah", color: "bg-blue-500" },
  DELETE: { label: "Hapus", color: "bg-red-500" },
};

const tableLabels: Record<string, string> = {
  employees: "Pegawai",
  offices: "Kantor",
  opd: "OPD",
  attendance_records: "Absensi",
  leave_requests: "Pengajuan",
  attendance_corrections: "Koreksi",
  holidays: "Hari Libur",
};
const ORG_AUDIT_LOG_READ_TIMEOUT_MS = 12000;
const ORG_AUDIT_LOG_MAX_RETRIES = 2;

export function OrganizationAuditLog({ tenantId }: OrganizationAuditLogProps) {
  const ITEMS_PER_PAGE = 10;
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("audit_logs")
              .select(`
                *,
                employee:employees(name)
              `)
              .eq("tenant_id", tenantId)
              .order("created_at", { ascending: false })
              .limit(100),
            ORG_AUDIT_LOG_READ_TIMEOUT_MS,
            "Permintaan audit log organisasi timeout."
          ),
        {
          maxRetries: ORG_AUDIT_LOG_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setLogs((data as AuditLog[]) || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.components.organization_audit_log.fetch", {
        tenant_id: tenantId,
      });
      const message = appendErrorReference("Gagal memuat audit log organisasi", errorRef);
      setLoadError(message);
      setLogs([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const query = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(query) ||
      log.table_name.toLowerCase().includes(query) ||
      log.employee?.name?.toLowerCase().includes(query)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, logs.length]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Audit Log
            </CardTitle>
            <CardDescription>
              Riwayat perubahan data di organisasi ini
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari log..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {isRetrying && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat audit log...
          </div>
        )}
        {loadError && (
          <div className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchLogs()}>
              Coba Lagi
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Belum ada log aktivitas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div
                  className={`h-2 w-2 rounded-full mt-2 ${
                    actionLabels[log.action]?.color || "bg-gray-500"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {actionLabels[log.action]?.label || log.action}
                    </Badge>
                    <span className="text-sm font-medium">
                      {tableLabels[log.table_name] || log.table_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    {log.employee?.name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {log.employee.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {log.created_at
                        ? format(new Date(log.created_at), "d MMM yyyy, HH:mm", { locale: id })
                        : "-"}
                    </span>
                  </div>
                  {log.action === "UPDATE" && log.old_values && log.new_values && (
                    <div className="mt-2 text-xs bg-muted p-2 rounded font-mono">
                      <span className="text-muted-foreground line-through">
                        {JSON.stringify(log.old_values).slice(0, 50)}...
                      </span>
                      <ArrowRight className="inline h-3 w-3 mx-2" />
                      <span>{JSON.stringify(log.new_values).slice(0, 50)}...</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {filteredLogs.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Sebelumnya
            </button>
            <span className="text-sm text-muted-foreground">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Berikutnya
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
