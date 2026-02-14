/**
 * useOnlineStatus.ts
 * 
 * Hook untuk memantau status koneksi internet.
 * Mendeteksi online/offline dan trigger callback saat koneksi kembali.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface OnlineStatusInfo {
  isOnline: boolean;
  wasOffline: boolean; // true jika baru saja kembali online
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
}

export function useOnlineStatus(onReconnect?: () => void) {
  const [status, setStatus] = useState<OnlineStatusInfo>({
    isOnline: navigator.onLine,
    wasOffline: false,
    lastOnlineAt: navigator.onLine ? new Date().toISOString() : null,
    lastOfflineAt: !navigator.onLine ? new Date().toISOString() : null,
  });

  const wasOfflineRef = useRef(false);
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const handleOnline = useCallback(() => {
    const now = new Date().toISOString();
    const justReconnected = wasOfflineRef.current;
    wasOfflineRef.current = false;
    
    setStatus(prev => ({
      isOnline: true,
      wasOffline: justReconnected,
      lastOnlineAt: now,
      lastOfflineAt: prev.lastOfflineAt,
    }));

    if (justReconnected) {
      console.log('[OnlineStatus] Reconnected - triggering sync');
      onReconnectRef.current?.();
      
      // Reset wasOffline after 5s
      setTimeout(() => {
        setStatus(prev => ({ ...prev, wasOffline: false }));
      }, 5000);
    }
  }, []);

  const handleOffline = useCallback(() => {
    wasOfflineRef.current = true;
    setStatus(prev => ({
      isOnline: false,
      wasOffline: false,
      lastOnlineAt: prev.lastOnlineAt,
      lastOfflineAt: new Date().toISOString(),
    }));
    console.log('[OnlineStatus] Went offline');
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return status;
}
