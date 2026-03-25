import { describe, expect, it, vi } from "vitest";
import {
  extractBootstrapCookiePayload,
  shouldNavigateWebLoginOnBootstrapFailure,
  waitForNativeBootstrapEvent,
} from "@/lib/nativeBootstrap";

describe("nativeBootstrap", () => {
  it("extracts bootstrap payload from cookie string", () => {
    const raw = JSON.stringify({ access_token: "a", refresh_token: "r", remember_session: true });
    const encoded = encodeURIComponent(btoa(raw));
    const cookie = `foo=bar; absensiku_native_session=${encoded}; theme=dark`;

    expect(extractBootstrapCookiePayload(cookie)).toBe(raw);
  });

  it("returns null for malformed cookie payload", () => {
    expect(extractBootstrapCookiePayload("absensiku_native_session=%zz")).toBeNull();
  });

  it("navigates web login only when android bridge is unavailable", () => {
    expect(shouldNavigateWebLoginOnBootstrapFailure(true)).toBe(false);
    expect(shouldNavigateWebLoginOnBootstrapFailure(false)).toBe(true);
  });

  it("waits for native bootstrap event payload", async () => {
    vi.useFakeTimers();
    const mockWindow = Object.assign(new EventTarget(), {
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("window", mockWindow);

    const promise = waitForNativeBootstrapEvent(1000);
    const event = new Event("native-session-available");
    Object.assign(event, {
      detail: {
        access_token: "token-a",
        refresh_token: "token-b",
        remember_session: true,
        user: { id: "user-1" },
      },
    });
    mockWindow.dispatchEvent(event);

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toMatchObject({
      accessToken: "token-a",
      refreshToken: "token-b",
      rememberSession: true,
      user: { id: "user-1" },
    });

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
