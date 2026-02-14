import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAndroidId,
  hasStoredDeviceId,
  syncDeviceIdFromDatabase,
  isDeviceIdMatch,
  getCurrentDeviceId,
} from "@/lib/deviceId";

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

  // PENTING: Jangan simpan ke storage dulu, cek database dulu
  // Ini untuk menangani kasus storage reset
  const currentDeviceId = useMemo(() => getAndroidId(false), []);

  const fetchData = useCallback(async () => {
    if (!employeeId) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    console.log("[DeviceBinding] Fetching data for employee:", employeeId);
    console.log("[DeviceBinding] Current device ID (generated):", currentDeviceId);
    console.log("[DeviceBinding] Has stored device ID:", hasStoredDeviceId());

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

      console.log("[DeviceBinding] Settings enabled:", isEnabled);
      console.log("[DeviceBinding] Employee android_id from DB:", employeeAndroidId);

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
          console.log("[DeviceBinding] Device ID mismatch!");
          console.log("[DeviceBinding] - Current (generated):", currentDeviceId);
          console.log("[DeviceBinding] - Database:", employeeAndroidId);
          console.log("[DeviceBinding] - Storage has ID:", storageHasDeviceId);
          console.log("[DeviceBinding] - Any match found:", deviceMatches);
          
          // Jika localStorage kosong dan device ID dari database ada,
          // kemungkinan user melakukan reset storage pada device yang sama
          if (!storageHasDeviceId) {
            console.log("[DeviceBinding] Storage kosong, melakukan auto-sync dari database");
            // Auto-sync: simpan device ID dari database ke localStorage
            syncDeviceIdFromDatabase(employeeAndroidId);
            // Gunakan device ID dari database
            finalDeviceId = employeeAndroidId;
            isDeviceValid = true;
            needsDeviceSync = true;
            errorMessage = null;
          } else {
            // localStorage ada tapi berbeda = benar-benar device berbeda
            console.log("[DeviceBinding] Storage ada tapi berbeda, ini device berbeda");
            isDeviceValid = false;
            errorMessage = "Perangkat ini berbeda dengan yang terdaftar. Silakan reset device di menu profil.";
          }
        } else {
          console.log("[DeviceBinding] Device ID match, valid (direct or backward-compatible)");
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
        console.log("[DeviceBinding] Device binding disabled");
      } else if (isFirstTime) {
        console.log("[DeviceBinding] First time, no device registered yet");
        // Simpan device ID ke localStorage untuk pertama kali
        if (!storageHasDeviceId) {
          localStorage.setItem("web_device_id", currentDeviceId);
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
  }, [employeeId, currentDeviceId]);

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
  }, [employeeId, currentDeviceId]);

  // Fungsi untuk get current Android ID
  const getCurrentAndroidId = useCallback(() => currentDeviceId, [currentDeviceId]);

  return {
    ...state,
    refetch: fetchData,
    registerDevice,
    getCurrentAndroidId,
  };
}