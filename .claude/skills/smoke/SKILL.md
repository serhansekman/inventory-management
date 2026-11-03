---
name: smoke
description: Smoke-test the running app through the Playwright MCP (every tab loads, filters, Restocking flow). Use when asked to smoke test, sanity check, or verify the app in a real browser.
---

# Smoke test via Playwright MCP

Interactive counterpart to the checked-in specs in `tests/e2e/` (run those with `cd tests/e2e && npm run e2e`). Use this when you want Claude to look at the pages, not just assert on them.

## Setup
1. Confirm servers: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/docs` and `http://localhost:3000`. If either is not 200, run the `/start` command first. Do not start a second copy.
2. Use `mcp__playwright__*` tools only (per CLAUDE.md). Load their schemas with ToolSearch if they are deferred.
3. Save screenshots to the scratchpad directory, not the repo root.

## Steps
1. **Tabs**: navigate to `http://localhost:3000`, then click each nav link in order: Overview `/`, Inventory `/inventory`, Orders `/orders`, Finance `/spending`, Demand Forecast `/demand`, Restocking `/restocking`, Reports `/reports`. For each, check the `h2` heading and that tables have rows (`document.querySelectorAll('tbody tr').length`). Take one screenshot of the Overview page.
2. **Console**: read console errors once at the end. Known and ignorable: `/api/tasks` 404 and `favicon.ico` 404. Report anything else.
3. **Filters**: on Orders, set Location to Tokyo and confirm the row count drops; click "Reset all filters" and confirm it returns.
4. **Restocking**: set the budget slider to 0 (no rows, Place Order disabled), then 300000 (rows appear). Place an order, confirm the "Order submitted" banner with an `RST-` number, open the Orders tab and confirm it appears under Submitted Orders with its lead time.
5. **Japanese**: open the language menu, choose 日本語, confirm the nav shows 概要 and 補充発注.

## Report
A table of tab, heading and row count, then pass/fail for steps 3 to 5, and any unexpected console errors. Say plainly what was not checked. Placing an order adds to the in-memory list, which resets when the backend restarts.
