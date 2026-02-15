import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Users, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface MarketingStaff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  incentive_percentage: number;
  is_active: boolean;
  total_sales_count: number;
  total_sales_amount: number;
  total_incentive_earned: number;
  notes: string | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const emptyStaff: Partial<MarketingStaff> = {
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  incentive_percentage: 5,
  is_active: true,
  notes: "",
};

export function MarketingStaffManager() {
  const [staff, setStaff] = useState<MarketingStaff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Partial<MarketingStaff> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Unknown error";

  const fetchStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("marketing_staff")
        .select("*")
        .order("name");

      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleCreate = () => {
    setEditingStaff({ ...emptyStaff });
    setShowDialog(true);
  };

  const handleEdit = (s: MarketingStaff) => {
    setEditingStaff({ ...s });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!editingStaff?.name) return;

    setIsSaving(true);
    try {
      if (editingStaff.id) {
        const { error } = await supabase
          .from("marketing_staff")
          .update({
            name: editingStaff.name,
            email: editingStaff.email,
            phone: editingStaff.phone,
            whatsapp: editingStaff.whatsapp,
            incentive_percentage: editingStaff.incentive_percentage,
            is_active: editingStaff.is_active,
            notes: editingStaff.notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingStaff.id);
        if (error) throw error;
        toast.success("Data marketing diperbarui");
      } else {
        const { error } = await supabase.from("marketing_staff").insert([
          {
            name: editingStaff.name,
            email: editingStaff.email,
            phone: editingStaff.phone,
            whatsapp: editingStaff.whatsapp,
            incentive_percentage: editingStaff.incentive_percentage,
            is_active: editingStaff.is_active,
            notes: editingStaff.notes,
          },
        ]);
        if (error) throw error;
        toast.success("Marketing berhasil ditambahkan");
      }
      setShowDialog(false);
      setEditingStaff(null);
      fetchStaff();
    } catch (error) {
      toast.error("Gagal menyimpan: " + getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus marketing ini?")) return;
    try {
      const { error } = await supabase.from("marketing_staff").delete().eq("id", id);
      if (error) throw error;
      toast.success("Marketing dihapus");
      fetchStaff();
    } catch (error) {
      toast.error("Gagal menghapus: " + getErrorMessage(error));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Tim Marketing</h3>
          <p className="text-sm text-muted-foreground">
            Kelola staff marketing dan tracking insentif (1 invoice = 1 marketing)
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Tambah Marketing
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{staff.filter(s => s.is_active).length}</p>
              <p className="text-sm text-muted-foreground">Marketing Aktif</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">
                {staff.reduce((acc, s) => acc + s.total_sales_count, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Total Penjualan</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-orange-600" />
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(staff.reduce((acc, s) => acc + s.total_incentive_earned, 0))}
              </p>
              <p className="text-sm text-muted-foreground">Total Insentif</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Insentif</TableHead>
              <TableHead>Penjualan</TableHead>
              <TableHead>Total Insentif</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Belum ada tim marketing
                </TableCell>
              </TableRow>
            ) : (
              staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {s.email && <p>{s.email}</p>}
                      {s.phone && <p className="text-muted-foreground">{s.phone}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.incentive_percentage}%</Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{s.total_sales_count} deal</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(s.total_sales_amount)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-green-600">
                    {formatCurrency(s.total_incentive_earned)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "default" : "secondary"}>
                      {s.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStaff?.id ? "Edit Marketing" : "Tambah Marketing"}
            </DialogTitle>
          </DialogHeader>

          {editingStaff && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Lengkap</Label>
                <Input
                  value={editingStaff.name || ""}
                  onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                  placeholder="Nama marketing"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editingStaff.email || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>No. Telepon</Label>
                  <Input
                    value={editingStaff.phone || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, phone: e.target.value })}
                    placeholder="08xx"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input
                    value={editingStaff.whatsapp || ""}
                    onChange={(e) => setEditingStaff({ ...editingStaff, whatsapp: e.target.value })}
                    placeholder="628xx"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Persentase Insentif (%)</Label>
                  <Input
                    type="number"
                    value={editingStaff.incentive_percentage || 0}
                    onChange={(e) =>
                      setEditingStaff({ ...editingStaff, incentive_percentage: Number(e.target.value) })
                    }
                    min={0}
                    max={50}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Aktif</Label>
                <Switch
                  checked={editingStaff.is_active !== false}
                  onCheckedChange={(checked) => setEditingStaff({ ...editingStaff, is_active: checked })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !editingStaff?.name}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
