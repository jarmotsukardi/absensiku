import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  Edit,
  Loader2,
  Trash2,
  Globe,
} from "lucide-react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";

type Holiday = Tables<"holidays">;

export default function MasterHolidays() {
  const { toast } = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    date: undefined as Date | undefined,
    is_national: true,
  });

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .order("date", { ascending: false });

    if (!error && data) {
      setHolidays(data);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date) return;

    setIsSubmitting(true);

    try {
      const holidayData = {
        name: formData.name,
        date: format(formData.date, "yyyy-MM-dd"),
        is_national: formData.is_national,
        tenant_id: editingHoliday?.tenant_id || null,
      };

      if (editingHoliday) {
        const { error } = await supabase
          .from("holidays")
          .update(holidayData)
          .eq("id", editingHoliday.id);
        if (error) throw error;
        toast({ title: "Berhasil", description: "Hari libur berhasil diperbarui" });
      } else {
        const { error } = await supabase.from("holidays").insert(holidayData);
        if (error) throw error;
        toast({ title: "Berhasil", description: "Hari libur berhasil ditambahkan" });
      }

      setDialogOpen(false);
      resetForm();
      fetchHolidays();
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal", description: "Terjadi kesalahan" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      date: undefined,
      is_national: true,
    });
    setEditingHoliday(null);
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: parseISO(holiday.date),
      is_national: holiday.is_national ?? true,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (!error) {
      toast({ title: "Berhasil", description: "Hari libur berhasil dihapus" });
      fetchHolidays();
    }
  };

  const filteredHolidays = holidays.filter((holiday) =>
    holiday.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SuperAdminLayout
      title="Master Hari Libur"
      subtitle="Kelola kalender hari libur nasional dan instansi"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari hari libur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Libur
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingHoliday ? "Edit Hari Libur" : "Tambah Hari Libur"}</DialogTitle>
                <DialogDescription>Atur hari libur nasional atau instansi</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nama Hari Libur *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Hari Kemerdekaan"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tanggal *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.date ? format(formData.date, "dd MMMM yyyy", { locale: idLocale }) : "Pilih tanggal"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.date}
                        onSelect={(date) => setFormData({ ...formData, date })}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    <Label>Hari Libur Nasional</Label>
                  </div>
                  <Switch
                    checked={formData.is_national}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_national: checked })}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !formData.date} className="flex-1">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Holiday List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredHolidays.map((holiday) => (
              <Card key={holiday.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[50px]">
                        <p className="text-2xl font-bold text-primary">
                          {format(parseISO(holiday.date), "dd")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(holiday.date), "MMM", { locale: idLocale })}
                        </p>
                      </div>
                      <div className="border-l border-border pl-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{holiday.name}</h3>
                          {holiday.is_national ? (
                            <Badge variant="secondary" className="text-xs">
                              <Globe className="w-3 h-3 mr-1" />
                              Nasional
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Instansi</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(holiday.date), "EEEE, dd MMMM yyyy", { locale: idLocale })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(holiday)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(holiday.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredHolidays.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada data hari libur</p>
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
