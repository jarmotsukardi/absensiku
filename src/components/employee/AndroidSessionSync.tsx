import { useEffect, type PropsWithChildren } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  getAndroidBridge,
  isRememberSessionEnabled,
  serializeSessionForAndroid,
} from "@/lib/androidBridge";

export function AndroidSessionSync({ children }: PropsWithChildren) {
  const location = useLocation();

  useEffect(() => {
    const bridge = getAndroidBridge();
    if (!bridge) return;
    if (location.pathname === "/employee/native-bootstrap") {
      return;
    }

    const syncCurrentSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        bridge.clearRememberedSession?.();
        return;
      }

      if (!isRememberSessionEnabled()) {
        bridge.clearRememberedSession?.();
        return;
      }

      bridge.syncWebSession?.(serializeSessionForAndroid(session, true));
    };

    void syncCurrentSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        bridge.clearRememberedSession?.();
        bridge.showNativeLogin?.("Sesi telah berakhir. Silakan login kembali.");
        return;
      }

      if (
        session &&
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")
      ) {
        if (!isRememberSessionEnabled()) {
          bridge.clearRememberedSession?.();
          return;
        }

        bridge.syncWebSession?.(serializeSessionForAndroid(session, true));
      }
    });

    return () => subscription.unsubscribe();
  }, [location.pathname]);

  return <>{children}</>;
}
