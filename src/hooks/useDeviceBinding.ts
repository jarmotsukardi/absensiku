import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAndroidId,
  hasStoredDeviceId,
  syncDeviceIdFromDatabase,
  isDeviceIdMatch,
  getCurrentDeviceId,
} from "@/lib/deviceId";
import { debugLog } from "@/lib/debugLog";

interface DeviceBindingSettings {
  enable_device_binding: boolean;
  max_device_reset_count: number;
  require_password_change_for_reset: boolean;
}

interface DeviceBindingState {
  isEnabled: boolean;
  settings: DeviceBindingSettings;
  employeeAndroidId: string | null;
  currentAndroidId: string | null;
  resetCount: number;
  isDeviceValid: boolean;
  isFirstTime: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  needsDeviceSync: boolean;
}

export function useDeviceBinding(employeeId: string | null) {
  const [state, setState] = useState<DeviceBindingState>({
    isEnabled: false,
    settings: {
      enable_device_binding: false,
      max_device_reset_count: 3,
      require_password_change_for_reset: true,
    },
    employeeAndroidId: null,
    currentAndroidId: null,
    resetCount: 0,
    isDeviceValid: true,
    isFirstTime: true,
    isLoading: true,
    errorMessage: null,
    needsDeviceSync: false,
  });

  const fetchData = useCallback(async () => {
    if (!employeeId) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const currentDeviceId = getAndroidId(false);

    debugLog("[DeviceBinding] Fetching data for employee:", employeeId);
    debugLog("[DeviceBinding] Current device ID (generated):", currentDeviceId);
    debugLog("[DeviceBinding] Has stored device ID:", hasStoredDeviceId());

    try {
      // Fetch settings dan employee data secara paralel
      const [settingsRes, employeeRes] = await Promise.all([
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "attendance_security")
          .maybeSingle(),
        supabase
          .from("employees")
          .select("android_id, device_id_reset_count")
          .eq("id", employeeId)
          .single(),
      ]);

      const settingsValue = settingsRes.data?.value as unknown as Record<string, unknown> | null;
      const settings: DeviceBindingSettings = {
        enable_device_binding: (settingsValue?.enable_device_binding as boolean) ?? false,
        max_device_reset_count: (settingsValue?.max_device_reset_count as number) ?? 3,
        require_password_change_for_reset: (settingsValue?.require_password_change_for_reset as boolean) ?? true,
      };
      const isEnabled = settings.enable_device_binding;

      const employeeAndroidId = employeeRes.data?.android_id || null;
      const resetCount = employeeRes.data?.device_id_reset_count || 0;

      debugLog("[DeviceBinding] Settings enabled:", isEnabled);
      debugLog("[DeviceBinding] Employee android_id from DB:", employeeAndroidId);

      // Cek validitas device
      const isFirstTime = !employeeAndroidId;
      let isDeviceValid = true;
      let errorMessage: string | null = null;
      let needsDeviceSync = false;
      let finalDeviceId = currentDeviceId;

      // Cek apakah localStorage sudah punya device ID
      const storageHasDeviceId = hasStoredDeviceId();
      
      if (isEnabled && employeeAndroidId) {
        // Gunakan isDeviceIdMatch untuk backward compatibility
        const deviceMatches = isDeviceIdMatch(employeeAndroidId);
        
        if (currentDeviceId !== employeeAndroidId && !deviceMatches) {
          debugLog("[DeviceBinding] Device ID mismatch!");
          debugLog("[DeviceBinding] - Current (generated):", currentDeviceId);
          debugLog("[DeviceBinding] - Database:", employeeAndroidId);
          debugLog("[DeviceBinding] - Storage has ID:", storageHasDeviceId);
          debugLog("[DeviceBinding] - Any match found:", deviceMatches);
          
          // Jika localStorage kosong dan device ID dari database ada,
          // kemungkinan user melakukan reset storage pada device yang sama
          if (!storageHasDeviceId) {
            debugLog("[DeviceBinding] Storage kosong, melakukan auto-sync dari database");
            // Auto-sync: simpan device ID dari database ke localStorage
            syncDeviceIdFromDatabase(employeeAndroidId);
            // Gunakan device ID dari database
            finalDeviceId = employeeAndroidId;
            isDeviceValid = true;
            needsDeviceSync = true;
            errorMessage = null;
          } else {
            // localStorage ada tapi berbeda = benar-benar device berbeda
            debugLog("[DeviceBinding] Storage ada tapi berbeda, ini device berbeda");
            isDeviceValid = false;
            errorMessage = "Perangkat ini berbeda dengan yang terdaftar. Silakan reset device di menu profil.";
          }
        } else {
          debugLog("[DeviceBinding] Device ID match, valid (direct or backward-compatible)");
          // Device ID sama atau cocok dengan salah satu kemungkinan
          if (!storageHasDeviceId || deviceMatches) {
            // Sync dari database jika storage kosong atau match ditemukan
            syncDeviceIdFromDatabase(employeeAndroidId);
            finalDeviceId = employeeAndroidId;
            needsDeviceSync = true;
          }
          isDeviceValid = true;
        }
      } else if (!isEnabled) {
        debugLog("[DeviceBinding] Device binding disabled");
      } else if (isFirstTime) {
        debugLog("[DeviceBinding] First time, no device registered yet");
        if (!storageHasDeviceId) {
          syncDeviceIdFromDatabase(currentDeviceId);
        }
      }

      setState({
        isEnabled,
        settings,
        employeeAndroidId,
        currentAndroidId: finalDeviceId,
        resetCount,
        isDeviceValid,
        isFirstTime,
        isLoading: false,
        errorMessage,
        needsDeviceSync,
      });
    } catch (error: unknown) {
      console.error("Error fetching device binding data:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        errorMessage: "Gagal memuat data device binding",
      }));
    }
  }, [employeeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Register device saat absen pertama kali
  const registerDevice = useCallback(async (): Promise<boolean> => {
    if (!employeeId) return false;

    try {
      const { error } = await supabase
        .from("employees")
        .update({
          android_id: currentDeviceId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", employeeId);

      if (error) throw error;

      setState(prev => ({
        ...prev,
        employeeAndroidId: currentDeviceId,
        isFirstTime: false,
        isDeviceValid: true,
        errorMessage: null,
      }));

      return true;
    } catch (error) {
      console.error("Error registering device:", error);
      return false;
    }
  }, [employeeId]);

  // Fungsi untuk get current Android ID
  const getCurrentAndroidId = useCallback(() => getAndroidId(false), []);

  return {
    ...state,
    refetch: fetchData,
    registerDevice,
    getCurrentAndroidId,
  };
}
