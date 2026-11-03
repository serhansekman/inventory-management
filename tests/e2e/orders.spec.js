import { test, expect } from "@playwright/test";
import { apiJson, filter, mainRows } from "./helpers.js";

const statValue = (page, label) =>
  page.locator(".stat-card", { hasText: label }).locator(".stat-value");

test.describe("orders", () => {
  test("status cards match the counts from the orders API", async ({
    page,
    request,
  }) => {
    const orders = await apiJson(request, "/orders");
    const count = (s) => orders.filter((o) => o.status === s).length;
    await page.goto("/orders");
    for (const status of [
      "Delivered",
      "Shipped",
      "Processing",
      "Backordered",
    ]) {
      await expect(statValue(page, status)).toHaveText(String(count(status)));
    }
  });

  test("main table lists every order", async ({ page, request }) => {
    const orders = await apiJson(request, "/orders");
    await page.goto("/orders");
    await expect(mainRows(page)).toHaveCount(orders.length);
  });

  test("Time Period filter matches the orders API for that month", async ({
    page,
    request,
  }) => {
    const march = await apiJson(request, "/orders?month=2025-03");
    await page.goto("/orders");
    await expect(mainRows(page).first()).toBeVisible();
    await filter(page, "Time Period").selectOption("2025-03");
    await expect(mainRows(page)).toHaveCount(march.length);
  });

  test("combined filters narrow the table to matching orders only", async ({
    page,
    request,
  }) => {
    const expected = await apiJson(
      request,
      "/orders?warehouse=London&status=Delivered",
    );
    await page.goto("/orders");
    await expect(mainRows(page).first()).toBeVisible();
    await filter(page, "Location").selectOption("London");
    await filter(page, "Order Status").selectOption("delivered");
    await expect(mainRows(page)).toHaveCount(expected.length);
  });

  test("expanding an order's items shows its line items", async ({
    page,
    request,
  }) => {
    const orders = await apiJson(request, "/orders");
    // The table is sorted by order date, earliest first
    const first = [...orders].sort((a, b) =>
      a.order_date.localeCompare(b.order_date),
    )[0];
    await page.goto("/orders");
    const row = mainRows(page).filter({ hasText: first.order_number });
    const details = row.locator("details.items-details");
    await details.locator("summary").click();
    await expect(details).toHaveJSProperty("open", true);
    // Line items are shown by product name and quantity, not SKU
    await expect(details).toContainText(first.items[0].name);
    await expect(details).toContainText(String(first.items[0].quantity));
  });

  test("shows the Submitted Orders section", async ({ page }) => {
    await page.goto("/orders");
    await expect(
      page.locator(".card", { hasText: "Submitted Orders" }).first(),
    ).toBeVisible();
  });
});
