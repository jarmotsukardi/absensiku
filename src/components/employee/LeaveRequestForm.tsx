import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { Enums } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import {
  fetchTenantLeaveRequestOptions,
  getDefaultAttendanceLeaveOptions,
  HR_LEAVE_REQUEST_TYPE_LABELS,
  type LeaveRequestOption,
} from "@/lib/hrLeaveTypes";
import {
  Calendar as CalendarIcon,
  FileText,
  Briefcase,
  Heart,
  Plane,
  ChevronRight,
  Loader2,
  Plus,
} from "lucide-react";

const leaveRequestSchema = z.object({
  leave_type_id: z.string().min(1, "Jenis pengajuan wajib dipilih"),
  start_date: z.date({ required_error: "Tanggal mulai wajib diisi" }),
  end_date: z.date({ required_error: "Tanggal selesai wajib diisi" }),
  reason: z.string().min(10, "Alasan minimal 10 karakter").max(500, "Alasan maksimal 500 karakter"),
  is_half_day: z.boolean().default(false),
  document_reference_number: z.string().max(120, "Nomor dokumen maksimal 120 karakter").optional(),
  document_reference_date: z.date().optional(),
  document_reference_issuer: z.string().max(160, "Penerbit maksimal 160 karakter").optional(),
  document_reference_notes: z.string().max(500, "Catatan maksimal 500 karakter").optional(),
}).superRefine((data, ctx) => {
  if (data.end_date < data.start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tanggal selesai harus setelah tanggal mulai",
      path: ["end_date"],
    });
  }
});

type LeaveRequestFormData = z.infer<typeof leaveRequestSchema>;

interface LeaveRequestFormProps {
  onSubmit: (data: {
    leave_type: Enums<"leave_type">;
    leave_type_id?: string;
    start_date: string;
    end_date: string;
    reason: string;
    is_half_day?: boolean;
    document_reference_number?: string;
    document_reference_date?: string;
    document_reference_issuer?: string;
    document_reference_notes?: string;
  }) => Promise<{ success: boolean; message: string }>;
  isSubmitting: boolean;
  tenantId?: string | null;
}

const iconByRequestType: Record<Enums<"leave_type">, typeof FileText> = {
  izin: FileText,
  cuti_tahunan: Plane,
  cuti_penting: Heart,
  cuti_lainnya: CalendarIcon,
  sakit: Heart,
  tugas_luar: Briefcase,
};

