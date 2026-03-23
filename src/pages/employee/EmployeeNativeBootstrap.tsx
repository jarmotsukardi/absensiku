import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAndroidBridge,
  isRememberSessionEnabled,
  parseBridgeSessionPayload,
  serializeSessionForAndroid,
} from "@/lib/androidBridge";

const FAIL_MESSAGE = "Sesi native tidak tersedia atau tidak valid.";

export default function EmployeeNativeBootstrap() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Memverifikasi sesi native…");

  useEffect(() => {
    let isMounted = true;

    const fail = (message: string) => {
      if (!isMounted) return;
      const bridge = getAndroidBridge();
      bridge?.notifySessionBootstrapFailed?.(message);
      navigate("/employee/login", { replace: true });
    };

    const bootstrap = async () => {
      const bridge = getAndroidBridge();
      if (!bridge?.consumeBootstrapSession) {
        fail("Bridge native login tidak tersedia.");
        return;
      }

      const rawPayload = bridge.consumeBootstrapSession();
      const payload = parseBridgeSessionPayload(rawPayload);
      if (!payload) {
        fail(FAIL_MESSAGE);
        return;
      }

      try {
        setStatus("Menyusun sesi aplikasi…");
        const { data, error } = await supabase.auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        });

        if (error || !data.session) {
          fail("Bootstrap sesi native gagal. Silakan login ulang.");
          return;
        }

        if (payload.rememberSession || isRememberSessionEnabled()) {
          bridge.syncWebSession?.(serializeSessionForAndroid(data.session, true));
        } else {
          bridge.clearRememberedSession?.();
        }

        bridge.notifySessionBootstrapComplete?.();
        navigate("/employee/dashboard", { replace: true });
      } catch {
        fail("Terjadi kesalahan saat menyalakan sesi native.");
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
          <MapPin className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold">AbsensiKu Secure</h1>
        <p className="mt-2 text-sm text-white/70">{status}</p>
        <div className="mt-6 flex items-center justify-center gap-3 text-sm text-white/80">
          <Loader2 className="h-4 w-4 animate-spin" />
          Menyiapkan dashboard pegawai
        </div>
      </div>
    </main>
  );
}
