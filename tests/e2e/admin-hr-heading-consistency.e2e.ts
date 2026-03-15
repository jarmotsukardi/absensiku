import { expect, test } from "@playwright/test";
import { loginAsSuperadmin } from "./helpers/adminAuth";
import { waitForStable } from "./helpers/orgAuth";

const HEADING_CASES: Array<{ path: string; title: string }> = [
  { path: "/admin/hr", title: "Ringkasan Platform HR" },
  { path: "/admin/hr/tenants", title: "Tenant HR" },
  { path: "/admin/hr/policies", title: "Kebijakan HR" },
  { path: "/admin/hr/audit", title: "Audit HR" },
  { path: "/admin/hr/error-logs", title: "Log Error HR" },
  { path: "/admin/hr/settings", title: "Pengaturan" },
  { path: "/admin/hr/help", title: "Pusat Bantuan Platform HR" },
  { path: "/admin/hr/help/faq", title: "FAQ Platform HR" },
  { path: "/admin/hr/help/support", title: "Dukungan Global HR" },
  { path: "/admin/hr/help/tickets", title: "Tiket HR Lintas Tenant" },
  { path: "/admin/hr/sections/struktur-unit-organisasi", title: "Struktur & Unit Organisasi" },
  { path: "/admin/hr/sections/jabatan-grade", title: "Jabatan & Grade" },
  { path: "/admin/hr/sections/lokasi-kalender-kerja", title: "Lokasi & Kalender Kerja" },
  { path: "/admin/hr/sections/notifikasi-sistem", title: "Notifikasi Sistem" },
  { path: "/admin/hr/sections/sla-monitoring", title: "Monitoring SLA" },
  { path: "/admin/hr/sections/playbook-eskalasi", title: "Playbook Eskalasi" },
];

test.describe.serial("Admin HR Heading Consistency", () => {
  test("heading halaman utama admin/hr konsisten dengan route", async ({ page }) => {
    test.setTimeout(300_000);

    await loginAsSuperadmin(page);

    for (const item of HEADING_CASES) {
      await page.goto(item.path, { waitUntil: "domcontentloaded" });
      await waitForStable(page);

      const heading = page
        .locator("h1, h2, h3")
        .filter({ hasText: item.title })
        .first();
      await expect(heading, `Heading '${item.title}' tidak ditemukan pada route ${item.path}`).toBeVisible();
    }
  });
});
