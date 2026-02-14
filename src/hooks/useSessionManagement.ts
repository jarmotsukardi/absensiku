import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { getAndroidId } from "@/lib/deviceId";

// Konstanta untuk session management
const SESSION_KEY = "absensiku_session_metadata";
const SESSION_MAX_AGE_DAYS = 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000; // 7 hari dalam ms
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // Refresh jika kurang dari 1 hari

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
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const metadata: SessionMetadata = JSON.parse(stored);
        metadata.lastActivity = Date.now();
        localStorage.setItem(SESSION_KEY, JSON.stringify(metadata));
      } catch (e) {
        console.error("Error updating session metadata:", e);
      }
    }
  }, []);

  // Cek validitas sesi berdasarkan waktu
  const isSessionExpired = useCallback((): boolean => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return true;

    try {
      const metadata: SessionMetadata = JSON.parse(stored);
      const elapsed = Date.now() - metadata.lastActivity;
      return elapsed > SESSION_MAX_AGE_MS;
    } catch (e) {
      return true;
    }
  }, []);

  // Cek apakah perlu refresh session (kurang dari 1 hari)
  const shouldRefreshSession = useCallback((): boolean => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return false;

    try {
      const metadata: SessionMetadata = JSON.parse(stored);
      const elapsed = Date.now() - metadata.lastActivity;
      return elapsed > (SESSION_MAX_AGE_MS - SESSION_REFRESH_THRESHOLD_MS);
    } catch (e) {
      return false;
    }
  }, []);

  // Hapus sesi (logout)
  const clearSession = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    await supabase.auth.signOut();
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
      // Cek session metadata lokal terlebih dahulu
      if (isSessionExpired()) {
        // Sesi sudah expired, tandai invalid tanpa signOut
        markSessionInvalid();
        return;
      }

      // Cek session Supabase
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        // Tidak ada session, tandai invalid tanpa signOut
        markSessionInvalid();
        return;
      }

      // Session valid - update metadata
      const deviceId = getDeviceId();
      updateLastActivity();

      // Refresh token jika hampir expired
      if (shouldRefreshSession()) {
        const { data: refreshData } = await supabase.auth.refreshSession();
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
  }, [getDeviceId, isSessionExpired, markSessionInvalid, saveSessionMetadata, shouldRefreshSession, updateLastActivity]);

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
