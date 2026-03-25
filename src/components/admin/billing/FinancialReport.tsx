import { useEffect, useState } from "react";
import { useBillingSettings, useFinancialLedger } from "@/hooks/useBilling";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Download,
  TrendingUp,
  DollarSign,
  Receipt,
  Percent,
  Calendar,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
};

const getNumericSettingValue = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    if ("value" in objectValue) return getNumericSettingValue(objectValue.value, fallback);
    if ("amount" in objectValue) return getNumericSettingValue(objectValue.amount, fallback);
  }
  return fallback;
};

export function FinancialReport() {
  const ITEMS_PER_PAGE = 10;
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  });

  const { summary, transactions, isLoading } = useFinancialLedger(dateRange);
  const { getSetting, isLoading: isLoadingBillingSettings } = useBillingSettings();
  const [currentPage, setCurrentPage] = useState(1);

  const ppnPercentage = getNumericSettingValue(getSetting("vat_percentage"), 11);
  const pphPercentage = getNumericSettingValue(getSetting("pph_percentage"), 2);
  const totalTaxPercentage = Math.max(0, ppnPercentage + pphPercentage);

  const splitTaxAmount = (totalTaxAmount: number) => {
    if (!Number.isFinite(totalTaxAmount) || totalTaxAmount <= 0) {
      return { ppnAmount: 0, pphAmount: 0 };
    }
    if (totalTaxPercentage <= 0) {
      return { ppnAmount: totalTaxAmount, pphAmount: 0 };
    }
    const ppnAmount = Math.round((totalTaxAmount * ppnPercentage) / totalTaxPercentage);
    const pphAmount = totalTaxAmount - ppnAmount;
    return { ppnAmount, pphAmount };
  };

  const summaryPpn = summary.total_ppn > 0 || summary.total_pph > 0 ? summary.total_ppn : splitTaxAmount(summary.total_vat).ppnAmount;
  const summaryPph = summary.total_ppn > 0 || summary.total_pph > 0 ? summary.total_pph : splitTaxAmount(summary.total_vat).pphAmount;

  const handleQuickFilter = (months: number) => {
    const targetDate = months === 0 ? new Date() : subMonths(new Date(), months);
    setDateRange({
      start: format(startOfMonth(targetDate), "yyyy-MM-dd"),
      end: format(endOfMonth(targetDate), "yyyy-MM-dd"),
    });
  };

  const handleExport = async () => {
    try {
      const csv = await withTimeout(
        Promise.resolve().then(() => {
          const headers = ["Tanggal", "Tipe", "Kotor", "Fee", "PPN", "PPH", "Bersih", "Sumber", "Referensi"];
          const rows = transactions.map((tx) => {
            const tax = {
              ppnAmount: Number(tx.ppn_amount ?? splitTaxAmount(Number(tx.vat_amount || 0)).ppnAmount),
              pphAmount: Number(tx.pph_amount ?? splitTaxAmount(Number(tx.vat_amount || 0)).pphAmount),
            };
            return [
              tx.transaction_date,
              tx.transaction_type,
              tx.gross_amount,
              tx.xendit_fee,
              tax.ppnAmount,
              tax.pphAmount,
              tx.net_amount,
              tx.payment_source,
              tx.reference_number || "",
            ];
          });
          return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        }),
        10000,
        "Menyiapkan export laporan terlalu lama",
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-keuangan-${dateRange.start}-${dateRange.end}.csv`;
      a.click();
    } catch (error) {
      const errorRef = reportError(error, "admin.billing.financial_report.export");
      toast.error(appendErrorReference("Gagal mengekspor laporan keuangan.", errorRef));
    }
  };

  const totalPages = Math.max(1, Math.ceil(transactions.length / ITEMS_PER_PAGE));
  const paginatedTransactions = transactions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange.start, dateRange.end, transactions.length]);

  if (isLoading || isLoadingBillingSettings) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
        </div>
        <p className="text-base font-medium text-slate-900">Memuat laporan keuangan</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Data ringkasan transaksi dan pajak sedang disiapkan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Dari Tanggal</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Sampai Tanggal</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleQuickFilter(0)}>
                Bulan Ini
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleQuickFilter(1)}>
                Bulan Lalu
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleQuickFilter(2)}>
                2 Bulan Lalu
              </Button>
            </div>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Ekspor CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendapatan Kotor</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.total_gross)}</div>
            <p className="text-xs text-muted-foreground">{summary.transaction_count} transaksi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Biaya Gateway Pembayaran</CardTitle>
            <Receipt className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(summary.total_xendit_fee)}</div>
            <p className="text-xs text-muted-foreground">Biaya Xendit</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PPN</CardTitle>
            <Percent className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(summaryPpn)}</div>
            <p className="text-xs text-muted-foreground">Pajak pertambahan nilai</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PPH</CardTitle>
            <Percent className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">{formatCurrency(summaryPph)}</div>
            <p className="text-xs text-muted-foreground">Pajak penghasilan</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendapatan Bersih</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.total_net)}</div>
            <p className="text-xs text-muted-foreground">Pendapatan bersih</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Riwayat Transaksi
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead className="text-right">Kotor</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="text-right">PPN</TableHead>
                <TableHead className="text-right">PPH</TableHead>
                <TableHead className="text-right">Bersih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2 text-center">
                      <div className="rounded-full bg-slate-100 p-3">
                        <Calendar className="h-5 w-5 text-slate-500" />
                      </div>
                      <p className="text-base font-medium text-slate-800">Tidak ada transaksi pada periode ini</p>
                      <p className="text-sm text-muted-foreground">
                        Coba ubah rentang tanggal atau gunakan filter cepat Bulan Ini/Bulan Lalu.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedTransactions.map((tx) => {
                  const tax = {
                    ppnAmount: Number(tx.ppn_amount ?? splitTaxAmount(Number(tx.vat_amount || 0)).ppnAmount),
                    pphAmount: Number(tx.pph_amount ?? splitTaxAmount(Number(tx.vat_amount || 0)).pphAmount),
                  };
                  return (
                    <TableRow key={String(tx.id)}>
                      <TableCell>{format(new Date(String(tx.transaction_date)), "dd MMM yyyy", { locale: id })}</TableCell>
                      <TableCell>
                        <Badge variant={tx.transaction_type === "REFUND" ? "destructive" : "default"}>
                          {String(tx.transaction_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tx.payment_source === "XENDIT" ? "Online" : "Manual"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(tx.gross_amount || 0))}</TableCell>
                      <TableCell className="text-right text-orange-600">
                        {Number(tx.xendit_fee || 0) > 0 ? `-${formatCurrency(Number(tx.xendit_fee || 0))}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">{formatCurrency(tax.ppnAmount)}</TableCell>
                      <TableCell className="text-right text-indigo-600">{formatCurrency(tax.pphAmount)}</TableCell>
                      <TableCell className="text-right font-bold text-green-600">{formatCurrency(Number(tx.net_amount || 0))}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {transactions.length > 0 && (
            <div className="mt-4 flex items-center justify-between px-6 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">Halaman {currentPage} dari {totalPages}</span>
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
    </div>
  );
}
