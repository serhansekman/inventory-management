import { test, expect } from "@playwright/test";
import { apiJson, filter, mainRows, modal } from "./helpers.js";

test.describe("inventory", () => {
  test("lists every inventory item from the API", async ({ page, request }) => {
    const items = await apiJson(request, "/inventory");
    await page.goto("/inventory");
    await expect(mainRows(page)).toHaveCount(items.length);
  });

  test("search narrows by name and the clear button restores the list", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await expect(mainRows(page).first()).toBeVisible();
    const total = await mainRows(page).count();

    await page.locator(".search-input").fill("Sensor");
    await expect.poll(() => mainRows(page).count()).toBeLessThan(total);
    expect(await mainRows(page).count()).toBeGreaterThan(0);
    for (const text of await mainRows(page).allInnerTexts()) {
      expect(text.toLowerCase()).toContain("sensor");
    }

    await page.locator(".search-box button").click();
    await expect(page.locator(".search-input")).toHaveValue("");
    await expect(mainRows(page)).toHaveCount(total);
  });

  test("a search with no match shows no rows", async ({ page }) => {
    await page.goto("/inventory");
    await expect(mainRows(page).first()).toBeVisible();
    await page.locator(".search-input").fill("zzz-no-such-item");
    await expect(mainRows(page)).toHaveCount(0);
  });

  test("Location filter matches the inventory API for that warehouse", async ({
    page,
    request,
  }) => {
    const tokyo = await apiJson(request, "/inventory?warehouse=Tokyo");
    await page.goto("/inventory");
    await expect(mainRows(page).first()).toBeVisible();
    await filter(page, "Location").selectOption("Tokyo");
    await expect(mainRows(page)).toHaveCount(tokyo.length);
  });

  test("clicking a row opens Inventory Item Details for that item", async ({
    page,
  }) => {
    await page.goto("/inventory");
    const first = mainRows(page).first();
    const sku = (await first.locator("td").first().innerText()).trim();
    await first.click();

    await expect(page.locator(".modal-title")).toHaveText(
      "Inventory Item Details",
    );
    await expect(modal(page)).toContainText(sku);
    await modal(page).click({ position: { x: 5, y: 5 } });
    await expect(modal(page)).toHaveCount(0);
  });
});
