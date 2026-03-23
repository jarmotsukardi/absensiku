import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { getAndroidId } from "@/lib/deviceId";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

// Konstanta untuk session management
const SESSION_KEY = "absensiku_session_metadata";
const SESSION_MAX_AGE_DAYS = 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000; // 7 hari dalam ms
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // Refresh jika kurang dari 1 hari
const SESSION_CHECK_TIMEOUT_MS = 8000;
const SESSION_CHECK_RETRY_MAX = 0;

interface SessionMetadata {
  lastActivity: number;
  deviceId: string;
  createdAt: number;
}

interface SessionState {
  isChecking: boolean;
  isValid: boolean;
  user: User | null;
  session: Session | null;
  needsLogin: boolean;
}

/**
 * Hook untuk manajemen sesi dengan sliding expiration
 * - Durasi sesi: 7 hari
 * - Auto-refresh saat aktivitas user
 * - Persistent storage
 */
export function useSessionManagement() {
  const [state, setState] = useState<SessionState>({
    isChecking: true,
    isValid: false,
    user: null,
    session: null,
    needsLogin: false,
  });

  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // Dapatkan device ID menggunakan utility tunggal
  const getDeviceId = useCallback((): string => {
    return getAndroidId(true);
  }, []);

  const getSessionMetadata = useCallback((): SessionMetadata | null => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    try {
      const parsed = JSON.parse(stored) as Partial<SessionMetadata>;
      if (
        typeof parsed.lastActivity !== "number" ||
        typeof parsed.createdAt !== "number" ||
        typeof parsed.deviceId !== "string" ||
        parsed.deviceId.trim().length === 0
      ) {
        return null;
      }

      return {
        lastActivity: parsed.lastActivity,
        createdAt: parsed.createdAt,
        deviceId: parsed.deviceId,
      };
    } catch {
      return null;
    }
  }, []);

  // Simpan metadata sesi
  const saveSessionMetadata = useCallback((deviceId: string) => {
    const metadata: SessionMetadata = {
      lastActivity: Date.now(),
      deviceId,
      createdAt: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(metadata));
  }, []);

  // Update aktivitas terakhir (sliding expiration)
  const updateLastActivity = useCallback(() => {
    const metadata = getSessionMetadata();
    if (metadata) {
      metadata.lastActivity = Date.now();
      localStorage.setItem(SESSION_KEY, JSON.stringify(metadata));
    }
  }, [getSessionMetadata]);

  // Cek validitas sesi berdasarkan waktu
  const isSessionExpired = useCallback((metadata: SessionMetadata | null): boolean => {
    if (!metadata) return false;
    const elapsed = Date.now() - metadata.lastActivity;
    return elapsed > SESSION_MAX_AGE_MS;
  }, []);

  // Cek apakah perlu refresh session (kurang dari 1 hari)
  const shouldRefreshSession = useCallback((metadata: SessionMetadata | null): boolean => {
    if (!metadata) return false;
    const elapsed = Date.now() - metadata.lastActivity;
    return elapsed > (SESSION_MAX_AGE_MS - SESSION_REFRESH_THRESHOLD_MS);
  }, []);

  // Hapus sesi (logout)
  const clearSession = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    await withExponentialBackoff(
      () => withTimeout(() => supabase.auth.signOut(), SESSION_CHECK_TIMEOUT_MS),
      {
        maxRetries: SESSION_CHECK_RETRY_MAX,
        shouldRetry: isRetryableError,
      },
    );
    setState({
      isChecking: false,
      isValid: false,
      user: null,
      session: null,
      needsLogin: true,
    });
  }, []);

  // Tandai sesi tidak valid tanpa signOut (untuk kasus belum login)
  const markSessionInvalid = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setState({
      isChecking: false,
      isValid: false,
      user: null,
      session: null,
      needsLogin: true,
    });
  }, []);

  // Inisialisasi dan cek sesi
  const checkSession = useCallback(async () => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    try {
      const storedMetadata = getSessionMetadata();

      // Cek session Supabase terlebih dahulu. Session hasil handoff native bisa valid
      // walaupun metadata lokal web belum sempat dibuat.
      const { data: { session }, error } = await withExponentialBackoff(
        () => withTimeout(() => supabase.auth.getSession(), SESSION_CHECK_TIMEOUT_MS),
        {
          maxRetries: SESSION_CHECK_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );

      if (error || !session) {
        // Tidak ada session, tandai invalid tanpa signOut
        markSessionInvalid();
        return;
      }

      if (isSessionExpired(storedMetadata)) {
        // Metadata ada tetapi sudah melewati sliding window lokal.
        markSessionInvalid();
        return;
      }

      // Session valid - update metadata
      const deviceId = getDeviceId();
      if (storedMetadata) {
        updateLastActivity();
      } else {
        saveSessionMetadata(deviceId)
      }

      // Refresh token jika hampir expired
      if (shouldRefreshSession(storedMetadata)) {
        const { data: refreshData } = await withExponentialBackoff(
          () => withTimeout(() => supabase.auth.refreshSession(), SESSION_CHECK_TIMEOUT_MS),
          {
            maxRetries: SESSION_CHECK_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );
        if (refreshData.session) {
          saveSessionMetadata(deviceId);
        }
      }

      setState({
        isChecking: false,
        isValid: true,
        user: session.user,
        session: session,
        needsLogin: false,
      });
    } catch (error) {
      console.error("Session check error:", error);
      setState((prev) => ({
        ...prev,
        isChecking: false,
        needsLogin: true,
      }));
    }
  }, [
    getDeviceId,
    getSessionMetadata,
    isSessionExpired,
    markSessionInvalid,
    saveSessionMetadata,
    shouldRefreshSession,
    updateLastActivity,
  ]);

  // Handler untuk login sukses
  const onLoginSuccess = useCallback((session: Session) => {
    const deviceId = getDeviceId();
    saveSessionMetadata(deviceId);
    setState({
      isChecking: false,
      isValid: true,
      user: session.user,
      session: session,
      needsLogin: false,
    });
  }, [getDeviceId, saveSessionMetadata]);

  // Listener untuk aktivitas user - update last activity
  useEffect(() => {
    const handleActivity = () => {
      if (state.isValid) {
        // Debounce activity updates
        if (activityTimeoutRef.current) {
          clearTimeout(activityTimeoutRef.current);
        }
        activityTimeoutRef.current = setTimeout(() => {
          updateLastActivity();
        }, 5000); // Update max setiap 5 detik
      }
    };

    // Listen to user activity
    window.addEventListener("click", handleActivity);
    window.addEventListener("keypress", handleActivity);
    window.addEventListener("scroll", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keypress", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
    };
  }, [state.isValid, updateLastActivity]);

  // Listen untuk auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        localStorage.removeItem(SESSION_KEY);
        setState({
          isChecking: false,
          isValid: false,
          user: null,
          session: null,
          needsLogin: true,
        });
      } else if (event === "SIGNED_IN" && session) {
        onLoginSuccess(session);
      } else if (event === "TOKEN_REFRESHED" && session) {
        updateLastActivity();
        setState((prev) => ({
          ...prev,
          session: session,
          user: session.user,
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, [onLoginSuccess, updateLastActivity]);

  // Start session check on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return {
    ...state,
    checkSession,
    clearSession,
    onLoginSuccess,
    updateLastActivity,
    getDeviceId,
    sessionMaxAgeDays: SESSION_MAX_AGE_DAYS,
  };
}
