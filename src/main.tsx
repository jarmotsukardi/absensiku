import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorLogging } from "@/lib/errorLogger";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";
import { initClientObservability } from "@/lib/observability";

initClientObservability();
installGlobalErrorLogging();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
