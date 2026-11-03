// Shared helpers for the e2e suites. Older suites define their own copies; new suites use these.
import { expect } from "@playwright/test";

export const API = "http://localhost:8001/api";

/** Every routed page with its English h2, in nav order. */
export const PAGES = [
  { path: "/", heading: "Overview" },
  { path: "/inventory", heading: "Inventory" },
  { path: "/orders", heading: "Orders" },
  { path: "/spending", heading: "Finance Dashboard" },
  { path: "/demand", heading: "Demand Forecast" },
  { path: "/restocking", heading: "Restocking" },
  { path: "/backlog", heading: "Backlog Management" },
  { path: "/reports", heading: "Performance Reports" },
];

/** A select in the global filter bar, found by its visible label. */
export const filter = (page, label) =>
  page.locator(".filter-group", { hasText: label }).locator("select");

/** Rows of the first table on the page, excluding rows of tables nested inside it. */
export const mainRows = (page) =>
  page.locator("table").first().locator(":scope > tbody > tr");

export async function apiJson(request, path) {
  const res = await request.get(`${API}${path}`);
  expect(res.ok(), `GET ${path} should succeed`).toBeTruthy();
  return res.json();
}

export async function switchToJapanese(page) {
  await page.locator(".language-button").click();
  await page.locator(".dropdown-item", { hasText: "日本語" }).click();
  await expect(page.locator('nav a[href="/"]')).toHaveText("概要");
}

/** Locale and filters live in localStorage / module state; clear the persisted part between tests. */
export async function resetLocale(page) {
  await page
    .evaluate(() => localStorage.removeItem("app-locale"))
    .catch(() => {});
}

export const modal = (page) => page.locator(".modal-overlay");
