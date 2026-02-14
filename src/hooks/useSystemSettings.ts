import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SystemSetting {
  id: string;
  key: string;
  value: any;
  description: string | null;
  updated_at: string;
}

export function useSystemSettings(settingKey?: string) {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [setting, setSetting] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      if (settingKey) {
        const { data, error } = await supabase
          .from("system_settings")
          .select("*")
          .eq("key", settingKey)
          .maybeSingle();

        if (error) throw error;
        setSetting(data?.value || null);
      } else {
        const { data, error } = await supabase
          .from("system_settings")
          .select("*")
          .order("key");

        if (error) throw error;
        setSettings(data || []);
      }
    } catch (error) {
      console.error("Error fetching system settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [settingKey]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSetting = async (key: string, value: any, description?: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Upsert - insert or update
      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key,
          value,
          description: description || null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        }, {
          onConflict: "key",
        });

      if (error) throw error;
      
      toast.success("Pengaturan berhasil disimpan");
      await fetchSettings();
      return true;
    } catch (error: any) {
      console.error("Error saving system setting:", error);
      toast.error("Gagal menyimpan pengaturan: " + error.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const getSetting = (key: string): any => {
    const found = settings.find(s => s.key === key);
    return found?.value || null;
  };

  return {
    settings,
    setting,
    isLoading,
    isSaving,
    saveSetting,
    getSetting,
    refetch: fetchSettings,
  };
}
