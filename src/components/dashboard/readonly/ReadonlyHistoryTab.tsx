import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock3, RefreshCw } from "lucide-react";

interface AttendanceItem {
  id: string;
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
}

interface ReadonlyHistoryTabProps {
  panelClass: string;
  selectedMonth: string;
  selectedYear: string;
  monthOptions: Array<{ value: string; label: string }>;
  yearOptions: string[];
  historyLoading: boolean;
  historyItems: AttendanceItem[];
  onChangeMonth: (month: string) => void;
  onChangeYear: (year: string) => void;
  onRefresh: () => void;
}

const formatDateLabel = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatTimeLabel = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  // Fallback for TIME values like HH:mm:ss
  const timeMatch = value.match(/^(\d{2}:\d{2})/);
  return timeMatch?.[1] || value;
};

const normalizeStatus = (status?: string | null) => (status || "tidak_hadir").toLowerCase();

const statusAppearance = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  if (normalized.includes("hadir")) {
    return {
      label: "Hadir",
      className: "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    };
  }
  if (normalized.includes("terlambat")) {
    return {
      label: "Terlambat",
      className: "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
    };
  }
  if (normalized.includes("izin") || normalized.includes("cuti")) {
    return {
      label: "Izin/Cuti",
      className: "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50",
    };
  }
  return {
    label: "Tidak Hadir",
    className: "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50",
  };
};

export function ReadonlyHistoryTab({
  panelClass,
  selectedMonth,
  selectedYear,
  monthOptions,
  yearOptions,
  historyLoading,
  historyItems,
  onChangeMonth,
  onChangeYear,
  onRefresh,
}: ReadonlyHistoryTabProps) {
  const summary = historyItems.reduce(
    (acc, item) => {
      const normalized = normalizeStatus(item.status);
      if (normalized.includes("hadir")) acc.present += 1;
      else if (normalized.includes("terlambat")) acc.late += 1;
      else acc.absent += 1;
      return acc;
    },
    { present: 0, late: 0, absent: 0 }
  );

  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Riwayat Kehadiran</CardTitle>
        <CardDescription>Riwayat absen per bulan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-600">Periode:</label>
            <Select value={selectedMonth} onValueChange={onChangeMonth}>
              <SelectTrigger className="w-[150px] bg-white">
                <SelectValue placeholder="Pilih Bulan" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={`history-month-${m.value}`} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={onChangeYear}>
              <SelectTrigger className="w-[110px] bg-white">
                <SelectValue placeholder="Tahun" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={`history-year-${year}`} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="hover:border-blue-300 hover:bg-blue-50" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Muat Ulang
          </Button>
        </div>

        {!historyLoading && historyItems.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-700/80">Hadir</p>
              <p className="text-xl font-semibold text-emerald-700">{summary.present}</p>
            </div>
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-amber-700/80">Terlambat</p>
              <p className="text-xl font-semibold text-amber-700">{summary.late}</p>
            </div>
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-rose-700/80">Tidak Hadir</p>
              <p className="text-xl font-semibold text-rose-700">{summary.absent}</p>
            </div>
          </div>
        ) : null}

        {historyLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={`history-skeleton-${i}`} className="h-16 w-full" />
            ))}
          </div>
        ) : historyItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center">
            <p className="text-sm font-medium text-slate-700">Belum ada riwayat absensi pada periode ini.</p>
            <p className="mt-1 text-xs text-slate-500">Coba pilih bulan lain atau muat ulang data.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
              <span>Tanggal</span>
              <span>Masuk</span>
              <span>Pulang</span>
              <span>Status</span>
            </div>
            {historyItems.map((item) => {
              const status = statusAppearance(item.status);
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr_auto] items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/95 p-3 text-sm shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{formatDateLabel(item.date)}</p>
                    <p className="truncate text-xs text-slate-500">{item.date}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Clock3 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{formatTimeLabel(item.check_in_time)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Clock3 className="h-3.5 w-3.5 text-blue-600" />
                    <span>{formatTimeLabel(item.check_out_time)}</span>
                  </div>
                  <Badge className={status.className}>{status.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
