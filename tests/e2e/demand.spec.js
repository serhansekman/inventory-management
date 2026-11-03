import { test, expect } from "@playwright/test";
import { apiJson, mainRows } from "./helpers.js";

test.describe("demand", () => {
  test("forecast table lists every forecast", async ({ page, request }) => {
    const forecasts = await apiJson(request, "/demand");
    await page.goto("/demand");
    await expect(mainRows(page)).toHaveCount(forecasts.length);
  });

  test("trend cards count forecasts by trend", async ({ page, request }) => {
    const forecasts = await apiJson(request, "/demand");
    await page.goto("/demand");
    for (const trend of ["increasing", "stable", "decreasing"]) {
      const n = forecasts.filter((f) => f.trend === trend).length;
      await expect(page.locator(`.${trend}-card .trend-count`)).toContainText(
        String(n),
      );
    }
  });

  test("every row shows a recognised trend badge", async ({ page }) => {
    await page.goto("/demand");
    await expect(mainRows(page).first()).toBeVisible();
    for (const text of await mainRows(page).allInnerTexts()) {
      expect(text.toLowerCase()).toMatch(/increasing|stable|decreasing/);
    }
  });
});
