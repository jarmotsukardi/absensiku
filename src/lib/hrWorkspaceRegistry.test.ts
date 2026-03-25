import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  HR_FOCUSED_SIDEBAR_GROUPS,
  HR_OVERVIEW_SIDEBAR_SECTIONS,
  HR_WORKSPACE_ROUTE_DEFINITIONS,
} from "@/lib/hrWorkspaceRegistry";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_SOURCE = fs.readFileSync(path.resolve(CURRENT_DIR, "../App.tsx"), "utf8");
const HR_SETTINGS_SOURCE = fs.readFileSync(path.resolve(CURRENT_DIR, "../pages/org/hr/OrgHRSettings.tsx"), "utf8");

const getDuplicatePaths = (paths: string[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const routePath of paths) {
    if (seen.has(routePath)) {
      duplicates.add(routePath);
      continue;
    }
    seen.add(routePath);
  }

  return [...duplicates];
};

const getSidebarPaths = () => [
  ...HR_OVERVIEW_SIDEBAR_SECTIONS.flatMap((section) => section.items.map((item) => item.path)),
  ...HR_FOCUSED_SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.path)),
];

describe("hrWorkspaceRegistry", () => {
  it("menjaga path route HR tetap unik", () => {
    const routePaths = HR_WORKSPACE_ROUTE_DEFINITIONS.map((route) => route.path);

    expect(getDuplicatePaths(routePaths)).toEqual([]);
  });

  it("sinkron dengan route HR yang diproteksi di App", () => {
    const registryPaths = new Set(HR_WORKSPACE_ROUTE_DEFINITIONS.map((route) => route.path));
    const routerPaths = new Set(
      [...APP_SOURCE.matchAll(/withHrGuard\("([^"]+)"/g)].map((match) => match[1]),
    );

    const missingInRegistry = [...routerPaths].filter((routePath) => !registryPaths.has(routePath));
    const missingInRouter = [...registryPaths].filter((routePath) => !routerPaths.has(routePath));

    expect(missingInRegistry).toEqual([]);
    expect(missingInRouter).toEqual([]);
  });

  it("memastikan semua item sidebar HR mengarah ke route registry", () => {
    const registryPaths = new Set(HR_WORKSPACE_ROUTE_DEFINITIONS.map((route) => route.path));
    const sidebarPaths = getSidebarPaths();
    const missingSidebarRoutes = sidebarPaths.filter((routePath) => !registryPaths.has(routePath));

    expect(missingSidebarRoutes).toEqual([]);
  });

  it("memastikan shortcut penting di Pengaturan HR mengarah ke route registry", () => {
    const registryPaths = new Set(HR_WORKSPACE_ROUTE_DEFINITIONS.map((route) => route.path));
    const settingsPaths = [...HR_SETTINGS_SOURCE.matchAll(/path: "([^"]+)"/g)].map((match) => match[1]);
    const missingSettingsRoutes = settingsPaths.filter((routePath) => !registryPaths.has(routePath));

    expect(missingSettingsRoutes).toEqual([]);
  });
});
