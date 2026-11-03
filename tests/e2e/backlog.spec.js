import { test, expect } from "@playwright/test";

const filter = (page, label) =>
  page.locator(".filter-group", { hasText: label }).locator("select");

const rows = (page) => page.locator("table").first().locator("tbody tr");

test.describe("backlog", () => {
  test.afterEach(async ({ page }) => {
    // Locale is persisted in localStorage; reset it so other suites start in English
    await page.evaluate(() => localStorage.removeItem("app-locale"));
  });

  test("is reachable at /backlog and lists every backlog item", async ({
    page,
    request,
  }) => {
    const total = (
      await (await request.get("http://localhost:8001/api/backlog")).json()
    ).length;
    await page.goto("/backlog");
    await expect(page.locator("h2").first()).toHaveText("Backlog Management");
    await expect(rows(page)).toHaveCount(total);
  });

  test("location and category filters do not empty the backlog or claim it is clear", async ({
    page,
  }) => {
    await page.goto("/backlog");
    await expect(rows(page).first()).toBeVisible();
    const total = await rows(page).count();

    await filter(page, "Location").selectOption("Tokyo");
    await filter(page, "Category").selectOption("sensors");
    await expect(rows(page)).toHaveCount(total);
    await expect(page.locator("main")).not.toContainText(
      "all orders can be fulfilled",
    );
  });

  test("Overview shortages panel keeps its rows under a location filter", async ({
    page,
  }) => {
    await page.goto("/");
    const panel = page.locator(".card", { hasText: "Inventory Shortages" });
    await expect(panel.locator("tbody tr").first()).toBeVisible();
    const total = await panel.locator("tbody tr").count();

    await filter(page, "Location").selectOption("Tokyo");
    await expect(panel.locator("tbody tr")).toHaveCount(total);
    await expect(panel).not.toContainText("all orders can be fulfilled");
  });

  test("translates to Japanese, including priority badges", async ({
    page,
  }) => {
    await page.goto("/backlog");
    await expect(rows(page).first()).toBeVisible();
    await page.locator(".language-button").click();
    await page.locator(".dropdown-item", { hasText: "日本語" }).click();

    await expect(page.locator("h2").first()).not.toHaveText(
      "Backlog Management",
    );
    await expect(page.locator("main")).not.toContainText(
      /\bbacklog\.[A-Za-z.]+/,
    );
    await expect(rows(page).first().locator(".badge").last()).toHaveText(
      /^[高中低]$/,
    );
  });
});
