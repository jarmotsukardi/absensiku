import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Hook untuk menangani tombol back pada Android (Capacitor/WebView)
 * Akan navigate ke halaman sebelumnya alih-alih menutup aplikasi
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBackButton = useCallback(() => {
    // Check if we're on the main pages
    const mainPages = ["/", "/employee/dashboard", "/org", "/admin"];
    if (mainPages.includes(location.pathname)) {
      // On main page, don't navigate
      return false;
    }
    return true;
  }, [location.pathname]);

  useEffect(() => {
    // Only setup Capacitor back button handler in native environment
    // Check if we're running in a Capacitor app
    const capacitor = (window as unknown as { Capacitor?: any })?.Capacitor;
    const isCapacitorNative = typeof window !== "undefined" && !!capacitor?.isNativePlatform?.();

    if (!isCapacitorNative) {
      // Not in Capacitor native environment, skip setup
      return;
    }

    let cleanup: (() => void) | undefined;

    // For Capacitor apps - listen to backButton event
    const setupCapacitorBackButton = async () => {
      try {
        // Hindari import '@capacitor/app' agar tidak memicu Vite resolve error di web.
        // Di runtime native, Capacitor menyediakan plugin via global window.Capacitor.Plugins.
        const App = capacitor?.Plugins?.App as
          | {
              addListener: (
                eventName: "backButton",
                listenerFunc: (state: { canGoBack: boolean }) => void
              ) => Promise<{ remove: () => void }>;
              exitApp: () => void;
            }
          | undefined;

        if (!App?.addListener) return;
        
        // Add listener untuk hardware back button
        const backButtonListener = await App.addListener("backButton", ({ canGoBack }: { canGoBack: boolean }) => {
          if (canGoBack) {
            // Ada history, navigate back
            window.history.back();
          } else {
            // Tidak ada history
            // Check if we're on the main pages
            const mainPages = ["/", "/employee/dashboard", "/org", "/admin"];
            if (mainPages.includes(location.pathname)) {
              // Ask user if they want to exit
              if (confirm("Apakah Anda yakin ingin keluar dari aplikasi?")) {
                App.exitApp();
              }
            } else {
              // Navigate to appropriate home based on path
              if (location.pathname.startsWith("/employee")) {
                navigate("/employee/dashboard");
              } else if (location.pathname.startsWith("/org")) {
                navigate("/org");
              } else if (location.pathname.startsWith("/admin")) {
                navigate("/admin");
              } else {
                navigate("/");
              }
            }
          }
        });

        // Set cleanup function
        cleanup = () => {
          backButtonListener.remove();
        };
      } catch (error) {
        // Capacitor not available (running in browser), ignore silently
      }
    };

    setupCapacitorBackButton();

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [navigate, location.pathname, handleBackButton]);
}

/**
 * Component wrapper untuk menggunakan hook di App level
 */
export function AndroidBackButtonHandler() {
  useAndroidBackButton();
  return null;
}
