import {
  getAndroidBridge,
  parseBridgeSessionPayload,
  type AndroidBridgeSessionPayload,
} from "@/lib/androidBridge";

const BOOTSTRAP_COOKIE_NAME = "absensiku_native_session";
const DEFAULT_BOOTSTRAP_EVENT_TIMEOUT_MS = 1500;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const extractBootstrapCookiePayload = (cookieString: string): string | null => {
  const cookies = cookieString.split(";").map((value) => value.trim());
  const target = cookies.find((entry) => entry.startsWith(`${BOOTSTRAP_COOKIE_NAME}=`));
  if (!target) return null;

  const rawValue = target.substring(BOOTSTRAP_COOKIE_NAME.length + 1);
  if (!rawValue) return null;

  try {
    const decoded = decodeURIComponent(rawValue);
    return atob(decoded);
  } catch {
    return null;
  }
};

export const readBootstrapCookie = (): string | null => {
  if (typeof document === "undefined") return null;
  return extractBootstrapCookiePayload(document.cookie);
};

export const clearBootstrapCookie = () => {
  if (typeof document === "undefined") return;
  document.cookie = `${BOOTSTRAP_COOKIE_NAME}=; path=/; max-age=0`;
};

export const shouldNavigateWebLoginOnBootstrapFailure = (hasBridge: boolean): boolean => {
  return !hasBridge;
};

export const waitForNativeBootstrapEvent = async (
  timeoutMs: number = DEFAULT_BOOTSTRAP_EVENT_TIMEOUT_MS,
): Promise<AndroidBridgeSessionPayload | null> => {
  if (typeof window === "undefined") return null;

  return new Promise<AndroidBridgeSessionPayload | null>((resolve) => {
    let settled = false;

    const finish = (payload: AndroidBridgeSessionPayload | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("native-session-available", handleEvent as EventListener);
      resolve(payload);
    };

    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      const detail =
        customEvent.detail && typeof customEvent.detail === "object"
          ? JSON.stringify(customEvent.detail)
          : null;
      finish(parseBridgeSessionPayload(detail));
    };

    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("native-session-available", handleEvent as EventListener, {
      once: true,
    });
  });
};

export const resolveNativeBootstrapPayload = async (): Promise<AndroidBridgeSessionPayload | null> => {
  const bridge = getAndroidBridge();
  const cookiePayload = readBootstrapCookie();
  const directPayload = parseBridgeSessionPayload(cookiePayload ?? bridge?.consumeBootstrapSession?.() ?? null);

  if (cookiePayload) {
    clearBootstrapCookie();
  }

  if (directPayload) {
    return directPayload;
  }

  if (!bridge) {
    return null;
  }

  // Give the injected `native-session-available` event one brief chance before failing.
  const eventPayload = await waitForNativeBootstrapEvent();
  if (eventPayload) {
    return eventPayload;
  }

  return null;
};
