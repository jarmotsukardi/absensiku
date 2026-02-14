import React from "react";
import { reportError } from "@/lib/errorLogger";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  logId?: string;
}

export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    logId: undefined,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const logId = reportError(error, "react.error_boundary", {
      component_stack: errorInfo.componentStack,
    });
    this.setState({ logId });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
            padding: "24px",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "560px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "20px",
            }}
          >
            <h1 style={{ margin: "0 0 8px 0", fontSize: "20px", color: "#0f172a" }}>
              Terjadi error aplikasi
            </h1>
            <p style={{ margin: "0 0 14px 0", color: "#475569", fontSize: "14px" }}>
              Muat ulang halaman. Jika masih terjadi, kirim ID log berikut ke admin/developer.
            </p>
            <code
              style={{
                display: "inline-block",
                background: "#0f172a",
                color: "#e2e8f0",
                padding: "8px 10px",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            >
              {this.state.logId || "LOG-NOT-AVAILABLE"}
            </code>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
