import fs from "node:fs/promises";
import path from "node:path";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRoute(route) {
  if (!isObject(route)) return null;
  const has = Array.isArray(route.has) ? route.has : [];
  const hostHas = has.find((h) => isObject(h) && h.type === "host" && typeof h.value === "string");
  return {
    src: typeof route.src === "string" ? route.src : null,
    status: typeof route.status === "number" ? route.status : null,
    location:
      isObject(route.headers) && typeof route.headers.Location === "string"
        ? route.headers.Location
        : null,
    host: hostHas?.value ?? null,
  };
}

const WWW_HOST = "www.absensipro.com";
const APEX_BASE = "https://absensipro.com";
const CATCH_ALL_SOURCES = new Set(["^(?:/(.*))$", "^/(.*)$", "^/(.*)"]);

const isCatchAllSource = (src) => typeof src === "string" && CATCH_ALL_SOURCES.has(src);

const isApexLocation = (location) =>
  typeof location === "string" &&
  (location === `${APEX_BASE}` || location === `${APEX_BASE}/` || location.startsWith(`${APEX_BASE}/`));

function hasWwwRedirect(routes) {
  for (const route of routes) {
    const r = normalizeRoute(route);
    if (!r) continue;
    if (r.host !== WWW_HOST) continue;
    if (r.status !== 308 && r.status !== 301) continue;
    if (!isApexLocation(r.location)) continue;
    if (!isCatchAllSource(r.src)) continue;
    return true;
  }
  return false;
}

async function main() {
  const configPath = path.join(process.cwd(), ".vercel", "output", "config.json");
  const raw = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(raw);

  if (!isObject(config) || !Array.isArray(config.routes)) {
    throw new Error(`Invalid Vercel build output config: ${configPath}`);
  }

  const routes = config.routes;
  if (!hasWwwRedirect(routes)) {
    routes.unshift({
      src: "^(?:/(.*))$",
      status: 308,
      headers: {
        Location: `${APEX_BASE}/$1`,
      },
      has: [
        {
          type: "host",
          value: WWW_HOST,
        },
      ],
    });
  }

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`[OK] vercel-postbuild-fixes patched: ${configPath}`);
}

main().catch((err) => {
  console.error("[ERROR] vercel-postbuild-fixes failed");
  console.error(err);
  process.exitCode = 1;
});
