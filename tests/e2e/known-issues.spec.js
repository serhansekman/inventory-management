import { test, expect } from "@playwright/test";
import { API, modal } from "./helpers.js";

// Open bugs from the audit, written as the behavior we want. test.fail() marks each as an
// expected failure, so the suite stays green today and reports "expected to fail but passed"
// as soon as one is fixed; then delete its test.fail() line to keep it as a regression test.

test.describe("known issues (expected failures)", () => {
  test("Dashboard 'Create PO' opens a purchase order dialog", async ({
    page,
  }) => {
    test.fail(
      true,
      "PurchaseOrderModal.vue does not exist and /api/purchase-orders has no route",
    );
    await page.goto("/");
    const button = page.locator(".po-button").first();
    await button.click({ timeout: 5000 });
    await expect(modal(page)).toBeVisible({ timeout: 3000 });
  });

  test("Escape closes an open modal", async ({ page }) => {
    test.fail(
      true,
      "Modals have no Escape handler (UX audit: modal accessibility)",
    );
    await page.goto("/inventory");
    await page
      .locator("table")
      .first()
      .locator(":scope > tbody > tr")
      .first()
      .click();
    await expect(modal(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0, { timeout: 2000 });
  });

  test("modals are exposed as dialogs to assistive technology", async ({
    page,
  }) => {
    test.fail(true, "Modals lack role=dialog and aria-modal (UX audit)");
    await page.goto("/inventory");
    await page
      .locator("table")
      .first()
      .locator(":scope > tbody > tr")
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
  });

  test("no horizontal scrolling on a 375px phone screen", async ({ page }) => {
    test.fail(
      true,
      "No responsive CSS: the header is far wider than a phone (UX audit)",
    );
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test("the tasks API used by My Tasks exists", async ({ request }) => {
    test.fail(
      true,
      "client/src/api.js calls /api/tasks but server/main.py has no such route",
    );
    const res = await request.get(`${API}/tasks`);
    expect(res.ok()).toBeTruthy();
  });
});
