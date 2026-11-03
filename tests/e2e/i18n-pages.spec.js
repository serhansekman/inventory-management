import { test, expect } from "@playwright/test";
import { PAGES, resetLocale, switchToJapanese } from "./helpers.js";

// A raw i18n key looks like "dashboard.kpi.title": a known top-level namespace, a dot, then a key
const RAW_KEY =
  /\b(nav|dashboard|inventory|orders|finance|demand|restocking|backlog|reports|filters|status|trends|priority|common|tasks|profile|profileDetails|months)\.[a-zA-Z]+/;

test.describe("Japanese on every page", () => {
  test.afterEach(async ({ page }) => resetLocale(page));

  for (const { path, heading } of PAGES) {
    test(`${path} shows no raw translation keys`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h2").first()).toHaveText(heading);
      await switchToJapanese(page);
      await expect(page.locator("main")).not.toContainText(RAW_KEY);
    });

    test(`${path} translates its page title`, async ({ page }) => {
      // Known gap: only nav.restocking was added to ja.js, so the Restocking page body falls back
      // to English. Expected to fail until translated; Playwright reports it once it starts passing.
      test.fail(
        path === "/restocking",
        "Restocking page strings are not in ja.js yet",
      );
      await page.goto(path);
      await switchToJapanese(page);
      await expect(page.locator("h2").first()).not.toHaveText(heading);
    });
  }
});
