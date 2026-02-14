 import { useState, useEffect } from "react";
 import { useOvertimeSettings } from "@/hooks/useOvertimeRequests";
 import { supabase } from "@/integrations/supabase/client";
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Switch } from "@/components/ui/switch";
 import { Textarea } from "@/components/ui/textarea";
 import { Loader2, Save, Timer, Clock, Calendar, Percent } from "lucide-react";
 import DashboardLayout from "@/components/dashboard/DashboardLayout";
 
 export default function OrgOvertimeSettings() {
   const [tenantId, setTenantId] = useState<string | undefined>(undefined);
   
   useEffect(() => {
     const fetchTenantId = async () => {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;
       
       const { data } = await supabase
         .from("employees")
         .select("tenant_id")
         .eq("user_id", user.id)
         .single();
       
       if (data) setTenantId(data.tenant_id);
     };
     fetchTenantId();
   }, []);
   
   const { settings, isLoading, saveSettings } = useOvertimeSettings(tenantId);
 
   const [isSaving, setIsSaving] = useState(false);
   
   const [formData, setFormData] = useState({
     is_enabled: true,
     min_hours: 1,
     max_hours_per_day: 4,
     max_hours_per_month: 40,
     requires_approval: true,
     rate_multiplier: 1.5,
     weekend_rate_multiplier: 2.0,
     holiday_rate_multiplier: 2.5,
     allow_multi_date_request: true,
     max_dates_per_request: 10,
     auto_reject_after_days: 3,
     notes: "",
   });
 
   useEffect(() => {
     if (settings) {
       setFormData({
         is_enabled: settings.is_enabled,
         min_hours: settings.min_hours,
         max_hours_per_day: settings.max_hours_per_day,
         max_hours_per_month: settings.max_hours_per_month,
         requires_approval: settings.requires_approval,
         rate_multiplier: settings.rate_multiplier,
         weekend_rate_multiplier: settings.weekend_rate_multiplier,
         holiday_rate_multiplier: settings.holiday_rate_multiplier,
         allow_multi_date_request: settings.allow_multi_date_request,
         max_dates_per_request: settings.max_dates_per_request,
         auto_reject_after_days: settings.auto_reject_after_days,
         notes: settings.notes || "",
       });
     }
   }, [settings]);
 
   const handleSave = async () => {
     setIsSaving(true);
     await saveSettings(formData);
     setIsSaving(false);
   };
 
   if (isLoading) {
     return (
       <DashboardLayout title="Pengaturan Lembur" subtitle="Konfigurasi aturan lembur">
         <div className="flex items-center justify-center h-32">
           <Loader2 className="h-6 w-6 animate-spin" />
         </div>
       </DashboardLayout>
     );
   }
 
   return (
     <DashboardLayout 
       title="Pengaturan Lembur"
       subtitle="Konfigurasi aturan dan kebijakan lembur"
     >
       <div className="space-y-6 max-w-3xl">
         {/* Enable/Disable */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Timer className="h-4 w-4" />
               Status Fitur Lembur
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="flex items-center justify-between">
               <div>
                 <Label>Aktifkan Fitur Lembur</Label>
                 <p className="text-sm text-muted-foreground">
                   Pegawai dapat mengajukan lembur jika diaktifkan
                 </p>
               </div>
               <Switch
                 checked={formData.is_enabled}
                 onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
               />
             </div>
           </CardContent>
         </Card>
 
         {/* Time Limits */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Clock className="h-4 w-4" />
               Batasan Waktu
             </CardTitle>
             <CardDescription>Atur batasan jam lembur</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid gap-4 md:grid-cols-3">
               <div className="space-y-2">
                 <Label>Minimum Jam per Request</Label>
                 <Input
                   type="number"
                   step="0.5"
                   value={formData.min_hours}
                   onChange={(e) => setFormData({ ...formData, min_hours: parseFloat(e.target.value) })}
                   min={0.5}
                   max={8}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Maksimum Jam per Hari</Label>
                 <Input
                   type="number"
                   step="0.5"
                   value={formData.max_hours_per_day}
                   onChange={(e) => setFormData({ ...formData, max_hours_per_day: parseFloat(e.target.value) })}
                   min={1}
                   max={12}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Maksimum Jam per Bulan</Label>
                 <Input
                   type="number"
                   value={formData.max_hours_per_month}
                   onChange={(e) => setFormData({ ...formData, max_hours_per_month: parseFloat(e.target.value) })}
                   min={1}
                   max={100}
                 />
               </div>
             </div>
           </CardContent>
         </Card>
 
         {/* Rate Multipliers */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Percent className="h-4 w-4" />
               Pengali Tarif (Rate Multiplier)
             </CardTitle>
             <CardDescription>Untuk perhitungan upah lembur</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid gap-4 md:grid-cols-3">
               <div className="space-y-2">
                 <Label>Hari Kerja (x)</Label>
                 <Input
                   type="number"
                   step="0.1"
                   value={formData.rate_multiplier}
                   onChange={(e) => setFormData({ ...formData, rate_multiplier: parseFloat(e.target.value) })}
                   min={1}
                   max={5}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Weekend (x)</Label>
                 <Input
                   type="number"
                   step="0.1"
                   value={formData.weekend_rate_multiplier}
                   onChange={(e) => setFormData({ ...formData, weekend_rate_multiplier: parseFloat(e.target.value) })}
                   min={1}
                   max={5}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Hari Libur (x)</Label>
                 <Input
                   type="number"
                   step="0.1"
                   value={formData.holiday_rate_multiplier}
                   onChange={(e) => setFormData({ ...formData, holiday_rate_multiplier: parseFloat(e.target.value) })}
                   min={1}
                   max={5}
                 />
               </div>
             </div>
           </CardContent>
         </Card>
 
         {/* Request Settings */}
         <Card>
           <CardHeader className="pb-3">
             <CardTitle className="flex items-center gap-2 text-base">
               <Calendar className="h-4 w-4" />
               Pengaturan Pengajuan
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="flex items-center justify-between">
               <div>
                 <Label>Perlu Persetujuan Admin</Label>
                 <p className="text-sm text-muted-foreground">
                   Lembur memerlukan approval dari admin
                 </p>
               </div>
               <Switch
                 checked={formData.requires_approval}
                 onCheckedChange={(checked) => setFormData({ ...formData, requires_approval: checked })}
               />
             </div>
 
             <div className="flex items-center justify-between">
               <div>
                 <Label>Izinkan Multi-Tanggal</Label>
                 <p className="text-sm text-muted-foreground">
                   Pegawai bisa ajukan beberapa tanggal sekaligus
                 </p>
               </div>
               <Switch
                 checked={formData.allow_multi_date_request}
                 onCheckedChange={(checked) => setFormData({ ...formData, allow_multi_date_request: checked })}
               />
             </div>
 
             <div className="grid gap-4 md:grid-cols-2">
               <div className="space-y-2">
                 <Label>Maks. Tanggal per Pengajuan</Label>
                 <Input
                   type="number"
                   value={formData.max_dates_per_request}
                   onChange={(e) => setFormData({ ...formData, max_dates_per_request: parseInt(e.target.value) })}
                   min={1}
                   max={30}
                   disabled={!formData.allow_multi_date_request}
                 />
               </div>
               <div className="space-y-2">
                 <Label>Auto-Reject Setelah (hari)</Label>
                 <Input
                   type="number"
                   value={formData.auto_reject_after_days}
                   onChange={(e) => setFormData({ ...formData, auto_reject_after_days: parseInt(e.target.value) })}
                   min={1}
                   max={14}
                 />
               </div>
             </div>
 
             <div className="space-y-2">
               <Label>Catatan Kebijakan</Label>
               <Textarea
                 value={formData.notes}
                 onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                 placeholder="Catatan atau kebijakan lembur organisasi..."
                 rows={3}
               />
             </div>
           </CardContent>
         </Card>
 
         <div className="flex justify-end">
           <Button onClick={handleSave} disabled={isSaving}>
             {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
             Simpan Pengaturan
           </Button>
         </div>
       </div>
     </DashboardLayout>
   );
 }