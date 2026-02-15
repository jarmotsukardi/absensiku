#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const APP_FILE = path.join(ROOT, "src", "App.tsx");
const SRC_DIR = path.join(ROOT, "src");
const SMOKE_FILE = path.join(ROOT, "ops", "smoke-routes.json");

const PREFIXES = ["/admin", "/org", "/employee", "/dashboard"];

function normalizePath(inputPath) {
  return String(inputPath || "").split("?")[0].trim();
}

async function walkFiles(dirPath) {
  const output = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      output.push(...await walkFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) output.push(fullPath);
  }
  return output;
}

function parseRoutePaths(appSource) {
  const routeRegex = /path="([^"]+)"/g;
  const routes = [];
  let match = null;
  while ((match = routeRegex.exec(appSource)) !== null) {
    routes.push(match[1]);
  }
  return routes;
}

function parsePathReferences(fileContent) {
  const refs = [];
  const regex = /(?:navigate\(|to=|href=)\s*`?"?(\/[a-zA-Z0-9\-_/?:=&]+)(?=["'`\)\}\s])/g;
  let match = null;
  while ((match = regex.exec(fileContent)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

function routeToRegex(routePath) {
  return new RegExp(`^${routePath.replace(/:[^/]+/g, "[^/]+")}$`);
}

function hasMatchingRoute(definedRoutes, candidatePath) {
  const normalized = normalizePath(candidatePath);
  if (definedRoutes.has(normalized)) return true;
  for (const routePath of definedRoutes) {
    if (routeToRegex(routePath).test(normalized)) return true;
  }
  return false;
}

function routeInScope(routePath) {
  return PREFIXES.some((prefix) => routePath.startsWith(prefix));
}

async function readSmokeRoutes() {
  try {
    const raw = await fs.readFile(SMOKE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const routeGroups = parsed?.routes && typeof parsed.routes === "object" ? parsed.routes : {};
    const collected = [];
    for (const value of Object.values(routeGroups)) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (typeof item === "string") collected.push(item);
      }
    }
    return collected;
  } catch {
    return [];
  }
}

async function main() {
  const appSource = await fs.readFile(APP_FILE, "utf8");
  const allRoutes = parseRoutePaths(appSource);
  const scopedRoutes = allRoutes.filter(routeInScope);
  const routeSet = new Set(scopedRoutes);

  const files = await walkFiles(SRC_DIR);
  const refs = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const found = parsePathReferences(raw);
    for (const ref of found) {
      if (routeInScope(ref)) refs.push({ file: path.relative(ROOT, file), path: ref });
    }
  }

  const uniqueRefs = [...new Set(refs.map((ref) => ref.path))];
  const missingRefs = uniqueRefs.filter((ref) => !hasMatchingRoute(routeSet, ref)).sort();

  const smokeRoutes = await readSmokeRoutes();
  const missingSmokeRoutes = [...new Set(smokeRoutes)]
    .filter(routeInScope)
    .filter((routePath) => !hasMatchingRoute(routeSet, routePath))
    .sort();

  console.log("Route Trace Summary");
  console.log(`- defined_scoped_routes: ${scopedRoutes.length}`);
  console.log(`- referenced_scoped_paths: ${uniqueRefs.length}`);
  console.log(`- missing_referenced_paths: ${missingRefs.length}`);
  console.log(`- smoke_routes_checked: ${smokeRoutes.filter(routeInScope).length}`);
  console.log(`- smoke_routes_missing: ${missingSmokeRoutes.length}`);

  if (missingRefs.length > 0) {
    console.log("\nMissing referenced paths:");
    for (const ref of missingRefs) console.log(`- ${ref}`);
  }

  if (missingSmokeRoutes.length > 0) {
    console.log("\nMissing smoke routes:");
    for (const routePath of missingSmokeRoutes) console.log(`- ${routePath}`);
  }

  if (missingRefs.length > 0 || missingSmokeRoutes.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`trace-routes error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

