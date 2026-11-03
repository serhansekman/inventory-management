import { test, expect } from "@playwright/test";

test.describe("i18n", () => {
  test("switching to Japanese translates the navigation, including Restocking", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".language-button").click();
    await page.locator(".dropdown-item", { hasText: "日本語" }).click();

    await expect(page.locator('nav a[href="/"]')).toHaveText("概要");
    await expect(page.locator('nav a[href="/restocking"]')).toHaveText(
      "補充発注",
    );
  });

  test("untranslated Restocking strings fall back to English, not raw keys", async ({
    page,
  }) => {
    await page.goto("/restocking");
    await page.locator(".language-button").click();
    await page.locator(".dropdown-item", { hasText: "日本語" }).click();

    // Raw i18n keys look like "restocking.title"; none should leak into the page
    await expect(page.locator("h2").first()).not.toHaveText(
      /^[a-z]+\.[A-Za-z.]+$/,
    );
    await expect(page.locator("main")).not.toContainText(
      /\brestocking\.[A-Za-z.]+/,
    );
  });
});
