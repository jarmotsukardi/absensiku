import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  ArrowRight,
  Trash2,
  User,
  Building2,
} from "lucide-react";
import { MutationRequest, useMutationRequests } from "@/hooks/useMutationRequests";

interface MutationRequestListProps {
  employeeId: string;
}

export function MutationRequestList({ employeeId }: MutationRequestListProps) {
  const { requests, isLoading, cancelRequest } = useMutationRequests({ employeeId });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <Clock className="w-3 h-3 mr-1" />
            Menunggu
          </Badge>
        );
      case "disetujui":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Disetujui
          </Badge>
        );
      case "ditolak":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Ditolak
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMutationTypeLabel = (type: string) => {
    switch (type) {
      case "profile_change":
        return (
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <User className="w-4 h-4" />
            <span>Perubahan Profil</span>
          </div>
        );
      case "transfer":
        return (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <Building2 className="w-4 h-4" />
            <span>Mutasi/Pindah</span>
          </div>
        );
      default:
        return type;
    }
  };

  const formatChanges = (changes: Record<string, any>, original: Record<string, any>) => {
    return Object.entries(changes).map(([key, newValue]) => {
      const oldValue = original[key];
      const label = key
        .replace(/_id/g, "")
        .replace(/_name/g, "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Skip ID fields, show name fields
      if (key.endsWith("_id")) return null;

      return (
        <div key={key} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground min-w-[80px]">{label}:</span>
          {oldValue && (
            <>
              <span className="text-muted-foreground line-through">{oldValue}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
            </>
          )}
          <span className="font-medium">{String(newValue)}</span>
        </div>
      );
    }).filter(Boolean);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-8 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Belum ada pengajuan mutasi</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <Card key={request.id} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getMutationTypeLabel(request.mutation_type)}
                  {getStatusBadge(request.status)}
                </div>

                <div className="space-y-1">
                  {formatChanges(request.requested_changes, request.original_data)}
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Alasan: </span>
                    {request.reason}
                  </p>
                </div>

                {request.status === "ditolak" && request.rejection_reason && (
                  <div className="p-2 bg-destructive/10 rounded-md">
                    <p className="text-sm text-destructive">
                      <span className="font-medium">Alasan ditolak: </span>
                      {request.rejection_reason}
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Diajukan: {format(new Date(request.created_at), "dd MMMM yyyy, HH:mm", { locale: idLocale })}
                </p>
              </div>

              {request.status === "menunggu" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Batalkan Pengajuan?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Pengajuan mutasi ini akan dibatalkan dan tidak dapat dikembalikan.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Tidak</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => cancelRequest(request.id)}
                      >
                        Ya, Batalkan
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
