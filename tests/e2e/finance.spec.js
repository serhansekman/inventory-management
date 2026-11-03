import { test, expect } from "@playwright/test";
import { apiJson, modal } from "./helpers.js";

const section = (page, title) => page.locator(".card", { hasText: title });

test.describe("finance", () => {
  test("shows the four finance sections", async ({ page }) => {
    await page.goto("/spending");
    for (const title of [
      "Monthly Revenue vs Costs",
      "Monthly Cost Flow",
      "Spending by Category",
      "Recent Transactions",
    ]) {
      await expect(page.locator("h3", { hasText: title })).toBeVisible();
    }
  });

  test("cost flow has one bar per month of spending data", async ({
    page,
    request,
  }) => {
    const monthly = await apiJson(request, "/spending/monthly");
    await page.goto("/spending");
    await expect(page.locator(".stacked-bar")).toHaveCount(monthly.length);
  });

  test("clicking a cost bar opens that month's cost breakdown", async ({
    page,
  }) => {
    await page.goto("/spending");
    await page.locator(".stacked-bar").first().click();
    await expect(page.locator(".modal-title")).toContainText("Cost Breakdown");
    await page.locator(".close-button").click();
    await expect(modal(page)).toHaveCount(0);
  });

  test("transactions table lists every transaction", async ({
    page,
    request,
  }) => {
    const transactions = await apiJson(request, "/spending/transactions");
    await page.goto("/spending");
    await expect(
      section(page, "Recent Transactions").locator("tbody tr"),
    ).toHaveCount(transactions.length);
  });

  test("clicking a transaction shows its details", async ({
    page,
    request,
  }) => {
    const [first] = await apiJson(request, "/spending/transactions");
    await page.goto("/spending");
    // Current behavior is a native alert(); the UX audit flagged it for replacement with a modal
    // Handle the dialog in a listener: click() only resolves once the alert is dismissed
    let message = "";
    page.once("dialog", async (d) => {
      message = d.message();
      await d.dismiss();
    });
    await section(page, "Recent Transactions")
      .locator("tbody tr")
      .first()
      .click();
    await expect.poll(() => message).toContain(first.id);
  });
});
