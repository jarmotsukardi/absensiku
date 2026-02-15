import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FileText, Search, User, Calendar, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

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

export function OrganizationAuditLog({ tenantId }: OrganizationAuditLogProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          *,
          employee:employees(name)
        `)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data as AuditLog[]) || []);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    const query = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(query) ||
      log.table_name.toLowerCase().includes(query) ||
      log.employee?.name?.toLowerCase().includes(query)
    );
  });

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
            {filteredLogs.map((log) => (
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
      </CardContent>
    </Card>
  );
}
