import { test, expect } from "@playwright/test";

const TABS = [
  { path: "/", heading: "Overview" },
  { path: "/inventory", heading: "Inventory" },
  { path: "/orders", heading: "Orders" },
  { path: "/spending", heading: "Finance Dashboard" },
  { path: "/demand", heading: "Demand Forecast" },
  { path: "/restocking", heading: "Restocking" },
  { path: "/backlog", heading: "Backlog Management" },
  { path: "/reports", heading: "Performance Reports" },
];

// Known, pre-existing failures: api.js calls /tasks, which main.py does not define, and there is no favicon.
// Anything else logged as an error fails the suite.
const KNOWN_ERRORS = [/\/api\/tasks/, /favicon\.ico/, /Failed to load tasks/];

test.describe("smoke", () => {
  test("backend API is up", async ({ request }) => {
    const res = await request.get("http://localhost:8001/api/demand");
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).length).toBeGreaterThan(0);
  });

  for (const tab of TABS) {
    test(`${tab.heading} tab loads`, async ({ page }) => {
      const errors = [];
      page.on("console", (m) => {
        // "Failed to load resource" messages carry the URL only in location(), not in the text
        const haystack = `${m.text()} ${m.location().url}`;
        if (
          m.type() === "error" &&
          !KNOWN_ERRORS.some((re) => re.test(haystack))
        )
          errors.push(haystack);
      });
      page.on("pageerror", (e) => errors.push(e.message));

      await page.goto(tab.path);
      await expect(page.locator("h2").first()).toHaveText(tab.heading);
      await expect(page.locator(".error")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test("navigation links reach every tab", async ({ page }) => {
    await page.goto("/");
    for (const tab of TABS.slice(1)) {
      await page.locator(`nav a[href="${tab.path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${tab.path}$`));
      await expect(page.locator("h2").first()).toHaveText(tab.heading);
    }
  });
});
