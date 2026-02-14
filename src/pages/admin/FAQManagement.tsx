import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Edit, HelpCircle, Save, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
}

const ITEMS_PER_PAGE = 10;

export default function FAQManagement() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [filteredFaqs, setFilteredFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FAQ | null>(null);
  const [formData, setFormData] = useState({ question: "", answer: "", category: "Umum", sort_order: 1 });
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchFAQs();
  }, []);

  useEffect(() => {
    // Filter FAQs based on search query
    const filtered = faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredFaqs(filtered);
    setCurrentPage(1);
  }, [searchQuery, faqs]);

  const fetchFAQs = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "faq_settings")
        .maybeSingle();
      
      if (data?.value && Array.isArray(data.value)) {
        const sortedFaqs = (data.value as unknown as FAQ[]).sort((a, b) => a.sort_order - b.sort_order);
        setFaqs(sortedFaqs);
        setFilteredFaqs(sortedFaqs);
      }
    } catch (error) {
      console.error("Error fetching FAQs:", error);
      toast.error("Gagal memuat data FAQ");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "faq_settings")
        .maybeSingle();

      const jsonValue = JSON.parse(JSON.stringify(faqs));
      
      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: jsonValue, updated_at: new Date().toISOString() })
          .eq("key", "faq_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({ key: "faq_settings", value: jsonValue });
      }
      
      toast.success("FAQ berhasil disimpan");
    } catch (error) {
      console.error("Error saving FAQs:", error);
      toast.error("Gagal menyimpan FAQ");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ question: "", answer: "", category: "Umum", sort_order: faqs.length + 1 });
    setIsDialogOpen(true);
  };

  const handleEdit = (faq: FAQ) => {
    setEditingItem(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sort_order: faq.sort_order,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setFaqs(faqs.filter((f) => f.id !== id));
    toast.success("FAQ dihapus. Klik 'Simpan Semua' untuk menyimpan perubahan.");
  };

  const handleSubmit = () => {
    if (!formData.question || !formData.answer) {
      toast.error("Pertanyaan dan jawaban wajib diisi");
      return;
    }

    if (editingItem) {
      setFaqs(faqs.map((f) => (f.id === editingItem.id ? { ...f, ...formData } : f)));
      toast.success("FAQ diperbarui. Klik 'Simpan Semua' untuk menyimpan perubahan.");
    } else {
      setFaqs([...faqs, { id: Date.now().toString(), ...formData }]);
      toast.success("FAQ ditambahkan. Klik 'Simpan Semua' untuk menyimpan perubahan.");
    }
    setIsDialogOpen(false);
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredFaqs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedFaqs = filteredFaqs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Get unique categories
  const categories = [...new Set(faqs.map((f) => f.category))];

  return (
    <SuperAdminLayout title="Manajemen FAQ" subtitle="Kelola pertanyaan yang sering diajukan">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari FAQ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Tambah FAQ
            </Button>
            <Button onClick={handleSaveAll} disabled={isSaving} variant="default">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Simpan Semua
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total FAQ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{faqs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Kategori</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categories.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Hasil Pencarian</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredFaqs.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Daftar FAQ
            </CardTitle>
            <CardDescription>Kelola pertanyaan dan jawaban untuk halaman depan</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">No</TableHead>
                      <TableHead>Pertanyaan</TableHead>
                      <TableHead className="hidden md:table-cell">Jawaban</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="w-[100px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFaqs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          {searchQuery ? "Tidak ada FAQ yang cocok" : "Belum ada FAQ"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedFaqs.map((faq, index) => (
                        <TableRow key={faq.id}>
                          <TableCell className="font-medium">{startIndex + index + 1}</TableCell>
                          <TableCell>
                            <div className="max-w-[300px]">
                              <p className="font-medium truncate">{faq.question}</p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-muted-foreground truncate max-w-[300px]">{faq.answer}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{faq.category}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(faq)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(faq.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Menampilkan {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredFaqs.length)} dari {filteredFaqs.length} FAQ
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const page = i + 1;
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit FAQ" : "Tambah FAQ Baru"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Pertanyaan *</Label>
                <Input
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  placeholder="Masukkan pertanyaan..."
                />
              </div>
              <div className="space-y-2">
                <Label>Jawaban *</Label>
                <Textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  placeholder="Masukkan jawaban..."
                  rows={4}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Input
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Umum, Fitur, Harga, dll"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Urutan</Label>
                  <Input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSubmit}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminLayout>
  );
}
