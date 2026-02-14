import { useState, useEffect, useCallback } from "react";

const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 menit
const MAX_ATTEMPTS = 3;

interface RateLimitState {
  attempts: number;
  lockoutUntil: number | null;
}

export function useLoginRateLimit(storageKey: string = "login_rate_limit") {
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [attempts, setAttempts] = useState(0);

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

  // Check dan update lockout status
  const checkLockout = useCallback(() => {
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
  }, [loadState, saveState]);

  // Record failed login
  const recordFailedAttempt = useCallback(() => {
    const state = loadState();
    const newAttempts = state.attempts + 1;
    
    if (newAttempts >= MAX_ATTEMPTS) {
      // Lock the user
      const newState: RateLimitState = {
        attempts: newAttempts,
        lockoutUntil: Date.now() + LOCKOUT_DURATION_MS,
      };
      saveState(newState);
      setIsLocked(true);
      setLockoutRemaining(LOCKOUT_DURATION_MS / 1000);
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
  }, [loadState, saveState]);

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
    checkLockout();

    const interval = setInterval(() => {
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
  }, [checkLockout, loadState, resetAttempts]);

  return {
    isLocked,
    lockoutRemaining,
    attempts,
    remainingAttempts: MAX_ATTEMPTS - attempts,
    recordFailedAttempt,
    resetAttempts,
    formatRemainingTime,
    checkLockout,
  };
}
