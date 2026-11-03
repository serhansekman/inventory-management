import { test, expect } from "@playwright/test";

const filter = (page, label) =>
  page.locator(".filter-group", { hasText: label }).locator("select");

const switchToJapanese = async (page) => {
  await page.locator(".language-button").click();
  await page.locator(".dropdown-item", { hasText: "日本語" }).click();
};

test.describe("reports", () => {
  test.afterEach(async ({ page }) => {
    // Locale is persisted in localStorage; reset it so other suites start in English
    await page.evaluate(() => localStorage.removeItem("app-locale"));
  });

  test("loads without debug logging", async ({ page }) => {
    const logs = [];
    page.on("console", (m) => {
      // Vite's own HMR client messages are not the page's logging
      if (m.type() === "log" && !m.text().startsWith("[vite]"))
        logs.push(m.text());
    });
    await page.goto("/reports");
    await expect(page.locator("h2").first()).toHaveText("Performance Reports");
    await expect(
      page.locator("table").first().locator("tbody tr").first(),
    ).toBeVisible();
    expect(logs).toEqual([]);
  });

  test("reloads with the global filters", async ({ page }) => {
    await page.goto("/reports");
    const firstTable = page.locator("table").first();
    await expect(firstTable.locator("tbody tr").first()).toBeVisible();
    const before = await firstTable.innerText();

    const quarterly = page.waitForRequest(
      (r) =>
        r.url().includes("/api/reports/quarterly") &&
        r.url().includes("warehouse=Tokyo"),
    );
    const monthly = page.waitForRequest(
      (r) =>
        r.url().includes("/api/reports/monthly-trends") &&
        r.url().includes("warehouse=Tokyo"),
    );
    await filter(page, "Location").selectOption("Tokyo");
    await Promise.all([quarterly, monthly]);
    await expect.poll(() => firstTable.innerText()).not.toBe(before);

    await page.getByRole("button", { name: "Reset all filters" }).click();
    await expect.poll(() => firstTable.innerText()).toBe(before);
  });

  test("translates to Japanese, including the nav and currency", async ({
    page,
  }) => {
    await page.goto("/reports");
    await expect(
      page.locator("table").first().locator("tbody tr").first(),
    ).toBeVisible();
    await switchToJapanese(page);

    await expect(page.locator('nav a[href="/reports"]')).toHaveText("レポート");
    await expect(page.locator("h2").first()).not.toHaveText(
      "Performance Reports",
    );
    // No raw i18n keys and no leftover English page title
    await expect(page.locator("main")).not.toContainText(
      /\breports\.[A-Za-z.]+/,
    );
    // Money is converted and shown in yen, like the Dashboard
    await expect(page.locator("table").first()).toContainText("¥");
    await expect(page.locator("table").first()).not.toContainText("$");
  });
});
