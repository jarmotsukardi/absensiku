import { debugLog } from "@/lib/debugLog";

/**
 * Utility tunggal untuk generate dan mengelola Device ID
 * SEMUA komponen harus menggunakan utility ini untuk konsistensi
 */

// Keys untuk localStorage
const WEB_DEVICE_ID_KEY = "web_device_id";
const ANDROID_DEVICE_ID_KEY = "android_device_id";

interface AndroidBridge {
  getAndroidId?: () => string;
}

/**
 * Generate fingerprint yang STABIL (tanpa canvas karena hasilnya bisa berbeda)
 */
const generateStableFingerprint = (): string => {
  return [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.hardwareConcurrency || 0,
    navigator.maxTouchPoints || 0,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");
};

/**
 * Generate fingerprint LEGACY (dengan canvas) untuk backward compatibility
 * Digunakan untuk mengecek apakah device ID lama cocok
 */
const generateLegacyFingerprint = (): string => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("device-fingerprint", 2, 2);
  }
  
  return [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ].join("|");
};

/**
 * Generate fingerprint SIMPLE (tanpa canvas, tanpa timezone offset)
 * Versi dari useOptimizedLogin
 */
const generateSimpleFingerprint = (): string => {
  return [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ].join("|");
};

/**
 * Hash fingerprint menjadi device ID
 */
const hashFingerprint = (fingerprint: string): string => {
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `WEB-${Math.abs(hash).toString(16).toUpperCase().padStart(16, "0")}`;
};

/**
 * Generate semua kemungkinan device ID (untuk backward compatibility)
 * Digunakan untuk mengecek apakah salah satu cocok dengan yang terdaftar di database
 */
export const generateAllPossibleDeviceIds = (): string[] => {
  const ids: string[] = [];
  
  // 1. Stable fingerprint (versi baru)
  ids.push(hashFingerprint(generateStableFingerprint()));
  
  // 2. Simple fingerprint (versi useOptimizedLogin)
  ids.push(hashFingerprint(generateSimpleFingerprint()));
  
  // 3. Legacy fingerprint dengan canvas (versi lama)
  try {
    ids.push(hashFingerprint(generateLegacyFingerprint()));
  } catch (e) {
    // Canvas might fail in some environments
  }
  
  // Remove duplicates
  return [...new Set(ids)];
};

/**
 * Cek apakah ada device ID tersimpan di localStorage
 */
export const hasStoredDeviceId = (): boolean => {
  return !!(localStorage.getItem(WEB_DEVICE_ID_KEY) || localStorage.getItem(ANDROID_DEVICE_ID_KEY));
};

/**
 * Get device ID dari localStorage (tanpa generate baru)
 */
export const getStoredDeviceId = (): string | null => {
  return localStorage.getItem(ANDROID_DEVICE_ID_KEY) || localStorage.getItem(WEB_DEVICE_ID_KEY);
};

/**
 * Generate web device ID yang stabil
 * @param saveToStorage - apakah langsung simpan ke localStorage
 */
export const generateStableWebDeviceId = (saveToStorage: boolean = true): string => {
  // Cek localStorage dulu
  const storedId = localStorage.getItem(WEB_DEVICE_ID_KEY);
  if (storedId) return storedId;

  const deviceId = hashFingerprint(generateStableFingerprint());
  
  if (saveToStorage) {
    localStorage.setItem(WEB_DEVICE_ID_KEY, deviceId);
    debugLog("[DeviceId] Generated and saved stable device ID:", deviceId);
  }
  
  return deviceId;
};

/**
 * Get Android ID dari native app atau fallback ke web device ID
 * @param saveToStorage - apakah langsung simpan ke localStorage
 */
export const getAndroidId = (saveToStorage: boolean = true): string => {
  // Cek apakah ada Android interface dari native app
  const androidBridge = (window as unknown as { Android?: AndroidBridge }).Android;
  if (typeof androidBridge !== "undefined" && androidBridge?.getAndroidId) {
    try {
      const nativeId = androidBridge.getAndroidId();
      if (nativeId && nativeId.length > 0) {
        if (saveToStorage) {
          localStorage.setItem(ANDROID_DEVICE_ID_KEY, nativeId);
        }
        return nativeId;
      }
    } catch (e) {
      console.warn("[DeviceId] Failed to get native Android ID:", e);
    }
  }

  // Cek stored native ID
  const storedNativeId = localStorage.getItem(ANDROID_DEVICE_ID_KEY);
  if (storedNativeId) return storedNativeId;

  // Fallback ke web device ID
  return generateStableWebDeviceId(saveToStorage);
};

/**
 * Sync device ID dari database ke localStorage
 * Digunakan saat user melakukan reset storage tapi device sama
 */
export const syncDeviceIdFromDatabase = (dbDeviceId: string): void => {
  if (!dbDeviceId) return;
  
  debugLog("[DeviceId] Syncing device ID from database:", dbDeviceId);
  
  if (dbDeviceId.startsWith("WEB-")) {
    localStorage.setItem(WEB_DEVICE_ID_KEY, dbDeviceId);
  } else {
    localStorage.setItem(ANDROID_DEVICE_ID_KEY, dbDeviceId);
  }
};

/**
 * Cek apakah device ID dari database cocok dengan salah satu kemungkinan ID saat ini
 * Berguna untuk backward compatibility dengan versi generator lama
 */
export const isDeviceIdMatch = (dbDeviceId: string | null): boolean => {
  if (!dbDeviceId) return false;
  
  // Cek dengan stored ID
  const storedId = getStoredDeviceId();
  if (storedId === dbDeviceId) return true;
  
  // Cek dengan semua kemungkinan ID yang bisa di-generate
  const possibleIds = generateAllPossibleDeviceIds();
  return possibleIds.includes(dbDeviceId);
};

/**
 * Get current device ID (untuk display)
 * Prioritas: stored > generated stable
 */
export const getCurrentDeviceId = (): string => {
  return getAndroidId(false);
};
