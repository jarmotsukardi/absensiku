import type { Plugin } from "vite";

import { handleFullBackupRequest } from "./full-backup.js";

export function fullBackupDevApiPlugin(): Plugin {
  return {
    name: "absensiku-full-backup-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (pathname !== "/api/admin/full-backup") {
          next();
          return;
        }

        const response = await handleFullBackupRequest({
          method: req.method,
          headers: req.headers as Record<string, string | string[] | undefined>,
        });

        res.statusCode = response.status;
        for (const [key, value] of Object.entries(response.headers) as [string, string][]) {
          res.setHeader(key, value);
        }
        res.end(response.body);
      });
    },
  };
}
