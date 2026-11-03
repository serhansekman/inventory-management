import { test, expect } from "@playwright/test";
import { modal, resetLocale, switchToJapanese } from "./helpers.js";

test.describe("header menus and modals", () => {
  test.afterEach(async ({ page }) => resetLocale(page));

  test("profile menu lists Profile Details, My Tasks and Logout", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".profile-button").click();
    const items = page.locator(".dropdown-menu .dropdown-item");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Profile Details");
    await expect(items.nth(1)).toContainText("My Tasks");
    await expect(items.nth(2)).toContainText("Logout");
  });

  test("Profile Details opens a modal that closes again", async ({ page }) => {
    await page.goto("/");
    await page.locator(".profile-button").click();
    await page
      .locator(".dropdown-item", { hasText: "Profile Details" })
      .click();
    await expect(page.locator(".modal-title")).toHaveText("Profile Details");
    await page.locator(".close-button").click();
    await expect(modal(page)).toHaveCount(0);
  });

  test("My Tasks opens the tasks modal", async ({ page }) => {
    await page.goto("/");
    await page.locator(".profile-button").click();
    await page.locator(".dropdown-item", { hasText: "My Tasks" }).click();
    await expect(page.locator(".modal-title")).toHaveText("My Tasks");
  });

  test("chosen language persists across a reload", async ({ page }) => {
    await page.goto("/orders");
    await switchToJapanese(page);
    await page.reload();
    await expect(page.locator('nav a[href="/"]')).toHaveText("概要");
    await expect(page.locator(".language-button")).toContainText("日本語");
  });

  test("the language menu closes after choosing a language", async ({
    page,
  }) => {
    await page.goto("/");
    await switchToJapanese(page);
    await expect(page.locator(".language-switcher .dropdown-menu")).toHaveCount(
      0,
    );
  });
});
