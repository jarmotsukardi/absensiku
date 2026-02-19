import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  tenant: number;      // 6-24 jam -> 6 jam default
  opd: number;         // 6-24 jam -> 6 jam default
  workUnits: number;   // 1-6 jam -> 2 jam default
  offices: number;     // 1-6 jam -> 2 jam default
  workHours: number;   // 1-6 jam -> 2 jam default
  holidays: number;    // 24 jam
  absenceLimits: number; // 6 jam
  userMapping: number; // 5-15 menit -> 10 menit default
}

const DEFAULT_TTL: CacheConfig = {
  tenant: 6 * 60 * 60 * 1000,      // 6 jam
  opd: 6 * 60 * 60 * 1000,         // 6 jam
  workUnits: 2 * 60 * 60 * 1000,   // 2 jam
  offices: 2 * 60 * 60 * 1000,     // 2 jam
  workHours: 2 * 60 * 60 * 1000,   // 2 jam
  holidays: 24 * 60 * 60 * 1000,   // 24 jam
  absenceLimits: 6 * 60 * 60 * 1000, // 6 jam
  userMapping: 10 * 60 * 1000,     // 10 menit
};

// In-memory cache storage
const cache = new Map<string, CacheEntry<unknown>>();

export function useConfigCache() {
  const [isLoading, setIsLoading] = useState(false);

  const getCacheKey = useCallback((type: string, tenantId: string) => `${type}:${tenantId}`, []);

  const isExpired = useCallback((entry: CacheEntry<unknown>) => {
    return Date.now() - entry.timestamp > entry.ttl;
  }, []);

  const getFromCache = useCallback(<T,>(key: string): T | null => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  }, [isExpired]);

  const setToCache = useCallback(<T,>(key: string, data: T, ttl: number) => {
    cache.set(key, { data, timestamp: Date.now(), ttl });
  }, []);

  const invalidateCache = useCallback((pattern?: string) => {
    if (!pattern) {
      cache.clear();
      return;
    }
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  }, []);

  // Cached data fetchers
  const getTenant = useCallback(async (tenantId: string) => {
    const key = getCacheKey("tenant", tenantId);
    const cached = getFromCache(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (error) throw error;
    setToCache(key, data, DEFAULT_TTL.tenant);
    return data;
  }, [getCacheKey, getFromCache, setToCache]);

  const getOpdList = useCallback(async (tenantId: string) => {
    const key = getCacheKey("opd", tenantId);
    const cached = getFromCache(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("opd")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    setToCache(key, data || [], DEFAULT_TTL.opd);
    return data || [];
  }, [getCacheKey, getFromCache, setToCache]);

  const getWorkUnits = useCallback(async (tenantId: string) => {
    const key = getCacheKey("workUnits", tenantId);
    const cached = getFromCache(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("work_units")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    setToCache(key, data || [], DEFAULT_TTL.workUnits);
    return data || [];
  }, [getCacheKey, getFromCache, setToCache]);

  const getOffices = useCallback(async (tenantId: string) => {
    const key = getCacheKey("offices", tenantId);
    const cached = getFromCache(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("offices")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    setToCache(key, data || [], DEFAULT_TTL.offices);
    return data || [];
  }, [getCacheKey, getFromCache, setToCache]);

  const getWorkHours = useCallback(async (tenantId: string) => {
    const key = getCacheKey("workHours", tenantId);
    const cached = getFromCache(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("work_hours")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("day_of_week");

    if (error) throw error;
    setToCache(key, data || [], DEFAULT_TTL.workHours);
    return data || [];
  }, [getCacheKey, getFromCache, setToCache]);

  const getHolidays = useCallback(async (tenantId: string, year?: number) => {
    const currentYear = year || new Date().getFullYear();
    const key = getCacheKey(`holidays:${currentYear}`, tenantId);
    const cached = getFromCache(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("work_holidays")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("year", currentYear);

    if (error) throw error;
    setToCache(key, data || [], DEFAULT_TTL.holidays);
    return data || [];
  }, [getCacheKey, getFromCache, setToCache]);

  const getAbsenceLimits = useCallback(async (tenantId: string) => {
    const key = getCacheKey("absenceLimits", tenantId);
    const cached = getFromCache(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("absence_limits")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (error) throw error;
    setToCache(key, data || [], DEFAULT_TTL.absenceLimits);
    return data || [];
  }, [getCacheKey, getFromCache, setToCache]);

  const getUserTenantId = useCallback(async (userId: string) => {
    const key = getCacheKey("userMapping", userId);
    const cached = getFromCache<string>(key);
    if (cached) return cached;

    const { data, error } = await supabase
      .from("employees")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data?.tenant_id) {
      setToCache(key, data.tenant_id, DEFAULT_TTL.userMapping);
    }
    return data?.tenant_id || null;
  }, [getCacheKey, getFromCache, setToCache]);

  // Prefetch all config untuk pegawai (digunakan saat login)
  const prefetchEmployeeConfig = useCallback(async (tenantId: string) => {
    setIsLoading(true);
    try {
      await Promise.all([
        getTenant(tenantId),
        getOffices(tenantId),
        getWorkHours(tenantId),
        getHolidays(tenantId),
        getAbsenceLimits(tenantId),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [getTenant, getOffices, getWorkHours, getHolidays, getAbsenceLimits]);

  // Prefetch semua config untuk admin
  const prefetchAdminConfig = useCallback(async (tenantId: string) => {
    setIsLoading(true);
    try {
      await Promise.all([
        getTenant(tenantId),
        getOpdList(tenantId),
        getWorkUnits(tenantId),
        getOffices(tenantId),
        getWorkHours(tenantId),
        getHolidays(tenantId),
        getAbsenceLimits(tenantId),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [getTenant, getOpdList, getWorkUnits, getOffices, getWorkHours, getHolidays, getAbsenceLimits]);

  return {
    isLoading,
    // Cached getters
    getTenant,
    getOpdList,
    getWorkUnits,
    getOffices,
    getWorkHours,
    getHolidays,
    getAbsenceLimits,
    getUserTenantId,
    // Prefetch functions
    prefetchEmployeeConfig,
    prefetchAdminConfig,
    // Cache management
    invalidateCache,
    // Stats
    getCacheStats: () => ({
      size: cache.size,
      keys: Array.from(cache.keys()),
    }),
  };
}

// Rate limiter untuk mencegah flooding
export function useRateLimiter() {
  const requestCounts = useRef<Map<string, { count: number; resetAt: number }>>(new Map());

  const checkRateLimit = useCallback((
    key: string, 
    maxRequests: number = 10, 
    windowMs: number = 60000
  ): boolean => {
    const now = Date.now();
    const entry = requestCounts.current.get(key);

    if (!entry || now > entry.resetAt) {
      requestCounts.current.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }, []);

  const resetRateLimit = useCallback((key: string) => {
    requestCounts.current.delete(key);
  }, []);

  return { checkRateLimit, resetRateLimit };
}

// Idempotency key generator
export function generateIdempotencyKey(
  userId: string, 
  action: string, 
  date: string
): string {
  return `${userId}:${action}:${date}`;
}
