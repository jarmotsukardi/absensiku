import { useState, useEffect } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, FileWarning, Download, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

type AttendanceRecord = Tables<"attendance_records">;
type Employee = Tables<"employees">;
type OPD = Tables<"opd">;

export default function AbsentWithoutNotice() {
  const [records, setRecords] = useState<(AttendanceRecord & { employee?: Employee & { opd?: OPD } })[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOpd, setFilterOpd] = useState<string>("all");

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const [opdResult, recordResult] = await Promise.all([
        supabase.from("opd").select("*").order("name"),
        supabase
          .from("attendance_records_partitioned")
          .select("*")
          .eq("status", "tidak_hadir")
          .order("date", { ascending: false })
          .limit(100),
      ]);

      if (opdResult.error) throw opdResult.error;
      if (recordResult.error) throw recordResult.error;

      setOpdList(opdResult.data || []);
      setRecords(recordResult.data || []);
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

  const filteredRecords = records.filter((rec) => {
    const matchesSearch = rec.employee?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOpd = filterOpd === "all" || rec.employee?.opd_id === filterOpd;
    return matchesSearch && matchesOpd;
  });

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tanpa Keterangan</h1>
            <p className="text-muted-foreground">
              Daftar ketidakhadiran tanpa keterangan
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
              <FileWarning className="h-5 w-5" />
              Daftar Tidak Hadir Tanpa Keterangan
            </CardTitle>
            <CardDescription>
              Total {filteredRecords.length} data ketidakhadiran
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama pegawai..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterOpd} onValueChange={setFilterOpd}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter OPD" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua OPD</SelectItem>
                  {opdList.map((opd) => (
                    <SelectItem key={opd.id} value={opd.id}>
                      {opd.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Tidak ada data ketidakhadiran tanpa keterangan
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((rec, index) => (
                      <TableRow key={rec.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          {format(new Date(rec.date), "dd MMM yyyy", { locale: localeId })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {rec.employee?.name || "-"}
                        </TableCell>
                        <TableCell>
                          {rec.employee?.opd?.code || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">Tanpa Keterangan</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rec.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))
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
