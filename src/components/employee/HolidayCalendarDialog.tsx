import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarDays, ChevronLeft, ChevronRight, Sun, Briefcase } from "lucide-react";
import { format, startOfMonth, endOfMonth, isSameMonth, isSameDay, isWeekend, getMonth, getYear, addMonths, subMonths } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface HolidayData {
  year: number;
  month: number;
  dates: string; // JSON string array e.g. "[1,2,3]"
  description: string;
  institution_type: string | null;
}

// Helper untuk parse dates
const parseDates = (dates: string): number[] => {
  try {
    const parsed = JSON.parse(dates);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

interface HolidayCalendarDialogProps {
  tenantId?: string;
  institutionType?: string;
}

export function HolidayCalendarDialog({ tenantId, institutionType }: HolidayCalendarDialogProps) {
  const [open, setOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [holidays, setHolidays] = useState<HolidayData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch holidays ketika dialog dibuka atau bulan berubah
  useEffect(() => {
    if (!open || !tenantId) return;

    const fetchHolidays = async () => {
      setIsLoading(true);
      try {
        const year = getYear(currentMonth);
        const month = getMonth(currentMonth) + 1; // 1-indexed

        let query = supabase
          .from("work_holidays")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("year", year)
          .eq("month", month);

        // Filter by institution type jika ada
        if (institutionType) {
          query = query.or(`institution_type.eq.${institutionType},institution_type.is.null`);
        }

        const { data, error } = await query;

        if (error) throw error;
        setHolidays(data || []);
      } catch (error) {
        console.error("Error fetching holidays:", error);
        setHolidays([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHolidays();
  }, [open, tenantId, currentMonth, institutionType]);

  // Fungsi untuk mendapatkan daftar tanggal libur
  const getHolidayDates = (): Date[] => {
    const dates: Date[] = [];
    holidays.forEach(h => {
      const datesArr = parseDates(h.dates);
      datesArr.forEach(d => {
        dates.push(new Date(h.year, h.month - 1, d));
      });
    });
    return dates;
  };

  // Fungsi untuk mendapatkan deskripsi libur pada tanggal tertentu
  const getHolidayDescription = (date: Date): string | null => {
    const day = date.getDate();
    const month = getMonth(date) + 1;
    const year = getYear(date);

    const holiday = holidays.find(h => 
      h.year === year && h.month === month && parseDates(h.dates).includes(day)
    );

    return holiday?.description || null;
  };

  // Daftar libur bulan ini untuk ditampilkan
  const holidaysThisMonth = holidays.flatMap(h => 
    parseDates(h.dates).map(d => ({
      date: new Date(h.year, h.month - 1, d),
      description: h.description
    }))
  ).sort((a, b) => a.date.getTime() - b.date.getTime());

  const holidayDates = getHolidayDates();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-primary-foreground/10 text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/20">
          <CalendarDays className="h-4 w-4" />
          Kalender
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Kalender & Jadwal Libur
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Navigation Bulan */}
          <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold">
              {format(currentMonth, "MMMM yyyy", { locale: localeId })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar */}
          <div className="px-2">
            <Calendar
              mode="single"
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              className={cn("p-2 pointer-events-auto")}
              modifiers={{
                holiday: holidayDates,
                weekend: (date) => isWeekend(date) && isSameMonth(date, currentMonth),
              }}
              modifiersStyles={{
                holiday: {
                  backgroundColor: "hsl(var(--destructive) / 0.15)",
                  color: "hsl(var(--destructive))",
                  fontWeight: "bold",
                  borderRadius: "50%",
                },
                weekend: {
                  color: "hsl(var(--destructive) / 0.7)",
                },
              }}
              disabled={(date) => !isSameMonth(date, currentMonth)}
              components={{
                DayContent: ({ date }) => {
                  const isHoliday = holidayDates.some(h => isSameDay(h, date));
                  const isToday = isSameDay(date, new Date());
                  
                  return (
                    <div className={cn(
                      "relative w-full h-full flex items-center justify-center",
                      isToday && "ring-2 ring-primary ring-offset-1 rounded-full"
                    )}>
                      {date.getDate()}
                      {isHoliday && (
                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-destructive rounded-full" />
                      )}
                    </div>
                  );
                }
              }}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2 text-xs border-t bg-muted/20">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-destructive/20 border border-destructive/50" />
              <span>Libur</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full ring-2 ring-primary" />
              <span>Hari Ini</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-destructive/70">Sab/Min</span>
              <span>Weekend</span>
            </div>
          </div>

          {/* Holiday List */}
          <div className="flex-1 border-t">
            <div className="px-4 py-2 bg-muted/30">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-500" />
                Jadwal Libur Bulan Ini
              </h3>
            </div>
            <ScrollArea className="h-[150px]">
              <div className="px-4 py-2 space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Memuat...
                  </p>
                ) : holidaysThisMonth.length === 0 ? (
                  <div className="text-center py-4">
                    <Briefcase className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Tidak ada libur khusus bulan ini
                    </p>
                  </div>
                ) : (
                  holidaysThisMonth.map((holiday, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-3 p-2 rounded-lg bg-destructive/5 border border-destructive/10"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-destructive/10 flex flex-col items-center justify-center">
                        <span className="text-xs font-medium text-destructive">
                          {format(holiday.date, "dd", { locale: localeId })}
                        </span>
                        <span className="text-[10px] text-destructive/70">
                          {format(holiday.date, "EEE", { locale: localeId })}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {holiday.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(holiday.date, "EEEE, dd MMMM", { locale: localeId })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
