import { useState, useEffect } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plane, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

type LeaveRequest = Tables<"leave_requests">;
type Employee = Tables<"employees">;
type LeaveRequestWithEmployee = LeaveRequest & { employee?: Employee | null };

export default function OfficialTravelList() {
  const [requests, setRequests] = useState<LeaveRequestWithEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, employee:employees!leave_requests_employee_id_fkey(*)")
        .eq("leave_type", "tugas_luar")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests((data as LeaveRequestWithEmployee[]) || []);
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

  const handleExport = () => {
    toast.info("Fitur export ke Excel akan segera tersedia");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "menunggu":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">Menunggu</Badge>;
      case "disetujui":
        return <Badge variant="outline" className="bg-green-500/10 text-green-500">Disetujui</Badge>;
      case "ditolak":
        return <Badge variant="outline" className="bg-red-500/10 text-red-500">Ditolak</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredRequests = requests.filter((req) =>
    req.employee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dinas/Lainnya</h1>
            <p className="text-muted-foreground">
              Daftar tugas dinas luar dan kegiatan lainnya
            </p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane className="h-5 w-5" />
              Daftar Tugas Dinas
            </CardTitle>
            <CardDescription>
              Total {filteredRequests.length} data tugas dinas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau keterangan..."
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
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Tanggal Mulai</TableHead>
                    <TableHead>Tanggal Selesai</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Tidak ada data tugas dinas
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((req, index) => {
                      const startDate = new Date(req.start_date);
                      const endDate = new Date(req.end_date);
                      const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                      
                      return (
                        <TableRow key={req.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {req.employee?.name || "-"}
                        </TableCell>
                          <TableCell>
                            {format(startDate, "dd MMM yyyy", { locale: localeId })}
                          </TableCell>
                          <TableCell>
                            {format(endDate, "dd MMM yyyy", { locale: localeId })}
                          </TableCell>
                          <TableCell>{duration} hari</TableCell>
                          <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                          <TableCell>{getStatusBadge(req.status || "menunggu")}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
