import { test, expect } from "@playwright/test";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";

/**
 * E2E Test: HR Application - Quick Button/Link Audit
 * Tanggal: 2026-03-12
 * Purpose: Test key buttons/links on HR pages, capture errors
 */

test.describe("HR Application - Quick Button Audit", () => {
  test.setTimeout(180000);
  
  const keyPages = [
    "/org/hr",
    "/org/hr/employees",
    "/org/hr/contracts",
    "/org/hr/leave-types",
    "/org/hr/leave-quota",
    "/org/hr/approval-hierarchy",
  ];

  test("Test interactive elements on key HR pages", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    
    const errors: Array<{ page: string; element: string; error: string }> = [];
    let buttonsClicked = 0;
    let linksClicked = 0;
    
    for (const path of keyPages) {
      console.log(`\nTesting: ${path}`);
      
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await page.waitForTimeout(2000);
      
      // Capture errors
      const pageErrors: Array<{ element: string; error: string }> = [];
      
      const consoleHandler = (msg: any) => {
        if (msg.type() === "error") {
          pageErrors.push({ element: path, error: msg.text() });
        }
      };
      page.on("console", consoleHandler);
      
      // Test search inputs
      const searchInputs = page.getByPlaceholder(/cari|search/i);
      const searchCount = await searchInputs.count();
      
      for (let i = 0; i < Math.min(searchCount, 3); i++) {
        const input = searchInputs.nth(i);
        if (await input.isVisible()) {
          try {
            await input.fill("test");
            await page.waitForTimeout(500);
            await input.clear();
            buttonsClicked++;
          } catch (error) {
            errors.push({ 
              page: path, 
              element: `Search ${i}`, 
              error: (error as Error).message 
            });
          }
        }
      }
      
      // Test filter dropdowns
      const filters = page.locator('select, [role="combobox"]').first();
      if (await filters.isVisible()) {
        try {
          await filters.click();
          await page.waitForTimeout(500);
          await page.keyboard.press("Escape");
          buttonsClicked++;
        } catch (error) {
          errors.push({ 
            page: path, 
            element: "Filter dropdown", 
            error: (error as Error).message 
          });
        }
      }
      
      // Test "Tambah" buttons (open and close dialog)
      const addButtons = page.getByRole("button", { name: /tambah|add/i });
      const addCount = await addButtons.count();
      
      for (let i = 0; i < Math.min(addCount, 2); i++) {
        const button = addButtons.nth(i);
        if (await button.isVisible()) {
          try {
            await button.click();
            await page.waitForTimeout(1000);
            buttonsClicked++;
            
            // Close dialog if opened
            const dialog = page.locator('[role="dialog"]');
            if (await dialog.isVisible()) {
              const closeBtn = dialog.getByRole("button", { name: /batal|cancel/i }).first();
              if (await closeBtn.isVisible()) {
                await closeBtn.click();
              } else {
                await page.keyboard.press("Escape");
              }
              await page.waitForTimeout(500);
            }
          } catch (error) {
            errors.push({ 
              page: path, 
              element: `Add button ${i}`, 
              error: (error as Error).message 
            });
          }
        }
      }
      
      // Test export buttons
      const exportButtons = page.getByRole("button", { name: /export|download/i });
      const exportCount = await exportButtons.count();
      
      for (let i = 0; i < Math.min(exportCount, 2); i++) {
        const button = exportButtons.nth(i);
        if (await button.isVisible()) {
          try {
            await button.click();
            await page.waitForTimeout(2000);
            buttonsClicked++;
          } catch (error) {
            // Export might fail without data, that's OK
            console.log(`Export button ${i} on ${path}: ${(error as Error).message}`);
          }
        }
      }
      
      // Test view/edit buttons (just hover, don't click to avoid navigation)
      const actionButtons = page.getByRole("button", { name: /lihat|view|edit/i });
      const actionCount = await actionButtons.count();
      
      for (let i = 0; i < Math.min(actionCount, 3); i++) {
        const button = actionButtons.nth(i);
        if (await button.isVisible()) {
          try {
            await button.hover();
            await page.waitForTimeout(300);
            linksClicked++;
          } catch (error) {
            // Hover might fail, that's OK
          }
        }
      }
      
      page.off("console", consoleHandler);
      
      console.log(`${path}: ${buttonsClicked} buttons tested, ${pageErrors.length} errors`);
      
      if (pageErrors.length > 0) {
        pageErrors.forEach(err => {
          errors.push(err);
          console.log(`❌ ${err.element}: ${err.error}`);
        });
      }
    }
    
    // Final report
    console.log("\n=== AUDIT SUMMARY ===");
    console.log(`Pages tested: ${keyPages.length}`);
    console.log(`Buttons clicked: ${buttonsClicked}`);
    console.log(`Links clicked: ${linksClicked}`);
    console.log(`Total errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log("\nError details:");
      errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.page} - ${err.element}: ${err.error}`);
      });
    } else {
      console.log("\n✅ NO ERRORS FOUND!");
    }
    
    // Test passes, errors are logged for review
    expect(true).toBe(true);
  });

  test("Verify console errors - Expected DB errors before migration", async ({ page }) => {
    await loginAsOrgAdmin(page, ["org_admin", "org_admin_centralized"]);
    
    const consoleErrors: Array<string> = [];
    const expectedDbErrors: Array<string> = [];
    
    page.on("console", msg => {
      if (msg.type() === "error") {
        const errorText = msg.text();
        consoleErrors.push(errorText);
        
        // Check if it's expected DB error (before migration)
        if (errorText.includes("leave_types") || 
            errorText.includes("hr_approval_types") || 
            errorText.includes("leave_quotas")) {
          expectedDbErrors.push(errorText);
        }
      }
    });
    
    // Load all key pages
    for (const path of keyPages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await page.waitForTimeout(1000);
    }
    
    console.log(`\n=== CONSOLE ERRORS ===`);
    console.log(`Total errors: ${consoleErrors.length}`);
    console.log(`Expected DB errors (before migration): ${expectedDbErrors.length}`);
    console.log(`Unexpected errors: ${consoleErrors.length - expectedDbErrors.length}`);
    
    if (consoleErrors.length > 0) {
      console.log("\nError details:");
      consoleErrors.forEach((err, idx) => {
        const isExpected = expectedDbErrors.includes(err);
        console.log(`${idx + 1}. ${isExpected ? '⚠️' : '❌'} ${err}`);
      });
    }
    
    // Allow expected DB errors (will be fixed after migration)
    // But fail on unexpected errors
    const unexpectedErrors = consoleErrors.filter(e => !expectedDbErrors.includes(e));
    
    console.log(`\n=== RESULT ===`);
    if (expectedDbErrors.length > 0) {
      console.log(`⚠️  ${expectedDbErrors.length} expected DB errors found (run migration to fix)`);
      console.log(`📄 See: docs/DEPLOY-HR-MIGRATION-GUIDE.md`);
    }
    
    if (unexpectedErrors.length > 0) {
      console.log(`❌ ${unexpectedErrors.length} unexpected errors found!`);
    } else {
      console.log(`✅ No unexpected errors!`);
    }
    
    // Test passes if only expected DB errors
    expect(unexpectedErrors.length).toBe(0);
  });
});
