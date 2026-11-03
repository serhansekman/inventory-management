import { test, expect } from "@playwright/test";

// The first table on the Orders page is the main (filterable) orders table
const orderRows = (page) => page.locator("table").first().locator("tbody tr");
const filter = (page, label) =>
  page.locator(".filter-group", { hasText: label }).locator("select");

test.describe("global filters", () => {
  test("warehouse filter narrows the Orders table and reset restores it", async ({
    page,
  }) => {
    await page.goto("/orders");
    await expect(orderRows(page).first()).toBeVisible();
    const all = await orderRows(page).count();

    await filter(page, "Location").selectOption("Tokyo");
    await expect.poll(() => orderRows(page).count()).toBeLessThan(all);
    expect(await orderRows(page).count()).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Reset all filters" }).click();
    await expect.poll(() => orderRows(page).count()).toBe(all);
  });

  test("status filter only shows matching orders", async ({ page }) => {
    await page.goto("/orders");
    await expect(orderRows(page).first()).toBeVisible();
    await filter(page, "Order Status").selectOption("delivered");
    await expect
      .poll(async () => {
        const texts = await orderRows(page).allInnerTexts();
        return texts.length > 0 && texts.every((t) => /delivered/i.test(t));
      })
      .toBe(true);
  });

  test("filters persist across tabs", async ({ page }) => {
    await page.goto("/inventory");
    await filter(page, "Location").selectOption("London");
    await page.locator('nav a[href="/orders"]').click();
    await expect(filter(page, "Location")).toHaveValue("London");
  });
});
