import { test, expect } from "@playwright/test";
import { apiJson, filter, modal } from "./helpers.js";

const card = (page, title) => page.locator(".card", { hasText: title });

test.describe("dashboard", () => {
  test("shows all five KPI cards with values", async ({ page }) => {
    await page.goto("/");
    const kpis = page.locator(".kpi-card");
    await expect(kpis).toHaveCount(5);
    for (const value of await kpis.allInnerTexts()) {
      expect(value).toMatch(/\d/);
    }
  });

  test("Order Health total matches the orders API", async ({
    page,
    request,
  }) => {
    const orders = await apiJson(request, "/orders");
    await page.goto("/");
    await expect(page.locator(".donut-center-value").first()).toHaveText(
      String(orders.length),
    );
  });

  test("Time Period filter updates the Order Health total", async ({
    page,
    request,
  }) => {
    const march = await apiJson(request, "/orders?month=2025-03");
    await page.goto("/");
    await expect(page.locator(".donut-center-value").first()).toBeVisible();
    await filter(page, "Time Period").selectOption("2025-03");
    await expect(page.locator(".donut-center-value").first()).toHaveText(
      String(march.length),
    );
  });

  test("Inventory Shortages count matches the backlog API", async ({
    page,
    request,
  }) => {
    const backlog = await apiJson(request, "/backlog");
    await page.goto("/");
    const panel = card(page, "Inventory Shortages");
    await expect(panel.locator("h3").first()).toContainText(
      `(${backlog.length})`,
    );
    await expect(panel.locator("tbody tr")).toHaveCount(backlog.length);
  });

  test("clicking a shortage row opens its details and the close button dismisses it", async ({
    page,
  }) => {
    await page.goto("/");
    const firstRow = card(page, "Inventory Shortages")
      .locator("tbody tr")
      .first();
    const sku = (await firstRow.locator("td").nth(1).innerText()).trim();
    await firstRow.locator("td").first().click();

    await expect(modal(page)).toBeVisible();
    await expect(page.locator(".modal-title")).toHaveText(
      "Inventory Shortage Details",
    );
    await expect(modal(page)).toContainText(sku);
    await page.locator(".close-button").click();
    await expect(modal(page)).toHaveCount(0);
  });

  test("clicking a top product opens Product Details", async ({ page }) => {
    await page.goto("/");
    await card(page, "Top Products").locator("tbody tr").first().click();
    await expect(page.locator(".modal-title")).toHaveText("Product Details");
    await modal(page).click({ position: { x: 5, y: 5 } });
    await expect(modal(page)).toHaveCount(0);
  });
});

test.describe("dashboard purchase-order buttons", () => {
  // Guards known-issues.spec.js: the expected failure there must be about the missing modal,
  // not about the button disappearing
  test("each shortage without a purchase order shows a Create PO button", async ({
    page,
    request,
  }) => {
    const backlog = await apiJson(request, "/backlog");
    const withoutPo = backlog.filter((b) => !b.has_purchase_order).length;
    await page.goto("/");
    await expect(
      page
        .locator(".card", { hasText: "Inventory Shortages" })
        .locator(".po-button"),
    ).toHaveCount(withoutPo);
  });
});
