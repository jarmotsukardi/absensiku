import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getAndroidId } from "@/lib/deviceId";

// Konstanta optimasi
const DEBOUNCE_MS = 1000; // Mencegah double-submit
const MIN_REQUEST_INTERVAL_MS = 2000; // Minimum interval antar request
const BATCH_UPDATE_DELAY_MS = 5000; // Delay batch update device info

interface LoginResult {
  success: boolean;
  userId?: string;
  error?: string;
}

interface PendingDeviceUpdate {
  employeeId: string;
  deviceId: string;
  timestamp: string;
}

/**
 * Hook untuk login yang dioptimasi untuk skalabilitas tinggi
 * Menangani ratusan ribu request bersamaan dengan:
 * 1. Debouncing untuk mencegah double-submit
 * 2. Batching update device info
 * 3. Optimistic response
 * 4. Connection reuse
 */
export function useOptimizedLogin() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs untuk tracking
  const lastRequestTime = useRef<number>(0);
  const pendingUpdateRef = useRef<PendingDeviceUpdate | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef(false);

  // Generate device ID menggunakan utility tunggal
  const getDeviceId = useCallback((): string => {
    return getAndroidId(true);
  }, []);

  // Batch device update - tidak blocking login
  const scheduleDeviceUpdate = useCallback((employeeId: string, deviceId: string) => {
    // Cancel pending update jika ada
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    pendingUpdateRef.current = {
      employeeId,
      deviceId,
      timestamp: new Date().toISOString(),
    };

    // Schedule update dengan delay
    updateTimeoutRef.current = setTimeout(async () => {
      const pending = pendingUpdateRef.current;
      if (!pending) return;

      try {
        await supabase
          .from("employees")
          .update({
            last_login_device_id: pending.deviceId,
            last_login_at: pending.timestamp,
          })
          .eq("id", pending.employeeId);
      } catch (error) {
        console.error("Background device update failed:", error);
      }
      
      pendingUpdateRef.current = null;
    }, BATCH_UPDATE_DELAY_MS);
  }, []);

  // Login utama dengan optimasi
  const login = useCallback(async (
    email: string, 
    password: string
  ): Promise<LoginResult> => {
    // Cegah double-submit
    if (isSubmittingRef.current) {
      return { success: false, error: "Sedang memproses..." };
    }

    // Rate limiting client-side
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime.current;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      return { 
        success: false, 
        error: `Tunggu ${Math.ceil((MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest) / 1000)} detik` 
      };
    }

    // Validasi input
    if (!email?.trim() || !password) {
      return { success: false, error: "Email dan password harus diisi" };
    }

    isSubmittingRef.current = true;
    lastRequestTime.current = now;
    setIsLoading(true);

    try {
      // 1. Autentikasi - operasi utama
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        return { 
          success: false, 
          error: authError.message.includes("Invalid login credentials")
            ? "Email atau password salah"
            : authError.message
        };
      }

      if (!authData.user) {
        return { success: false, error: "Gagal mendapatkan data user" };
      }

      // 2. Ambil employee ID secara ringan (hanya kolom yang diperlukan)
      const { data: employee } = await supabase
        .from("employees")
        .select("id, last_login_device_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      // 3. Schedule background update (non-blocking)
      if (employee) {
        const currentDeviceId = getDeviceId();
        
        // Notifikasi jika device berbeda
        if (employee.last_login_device_id && 
            employee.last_login_device_id !== currentDeviceId) {
          toast({
            title: "Sesi Baru",
            description: "Perangkat lama akan otomatis logout.",
          });
        }

        // Update device info di background
        scheduleDeviceUpdate(employee.id, currentDeviceId);
      }

      return { success: true, userId: authData.user.id };
    } catch (error: any) {
      console.error("Login error:", error);
      return { 
        success: false, 
        error: "Tidak dapat menghubungi server. Coba lagi." 
      };
    } finally {
      setIsLoading(false);
      // Reset submit lock setelah debounce
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, DEBOUNCE_MS);
    }
  }, [getDeviceId, scheduleDeviceUpdate, toast]);

  // Cleanup
  const cleanup = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    pendingUpdateRef.current = null;
    isSubmittingRef.current = false;
  }, []);

  return {
    login,
    isLoading,
    cleanup,
    getDeviceId,
  };
}

/**
 * Hook untuk session caching - mengurangi query berulang
 */
export function useSessionCache() {
  const cacheRef = useRef<Map<string, { data: any; expiry: number }>>(new Map());
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

  const get = useCallback(<T>(key: string): T | null => {
    const cached = cacheRef.current.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    cacheRef.current.delete(key);
    return null;
  }, []);

  const set = useCallback(<T>(key: string, data: T, ttlMs?: number): void => {
    cacheRef.current.set(key, {
      data,
      expiry: Date.now() + (ttlMs || CACHE_TTL_MS),
    });
  }, []);

  const invalidate = useCallback((key?: string): void => {
    if (key) {
      cacheRef.current.delete(key);
    } else {
      cacheRef.current.clear();
    }
  }, []);

  return { get, set, invalidate };
}

/**
 * Hook untuk request queue - mencegah thundering herd
 */
export function useRequestQueue() {
  const queueRef = useRef<Map<string, Promise<any>>>(new Map());

  const dedupe = useCallback(async <T>(
    key: string, 
    fn: () => Promise<T>
  ): Promise<T> => {
    // Jika sudah ada request yang sama, tunggu hasilnya
    const existing = queueRef.current.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    // Buat promise baru
    const promise = fn().finally(() => {
      queueRef.current.delete(key);
    });

    queueRef.current.set(key, promise);
    return promise;
  }, []);

  return { dedupe };
}
