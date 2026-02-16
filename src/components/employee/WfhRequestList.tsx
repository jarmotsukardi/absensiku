import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Home, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

interface WfhRequest {
  id: string;
  request_date: string;
  reason: string;
  status: "menunggu" | "disetujui" | "ditolak";
  rejection_reason: string | null;
  created_at: string;
}

interface WfhRequestListProps {
  requests: WfhRequest[];
  isLoading: boolean;
}

export function WfhRequestList({ requests, isLoading }: WfhRequestListProps) {
  const ITEMS_PER_PAGE = 5;
  const [currentPage, setCurrentPage] = useState(1);
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "disetujui":
        return (
          <Badge className="bg-green-500/10 text-green-700 border-green-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Disetujui
          </Badge>
        );
      case "ditolak":
        return (
          <Badge className="bg-red-500/10 text-red-700 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" />
            Ditolak
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Menunggu
          </Badge>
        );
    }
  };
  const totalPages = Math.max(1, Math.ceil(requests.length / ITEMS_PER_PAGE));
  const paginatedRequests = requests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [requests.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="w-5 h-5" />
          Riwayat Pengajuan WFH
        </CardTitle>
        <CardDescription>Daftar pengajuan work from home Anda</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal WFH</TableHead>
                <TableHead>Alasan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Diajukan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  </TableCell>
                </TableRow>
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Belum ada pengajuan WFH
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {format(new Date(req.request_date), "EEEE, d MMMM yyyy", { locale: id })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {getStatusBadge(req.status)}
                        {req.rejection_reason && (
                          <p className="text-xs text-muted-foreground">{req.rejection_reason}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(req.created_at), "d MMM yyyy", { locale: id })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!isLoading && requests.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
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
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Berikutnya
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
