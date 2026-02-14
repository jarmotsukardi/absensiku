import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorLogging } from "@/lib/errorLogger";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";

installGlobalErrorLogging();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
