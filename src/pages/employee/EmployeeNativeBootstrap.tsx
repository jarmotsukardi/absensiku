import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAndroidBridge,
  isRememberSessionEnabled,
  serializeSessionForAndroid,
} from "@/lib/androidBridge";
import {
  resolveNativeBootstrapPayload,
  shouldNavigateWebLoginOnBootstrapFailure,
} from "@/lib/nativeBootstrap";

const FAIL_MESSAGE = "Sesi native tidak tersedia atau tidak valid.";
const PERSIST_WAIT_RETRY_COUNT = 8;
const PERSIST_WAIT_INTERVAL_MS = 250;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export default function EmployeeNativeBootstrap() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Memverifikasi sesi native…");

  useEffect(() => {
    let isMounted = true;
    console.info("[native-bootstrap] mounted");

    const fail = (message: string) => {
      if (!isMounted) return;
      console.warn("[native-bootstrap] fail", message);
      const bridge = getAndroidBridge();
      bridge?.notifySessionBootstrapFailed?.(message);
      if (shouldNavigateWebLoginOnBootstrapFailure(Boolean(bridge))) {
        navigate("/employee/login?native=1", { replace: true });
      }
    };

    const bootstrap = async () => {
      const bridge = getAndroidBridge();
      const payload = await resolveNativeBootstrapPayload();
      if (!payload) {
        if (!bridge?.consumeBootstrapSession) {
          fail("Bridge native login tidak tersedia.");
          return;
        }
        fail(FAIL_MESSAGE);
        return;
      }

      try {
        setStatus("Menyusun sesi aplikasi…");
        console.info("[native-bootstrap] setSession:start", {
          userId: payload.user?.id ?? null,
          rememberSession: payload.rememberSession,
        });
        const { data, error } = await supabase.auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        });

        if (error || !data.session) {
          fail("Bootstrap sesi native gagal. Silakan login ulang.");
          return;
        }
        console.info("[native-bootstrap] setSession:success", {
          userId: data.session.user.id,
          expiresAt: data.session.expires_at ?? null,
        });

        if (payload.rememberSession || isRememberSessionEnabled()) {
          bridge.syncWebSession?.(serializeSessionForAndroid(data.session, true));
        } else {
          bridge.clearRememberedSession?.();
        }

        setStatus("Menyimpan sesi ke perangkat…");
        for (let attempt = 0; attempt < PERSIST_WAIT_RETRY_COUNT; attempt += 1) {
          const {
            data: { session: persistedSession },
          } = await supabase.auth.getSession();

          console.info("[native-bootstrap] persist-check", {
            attempt,
            hasSession: Boolean(persistedSession?.access_token),
          });

          if (persistedSession?.access_token) {
            break;
          }

          await sleep(PERSIST_WAIT_INTERVAL_MS);
        }

        bridge.notifySessionBootstrapComplete?.();
        console.info("[native-bootstrap] navigate:dashboard");
        navigate("/employee/dashboard?bootstrap=1", { replace: true });
      } catch {
        fail("Terjadi kesalahan saat menyalakan sesi native.");
      }
    };

    void bootstrap();

    return () => {
      console.info("[native-bootstrap] unmounted");
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
