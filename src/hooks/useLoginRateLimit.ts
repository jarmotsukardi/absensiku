import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RateLimitConfig {
  enabled: boolean;
  max_attempts: number;
  lockout_duration_minutes: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  enabled: true,
  max_attempts: 3,
  lockout_duration_minutes: 15,
};

interface RateLimitState {
  attempts: number;
  lockoutUntil: number | null;
}

export function useLoginRateLimit(storageKey: string = "login_rate_limit") {
  const [config, setConfig] = useState<RateLimitConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const isEnabled = configLoaded && config.enabled;
  const maxAttempts = Math.max(1, config.max_attempts || DEFAULT_CONFIG.max_attempts);
  const lockoutDurationMs = Math.max(
    1,
    config.lockout_duration_minutes || DEFAULT_CONFIG.lockout_duration_minutes
  ) * 60 * 1000;

  // Load state dari localStorage
  const loadState = useCallback((): RateLimitState => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("Error loading rate limit state:", e);
    }
    return { attempts: 0, lockoutUntil: null };
  }, [storageKey]);

  // Save state ke localStorage
  const saveState = useCallback((state: RateLimitState) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.error("Error saving rate limit state:", e);
    }
  }, [storageKey]);

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "login_rate_limit_config")
        .maybeSingle();

      if (error) throw error;

      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const value = data.value as Partial<RateLimitConfig>;
        setConfig({
          enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_CONFIG.enabled,
          max_attempts: Number(value.max_attempts) || DEFAULT_CONFIG.max_attempts,
          lockout_duration_minutes:
            Number(value.lockout_duration_minutes) || DEFAULT_CONFIG.lockout_duration_minutes,
        });
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch (e) {
      console.error("Error fetching login rate limit config:", e);
      // Fail-safe: tetap aktifkan proteksi default jika config gagal dimuat.
      setConfig(DEFAULT_CONFIG);
    } finally {
      setConfigLoaded(true);
    }
  }, []);

  // Check dan update lockout status
  const checkLockout = useCallback(() => {
    if (!isEnabled) {
      const resetState = { attempts: 0, lockoutUntil: null };
      saveState(resetState);
      setAttempts(0);
      setIsLocked(false);
      setLockoutRemaining(0);
      return false;
    }

    const state = loadState();
    const now = Date.now();

    if (state.lockoutUntil && state.lockoutUntil > now) {
      setIsLocked(true);
      setLockoutRemaining(Math.ceil((state.lockoutUntil - now) / 1000));
      setAttempts(state.attempts);
      return true;
    } else if (state.lockoutUntil && state.lockoutUntil <= now) {
      // Lockout selesai, reset state
      const newState = { attempts: 0, lockoutUntil: null };
      saveState(newState);
      setIsLocked(false);
      setLockoutRemaining(0);
      setAttempts(0);
      return false;
    }
    
    setAttempts(state.attempts);
    setIsLocked(false);
    setLockoutRemaining(0);
    return false;
  }, [isEnabled, loadState, saveState]);

  // Record failed login
  const recordFailedAttempt = useCallback(() => {
    if (!isEnabled) {
      return false;
    }

    const state = loadState();
    const newAttempts = state.attempts + 1;
    
    if (newAttempts >= maxAttempts) {
      // Lock the user
      const newState: RateLimitState = {
        attempts: newAttempts,
        lockoutUntil: Date.now() + lockoutDurationMs,
      };
      saveState(newState);
      setIsLocked(true);
      setLockoutRemaining(lockoutDurationMs / 1000);
      setAttempts(newAttempts);
      return true; // User is now locked
    } else {
      const newState: RateLimitState = {
        attempts: newAttempts,
        lockoutUntil: null,
      };
      saveState(newState);
      setAttempts(newAttempts);
      return false;
    }
  }, [isEnabled, loadState, lockoutDurationMs, maxAttempts, saveState]);

  // Reset attempts after successful login
  const resetAttempts = useCallback(() => {
    const newState: RateLimitState = { attempts: 0, lockoutUntil: null };
    saveState(newState);
    setAttempts(0);
    setIsLocked(false);
    setLockoutRemaining(0);
  }, [saveState]);

  // Format remaining time
  const formatRemainingTime = useCallback(() => {
    const minutes = Math.floor(lockoutRemaining / 60);
    const seconds = lockoutRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [lockoutRemaining]);

  // Initial check dan interval untuk update countdown
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (!configLoaded) return;
    checkLockout();

    const interval = setInterval(() => {
      if (!isEnabled) return;
      const state = loadState();
      if (state.lockoutUntil) {
        const now = Date.now();
        if (state.lockoutUntil > now) {
          setLockoutRemaining(Math.ceil((state.lockoutUntil - now) / 1000));
        } else {
          // Lockout selesai
          resetAttempts();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [checkLockout, configLoaded, isEnabled, loadState, resetAttempts]);

  return {
    isEnabled,
    configLoaded,
    isLocked,
    lockoutRemaining,
    attempts,
    remainingAttempts: Math.max(0, maxAttempts - attempts),
    maxAttempts,
    lockoutDurationMinutes: Math.max(
      1,
      config.lockout_duration_minutes || DEFAULT_CONFIG.lockout_duration_minutes
    ),
    recordFailedAttempt,
    resetAttempts,
    formatRemainingTime,
    checkLockout,
  };
}
