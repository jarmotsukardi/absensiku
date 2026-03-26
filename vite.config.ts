import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { fullBackupDevApiPlugin } from "./api/_lib/full-backup-dev-plugin";

const mobileApiProxyTarget =
  process.env.ABSENSIKU_MOBILE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:3000";

function missingDownloadNotFoundPlugin() {
  const downloadsRoot = path.resolve(__dirname, "public", "downloads");

  return {
    name: "absensiku-missing-download-not-found",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathname = rawUrl.split("?")[0] ?? "";

        if (!pathname.startsWith("/downloads/")) {
          next();
          return;
        }

        const relativePath = decodeURIComponent(pathname.replace(/^\/downloads\//, ""));
        const absolutePath = path.resolve(downloadsRoot, relativePath);

        if (!absolutePath.startsWith(downloadsRoot) || !fs.existsSync(absolutePath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("File not found");
          return;
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    strictPort: true,
    proxy: {
      "/mobile-api": {
        target: mobileApiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
    watch: {
      ignored: ["**/artifacts/**", "**/playwright-report/**", "**/test-results/**"],
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "development" && fullBackupDevApiPlugin(),
    mode === "development" && missingDownloadNotFoundPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      external: ["@capacitor/app"],
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/clsx/") ||
              id.includes("/tailwind-merge/") ||
              id.includes("class-variance-authority")
            ) {
              return "vendor-ui";
            }

            if (
              id.includes("react-dom") ||
              id.includes("react-router-dom") ||
              id.includes("react-helmet-async")
            ) {
              return "vendor-react";
            }

            if (id.includes("date-fns")) {
              return "vendor-date";
            }

            if (id.includes("/lodash/") || id.includes("lodash-es")) {
              return "vendor-lodash";
            }

            if (id.includes("recharts")) {
              return "vendor-charts";
            }

            if (id.includes("dexie")) {
              return "vendor-offline";
            }
          }

          return undefined;
        },
      },
    },
  },
}));
