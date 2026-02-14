import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Loader2, Flame, Clock, AlertTriangle } from "lucide-react";

export default function TrialSettings({ embedded = false }: { embedded?: boolean }) {
  const [streakThreshold, setStreakThreshold] = useState(30);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["streak_threshold", "streak_grace_period_days"]);

      if (data) {
        const threshold = data.find(d => d.key === "streak_threshold");
        const grace = data.find(d => d.key === "streak_grace_period_days");
        if (threshold) setStreakThreshold((threshold.value as any)?.value ?? 30);
        if (grace) setGracePeriodDays((grace.value as any)?.value ?? 7);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const item of [
        { key: "streak_threshold", value: { value: streakThreshold }, description: "Jumlah hari streak untuk aktivasi" },
        { key: "streak_grace_period_days", value: { value: gracePeriodDays }, description: "Masa tenggang pembayaran (hari)" },
      ]) {
        const { data: existing } = await supabase
          .from("system_settings")
          .select("id")
          .eq("key", item.key)
          .maybeSingle();

        if (existing) {
          await supabase.from("system_settings").update({ value: item.value as any, updated_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          await supabase.from("system_settings").insert({ key: item.key, value: item.value as any, description: item.description });
        }
      }
      toast.success("Konfigurasi streak berhasil disimpan");
    } catch (error) {
      toast.error("Gagal menyimpan konfigurasi");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    const loadingContent = <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    if (embedded) return loadingContent;
    return (
      <SuperAdminLayout title="Konfigurasi Streak" subtitle="Atur parameter stabilitas penggunaan">
        {loadingContent}
      </SuperAdminLayout>
    );
  }

  const content = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            Konfigurasi Streak Monitoring
          </h1>
          <p className="text-muted-foreground">Parameter ini menentukan kapan tenant dianggap aktif dan siap ditagih</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Simpan
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Streak Threshold
            </CardTitle>
            <CardDescription>Jumlah hari berturut-turut penggunaan absensi pada hari kerja</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Target Hari Streak</Label>
              <Input
                type="number"
                value={streakThreshold}
                onChange={(e) => setStreakThreshold(parseInt(e.target.value) || 30)}
                min={7}
                max={90}
              />
              <p className="text-xs text-muted-foreground">
                Setelah mencapai {streakThreshold} hari berturut-turut, status tenant berubah menjadi "Ready for Invoicing"
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Masa Tenggang Pembayaran
            </CardTitle>
            <CardDescription>Waktu yang diberikan untuk menyelesaikan pembayaran</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Grace Period (hari)</Label>
              <Input
                type="number"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(parseInt(e.target.value) || 7)}
                min={1}
                max={30}
              />
              <p className="text-xs text-muted-foreground">
                Jika pembayaran tidak diselesaikan dalam {gracePeriodDays} hari, akses fitur absensi akan dikunci
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200 dark:border-amber-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-300">Algoritma Streak</p>
              <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
                <li>Streak bertambah setiap hari kerja jika ada aktivitas absensi</li>
                <li>Hari Sabtu, Minggu, dan libur nasional dikecualikan</li>
                <li>Hari libur khusus yang ditetapkan admin organisasi juga dikecualikan</li>
                <li>Streak di-reset ke 1 jika terputus pada hari kerja aktif</li>
                <li>Setelah target tercapai → status "Ready for Invoicing" + masa tenggang dimulai</li>
                <li>Jika pembayaran tidak dilakukan → status "Suspended" (fitur dikunci, data tetap aman)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (embedded) return content;

  return (
    <SuperAdminLayout title="Konfigurasi Streak" subtitle="Atur parameter stabilitas penggunaan tenant">
      {content}
    </SuperAdminLayout>
  );
}
