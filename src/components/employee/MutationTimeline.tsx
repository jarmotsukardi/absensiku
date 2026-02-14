import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Clock,
  CheckCircle2,
  XCircle,
  User,
  Building2,
  ArrowRight,
  History,
} from "lucide-react";

interface MutationRecord {
  id: string;
  mutation_type: string;
  status: string;
  reason: string;
  rejection_reason?: string;
  requested_changes: Record<string, any>;
  original_data: Record<string, any>;
  created_at: string;
  approved_at?: string;
}

interface MutationTimelineProps {
  employeeId: string;
}

export function MutationTimeline({ employeeId }: MutationTimelineProps) {
  const [mutations, setMutations] = useState<MutationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (employeeId) {
      fetchMutations();
    }
  }, [employeeId]);

  const fetchMutations = async () => {
    try {
      const { data, error } = await supabase
        .from("mutation_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMutations((data || []).map((d: any) => ({
        ...d,
        requested_changes: typeof d.requested_changes === 'object' ? d.requested_changes : {},
        original_data: typeof d.original_data === 'object' ? d.original_data : {},
      })));
    } catch (error) {
      console.error("Error fetching mutations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "menunggu":
        return <Clock className="w-4 h-4 text-amber-500" />;
      case "disetujui":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "ditolak":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Menunggu</Badge>;
      case "disetujui":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Disetujui</Badge>;
      case "ditolak":
        return <Badge variant="destructive">Ditolak</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "profile_change":
        return "Perubahan Profil";
      case "transfer":
        return "Mutasi/Pindah";
      default:
        return type;
    }
  };

  const formatChange = (key: string, oldVal: any, newVal: any) => {
    const label = key
      .replace(/_id$/g, "")
      .replace(/_name$/g, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    if (key.endsWith("_id")) return null;

    return (
      <div key={key} className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-muted-foreground">{label}:</span>
        {oldVal && (
          <>
            <span className="text-muted-foreground line-through text-xs">{String(oldVal)}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
          </>
        )}
        <span className="font-medium">{String(newVal)}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (mutations.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-8 text-center">
          <History className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Belum ada riwayat mutasi</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4" />
          Riwayat Mutasi
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-0">
            {mutations.map((mutation, index) => (
              <div key={mutation.id} className="relative pl-14 pr-4 py-4 hover:bg-muted/30 transition-colors">
                {/* Timeline dot */}
                <div className="absolute left-4 w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
                  {getStatusIcon(mutation.status)}
                </div>

                <div className="space-y-2">
                  {/* Header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {mutation.mutation_type === "transfer" ? (
                        <Building2 className="w-3.5 h-3.5" />
                      ) : (
                        <User className="w-3.5 h-3.5" />
                      )}
                      {getTypeLabel(mutation.mutation_type)}
                    </div>
                    {getStatusBadge(mutation.status)}
                  </div>

                  {/* Changes */}
                  <div className="space-y-1">
                    {Object.entries(mutation.requested_changes).map(([key, newVal]) =>
                      formatChange(key, mutation.original_data[key], newVal)
                    )}
                  </div>

                  {/* Reason */}
                  <p className="text-sm text-muted-foreground">
                    Alasan: {mutation.reason}
                  </p>

                  {/* Rejection reason */}
                  {mutation.status === "ditolak" && mutation.rejection_reason && (
                    <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      Ditolak: {mutation.rejection_reason}
                    </p>
                  )}

                  {/* Date */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Diajukan: {format(new Date(mutation.created_at), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                    </span>
                    {mutation.approved_at && (
                      <span>
                        Diproses: {format(new Date(mutation.approved_at), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Border bottom (except last) */}
                {index < mutations.length - 1 && (
                  <div className="absolute left-14 right-4 bottom-0 border-b border-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
