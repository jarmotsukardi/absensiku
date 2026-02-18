import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Building, Hospital, GraduationCap, Landmark, Factory, Store, Hotel, HardHat, Truck, Briefcase, Palette, Info } from "lucide-react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";

interface InstitutionType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  icon: string;
  is_active: boolean;
}

const getIcon = (iconType: string) => {
  switch (iconType) {
    case "landmark": return Landmark;
    case "hospital": return Hospital;
    case "graduation": return GraduationCap;
    case "factory": return Factory;
    case "store": return Store;
    case "hotel": return Hotel;
    case "hard-hat": return HardHat;
    case "truck": return Truck;
    case "briefcase": return Briefcase;
    case "palette": return Palette;
    default: return Building;
  }
};

export default function OrgInstitutionTypesManagement() {
  const [institutionTypes, setInstitutionTypes] = useState<InstitutionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchInstitutionTypes();
  }, []);

  const fetchInstitutionTypes = async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("institution_types")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setInstitutionTypes(data || []);
    } catch (err) {
      const errorRef = reportError(err, "org.institution_types.fetch");
      const message = appendErrorReference("Gagal memuat daftar jenis instansi", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTypes = institutionTypes.filter(type =>
    type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.code.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredTypes.length / ITEMS_PER_PAGE));
  const paginatedTypes = filteredTypes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, institutionTypes.length]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jenis Instansi</h1>
          <p className="text-muted-foreground">
            Daftar jenis instansi yang tersedia dalam sistem. Pengaturan dan pengelolaan jenis instansi dilakukan oleh Super Admin.
          </p>
        </div>

        {/* Info Banner */}
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm text-blue-700 dark:text-blue-300">Halaman Hanya Baca</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Jenis instansi dikelola secara terpusat oleh Super Admin platform. 
                Hubungi Super Admin jika Anda memerlukan perubahan pada daftar jenis instansi.
              </p>
            </div>
          </div>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Daftar Jenis Instansi</CardTitle>
                <CardDescription>Total {filteredTypes.length} jenis instansi</CardDescription>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari jenis instansi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">No</TableHead>
                        <TableHead>Ikon</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Kode</TableHead>
                        <TableHead className="hidden md:table-cell">Deskripsi</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTypes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            Tidak ada data jenis instansi
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedTypes.map((type, index) => {
                          const IconComponent = getIcon(type.icon);
                          return (
                            <TableRow key={type.id}>
                              <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                              <TableCell>
                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <IconComponent className="h-5 w-5 text-primary" />
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{type.name}</TableCell>
                              <TableCell><Badge variant="outline">{type.code}</Badge></TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground max-w-xs truncate">
                                {type.description || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant={type.is_active ? "default" : "secondary"}>
                                  {type.is_active ? "Aktif" : "Nonaktif"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                    )}
                    </TableBody>
                  </Table>
                </div>
                {filteredTypes.length > 0 && (
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
              </>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_master_data" />
      </div>
    </OrganizationLayout>
  );
}