export function LeaveRequestForm({ onSubmit, isSubmitting, tenantId }: LeaveRequestFormProps) {
  const [open, setOpen] = useState(false);
  const [managedLeaveTypes, setManagedLeaveTypes] = useState<LeaveRequestOption[]>([]);
  const [isLoadingLeaveTypes, setIsLoadingLeaveTypes] = useState(false);
  const { toast } = useToast();

  const form = useForm<LeaveRequestFormData>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      is_half_day: false,
      reason: "",
      leave_type_id: "",
      document_reference_number: "",
      document_reference_issuer: "",
      document_reference_notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const run = async () => {
      try {
        setIsLoadingLeaveTypes(true);
        const items = tenantId
          ? await fetchTenantLeaveRequestOptions(tenantId)
          : getDefaultAttendanceLeaveOptions();
        if (cancelled) return;
        setManagedLeaveTypes(items);
        const current = form.getValues("leave_type_id");
        const firstSelectableValue = items[0]?.id || items[0]?.request_type || "";
        if (!current && firstSelectableValue) {
          form.setValue("leave_type_id", firstSelectableValue, { shouldValidate: true });
        }
      } catch {
        if (!cancelled) setManagedLeaveTypes([]);
      } finally {
        if (!cancelled) setIsLoadingLeaveTypes(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [form, open, tenantId]);

  const selectedLeaveTypeId = form.watch("leave_type_id");
  const selectedLeaveType = useMemo(
    () =>
      managedLeaveTypes.find((item) => (item.id || item.request_type) === selectedLeaveTypeId) || null,
    [managedLeaveTypes, selectedLeaveTypeId],
  );

  const handleSubmit = async (data: LeaveRequestFormData) => {
    const selectedType = managedLeaveTypes.find(
      (item) => (item.id || item.request_type) === data.leave_type_id,
    );
    if (!selectedType) {
      toast({
        variant: "destructive",
        title: "Jenis Pengajuan Tidak Valid",
        description: "Jenis cuti/izin HR tidak ditemukan untuk tenant aktif.",
      });
      return;
    }

    const result = await onSubmit({
      leave_type: selectedType.request_type,
      leave_type_id: selectedType.id || undefined,
      start_date: format(data.start_date, "yyyy-MM-dd"),
      end_date: format(data.end_date, "yyyy-MM-dd"),
      reason: data.reason,
      is_half_day: data.is_half_day,
      document_reference_number: data.document_reference_number?.trim() || undefined,
      document_reference_date: data.document_reference_date
        ? format(data.document_reference_date, "yyyy-MM-dd")
        : undefined,
      document_reference_issuer: data.document_reference_issuer?.trim() || undefined,
      document_reference_notes: data.document_reference_notes?.trim() || undefined,
    });

    if (result.success) {
      toast({
        title: "Pengajuan Berhasil",
        description: result.message,
      });
      form.reset();
      setOpen(false);
    } else {
      toast({
        variant: "destructive",
        title: "Pengajuan Gagal",
        description: result.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Buat Pengajuan Baru
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pengajuan Izin / Cuti</DialogTitle>
          <DialogDescription>
            Isi form berikut untuk mengajukan izin atau cuti tanpa mengunggah file.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="leave_type_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jenis Pengajuan</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder={isLoadingLeaveTypes ? "Memuat jenis pengajuan..." : "Pilih jenis pengajuan"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {managedLeaveTypes.map((type) => {
                        const Icon = iconByRequestType[type.request_type] || FileText;
                        return (
                        <SelectItem key={type.id || type.request_type} value={type.id || type.request_type}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            <span>{type.leave_name}</span>
                          </div>
                        </SelectItem>
                      )})}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {selectedLeaveType
                      ? `${HR_LEAVE_REQUEST_TYPE_LABELS[selectedLeaveType.request_type]} • ${selectedLeaveType.requires_document ? "wajib referensi dokumen" : "tanpa referensi dokumen wajib"} • ${selectedLeaveType.source === "hr" ? "mengikuti master HR" : "mengikuti absensi inti"}`
                      : "Jenis pengajuan mengikuti master tenant yang aktif."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedLeaveType?.requires_document ? (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertTitle>Referensi dokumen diperlukan</AlertTitle>
                <AlertDescription>
                  {selectedLeaveType.document_template?.template_name
                    ? `Gunakan template "${selectedLeaveType.document_template.template_name}" sebagai acuan penomoran atau format surat yang perlu dirujuk.`
                    : "Jenis pengajuan ini membutuhkan nomor dokumen rujukan. Hubungi admin HR bila template dokumen belum ditentukan."}
                </AlertDescription>
              </Alert>
            ) : null}

            {selectedLeaveType?.requires_document ? (
              <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                <FormField
                  control={form.control}
                  name="document_reference_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nomor Dokumen</FormLabel>
                      <FormControl>
                        <Input placeholder="Contoh: 800/SDM/III/2026" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription>
                        Isi nomor surat, nomor referensi, atau nomor keterangan yang diverifikasi HR.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="document_reference_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Tanggal Dokumen</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                              >
                                {field.value ? format(field.value, "dd MMM yyyy", { locale: id }) : <span>Pilih tanggal</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="document_reference_issuer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Penerbit Dokumen</FormLabel>
                        <FormControl>
                          <Input placeholder="Contoh: RSUD, Puskesmas, Atasan Langsung" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="document_reference_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catatan Referensi</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Ringkasan isi surat atau keterangan yang membantu verifikasi admin"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tanggal Mulai</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd MMM yyyy", { locale: id })
                            ) : (
                              <span>Pilih tanggal</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tanggal Selesai</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd MMM yyyy", { locale: id })
                            ) : (
                              <span>Pilih tanggal</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => {
                            const startDate = form.getValues("start_date");
                            return date < (startDate || new Date(new Date().setHours(0, 0, 0, 0)));
                          }}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_half_day"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Setengah Hari</FormLabel>
                    <FormDescription>
                      Centang jika hanya izin setengah hari
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alasan</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tuliskan alasan pengajuan..."
                      className="min-h-[100px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {field.value?.length || 0}/500 karakter
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Mengirim...
                  </>
                ) : (
                  "Kirim Pengajuan"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
