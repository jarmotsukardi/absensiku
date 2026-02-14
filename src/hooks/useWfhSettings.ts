import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WfhSettings {
  allow_wfh: boolean;
  wfh_requires_approval: boolean;
}

export function useWfhSettings(tenantId?: string | null) {
  const [settings, setSettings] = useState<WfhSettings>({
    allow_wfh: false,
    wfh_requires_approval: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!tenantId) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("organization_settings")
        .select("setting_key, setting_value")
        .eq("tenant_id", tenantId)
        .in("setting_key", ["allow_wfh", "wfh_requires_approval"]);

      if (error) throw error;

      const newSettings: WfhSettings = {
        allow_wfh: false,
        wfh_requires_approval: true,
      };

      data?.forEach((item) => {
        if (item.setting_key === "allow_wfh") {
          newSettings.allow_wfh = item.setting_value === true || item.setting_value === "true";
        }
        if (item.setting_key === "wfh_requires_approval") {
          newSettings.wfh_requires_approval = item.setting_value !== false && item.setting_value !== "false";
        }
      });

      setSettings(newSettings);
      setError(null);
    } catch (err) {
      console.error("Error fetching WFH settings:", err);
      setError("Gagal memuat pengaturan WFH");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (key: keyof WfhSettings, value: boolean) => {
    if (!tenantId) return false;

    try {
      // Check if setting exists
      const { data: existing } = await supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", key)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("organization_settings")
          .update({ setting_value: value })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("organization_settings")
          .insert({
            tenant_id: tenantId,
            setting_key: key,
            setting_value: value,
            description: key === "allow_wfh" 
              ? "Izinkan absensi Work From Home" 
              : "WFH memerlukan persetujuan atasan",
          });
        if (error) throw error;
      }

      setSettings((prev) => ({ ...prev, [key]: value }));
      return true;
    } catch (err) {
      console.error("Error updating WFH setting:", err);
      setError("Gagal menyimpan pengaturan");
      return false;
    }
  };

  return {
    settings,
    isLoading,
    error,
    updateSetting,
    refetch: fetchSettings,
  };
}
