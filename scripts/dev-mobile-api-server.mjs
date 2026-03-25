#!/usr/bin/env node

import http from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { getMissingScriptEnvKeys, pickScriptEnv, readScriptEnvMap } from "./lib/supabase-env.mjs";

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 3000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host") {
      args.host = argv[i + 1] || args.host;
      i += 1;
      continue;
    }
    if (arg === "--port") {
      args.port = Number.parseInt(argv[i + 1] || String(args.port), 10) || args.port;
      i += 1;
    }
  }

  return args;
}

function normalizeRoutePath(urlPath) {
  if (!urlPath) return "/";
  const [pathname] = urlPath.split("?");
  return pathname || "/";
}

function candidateRoutePaths(pathname) {
  const normalized = normalizeRoutePath(pathname).replace(/\/+$/, "") || "/";
  const variants = [normalized];
  if (normalized.startsWith("/api/mobile-api")) {
    variants.push(normalized.slice("/api".length));
  } else if (normalized.startsWith("/mobile-api")) {
    variants.push(`/api${normalized}`);
  }
  return [...new Set(variants)];
}

async function loadRoutes() {
  const baseDir = process.cwd();
  const routeEntries = [
    {
      route: "/mobile-api/auth/login",
      file: path.join(baseDir, "api/mobile-api/auth/login.ts"),
    },
    {
      route: "/mobile-api/auth/logout",
      file: path.join(baseDir, "api/mobile-api/auth/logout.ts"),
    },
    {
      route: "/mobile-api/auth/session",
      file: path.join(baseDir, "api/mobile-api/auth/session.ts"),
    },
    {
      route: "/mobile-api/auth/forgot-password/request",
      file: path.join(baseDir, "api/mobile-api/auth/forgot-password/request.ts"),
    },
    {
      route: "/mobile-api/auth/forgot-password/verify-otp",
      file: path.join(baseDir, "api/mobile-api/auth/forgot-password/verify-otp.ts"),
    },
    {
      route: "/mobile-api/auth/forgot-password/reset",
      file: path.join(baseDir, "api/mobile-api/auth/forgot-password/reset.ts"),
    },
  ];

  const routes = new Map();
  for (const entry of routeEntries) {
    const moduleUrl = pathToFileURL(entry.file).href;
    const imported = await import(moduleUrl);
    if (typeof imported.default !== "function") {
      throw new Error(`Handler tidak valid untuk route ${entry.route}`);
    }
    routes.set(entry.route, imported.default);
    routes.set(`/api${entry.route}`, imported.default);
  }
  return routes;
}

function applyParityEnv(envMap, host, port) {
  const supabaseUrl = pickScriptEnv(envMap, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const supabaseAnonKey = pickScriptEnv(envMap, [
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]);
  const supabaseServiceRoleKey = pickScriptEnv(envMap, ["SUPABASE_SERVICE_ROLE_KEY"]);

  process.env.SUPABASE_URL = process.env.SUPABASE_URL || supabaseUrl;
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl;
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || supabaseUrl;
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || supabaseAnonKey;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseAnonKey;
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || supabaseAnonKey;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || supabaseAnonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseServiceRoleKey;
  process.env.ABSENSIKU_MOBILE_API_PROXY_TARGET =
    process.env.ABSENSIKU_MOBILE_API_PROXY_TARGET || `http://${host}:${port}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envMap = await readScriptEnvMap();
  const missing = await getMissingScriptEnvKeys({
    supabaseUrl: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"],
    supabaseAnonKey: [
      "SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ],
    supabaseServiceRoleKey: ["SUPABASE_SERVICE_ROLE_KEY"],
  });

  if (missing.length > 0) {
    process.stderr.write(
      `[dev-mobile-api-server] ENV wajib belum tersedia: ${missing.join(", ")}.\n`
    );
    process.exit(1);
  }

  applyParityEnv(envMap, args.host, args.port);
  const routes = await loadRoutes();

  const server = http.createServer(async (req, res) => {
    const pathname = normalizeRoutePath(req.url || "/");

    if (pathname === "/health" || pathname === "/mobile-api/health" || pathname === "/api/mobile-api/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, service: "mobile-api-local" }));
      return;
    }

    const handler = candidateRoutePaths(pathname)
      .map((route) => routes.get(route))
      .find(Boolean);

    if (!handler) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, code: "not_found", message: "Route tidak ditemukan" }));
      return;
    }

    try {
      await handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: false,
          code: "local_runtime_error",
          message: "Runtime mobile-api lokal gagal.",
          detail: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

  server.listen(args.port, args.host, () => {
    process.stdout.write(
      `[dev-mobile-api-server] Siap di http://${args.host}:${args.port}\n`
    );
  });
}

await main();
