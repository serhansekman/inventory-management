---
name: vue-analyze
description: Analyze Vue component structure and suggest performance and code-reuse optimizations. Use when asked to review, audit, optimize, or refactor Vue components or views, find duplicated code across .vue files, or decide what to extract into components, composables or utils.
---

# Vue component analysis

Read-only analysis of `client/src`. Produces a ranked list of optimizations for **performance** and **code reuse**. It never edits files.

## 1. Scan

Run the structure scanner first so the analysis starts from measured facts:

```bash
node .claude/skills/vue-analyze/scripts/analyze.mjs                 # all of client/src
node .claude/skills/vue-analyze/scripts/analyze.mjs client/src/views/Orders.vue   # one or more paths
FORMAT=json node .claude/skills/vue-analyze/scripts/analyze.mjs     # machine-readable
```

It reports per-file size split (template/script/style), counts of refs, computeds, watchers, tables and `v-for`s, child components, and cross-file duplicated helpers, including helpers that shadow an existing `utils/` or `composables/` export.

**The scanner is regex-based. Every finding is a lead, not a verdict.** Open the file and confirm before reporting it. Drop anything that turns out to be a false positive, and say you did.

If the user named a target (a file, a view, "the Orders tab"), scan it alone for the per-file findings, **and also run the full-tree scan**: duplicate detection only sees the files you pass in, so a single-file scan always reports "none" for duplicates.

## 2. Investigate

For each lead worth keeping, read the relevant code. Also read the shared modules (`client/src/utils/`, `client/src/composables/`, `client/src/components/`) so suggestions reuse what exists instead of inventing parallel versions.

### Code reuse: look for

- **Helpers copied across files** (the scanner's duplicates list): `formatDate`, `formatCurrency`, `translate*`, `getStockStatus*`, dropdown `toggle/blur` handlers, modal `close`. Recommend the destination: `utils/` for pure functions, `composables/` for stateful logic with refs, a component for shared markup.
- **Shadowed shared helpers**: a local function that re-implements something already exported from `utils/` or `composables/`. This is the cheapest win: delete the copy and import.
- **Repeated markup**: the same card, table, stat-card, badge or modal shell in several views. Compare the template structure, not just class names. Propose a component with props and slots; name the props.
- **Repeated data-loading patterns**: `loadX` + `loading`/`error` refs + a `watch` on the global filters repeated per view. Candidate for a composable.
- **Near-duplicates**: functions with the same name but different bodies are often a bug waiting to happen. Report them separately from identical copies.
- **Oversized components**: files over about 600 lines mixing several unrelated sections. Suggest split points along section boundaries (each should have a clear props-in, events-out interface).

### Performance: look for

- **Heavy work in the template**: method calls in `{{ }}` or in `v-for` that filter, sort, reduce or format large lists on every render. Move to `computed`.
- **Computed that mutates**: `.sort()`, `.reverse()`, `.splice()` on reactive state or props. Copy first with `[...arr]`.
- **Watchers**: `deep: true` on large objects, watchers that could be computeds, watchers that fire several fetches on one filter change (debounce or batch), missing cleanup for timers and listeners.
- **Waterfalls**: sequential `await api.x()` calls that do not depend on each other; use `Promise.all`. Check `onMounted` and filter watchers.
- **Over-fetching**: the same endpoint called from several components on mount; data that could be loaded once and shared.
- **Lists**: `v-for` without a stable `:key`, keyed by index, or `v-if` on the same element. Very long lists rendered in full (note pagination or virtual scroll as a later option, only if row counts justify it; the Orders table renders 250 rows).
- **Reactivity cost**: large static datasets held in deep `ref`; consider `shallowRef` when only the whole value is replaced. Only suggest this with a measured or obvious reason.
- **Bundle and load**: heavy components imported eagerly that are rarely shown (modals, rarely visited routes) could be lazy-loaded with `defineAsyncComponent` or dynamic `import()` in the router.
- **Styles**: large duplicated `<style>` blocks across components that belong in shared styles (`App.vue` holds the shared `.card`, `.stat-card`, `.badge`).

Do not recommend micro-optimizations without a reason. If a list has 9 rows, a computed is for clarity, not speed. Say when something is fine as is.

## 3. Project conventions to respect

- Components use the Composition API through `export default { setup() { ... return {...} } }`, not `<script setup>` (confirm against sibling files before suggesting a style change).
- Filters come from the `useFilters` composable; i18n from `useI18n`. Suggestions must not bypass them.
- Design system: slate/gray palette, no emojis in UI (see CLAUDE.md).
- Derived data belongs in `computed`; raw data in `ref`.
- Comment any non-obvious logic in suggested code (standing user preference).

## 4. Report

Keep it short and ranked. Use this shape:

```
## Summary
<2-3 sentences: overall shape of the codebase and the biggest opportunity>

## Quick wins (low risk, high value)
1. <title> - <files, with line refs> - <what to do> - <expected gain>

## Reuse opportunities
| What | Where it repeats | Proposed home | Notes |

## Performance
1. <issue> - <file:line> - <why it matters at this data size> - <fix>

## Larger refactors (need a decision)
- <split / extract> - <proposed boundaries and props/events> - <risk>

## Checked and fine
- <things the scanner flagged that are not real problems>
```

Rules for the report:

- Reference code as `path:line`.
- Rank by value over effort. Lead with deleting duplicates that already have a shared home.
- State impact honestly (lines removed, renders avoided). Do not claim speedups you did not measure.
- Separate **verified** (you read the code) from **suspected** (scanner lead only).
- Say what you did not examine (for example runtime behavior, because this is static analysis).

## 5. Applying changes

This skill only analyzes. If the user wants suggestions applied, any creation or significant edit of a `.vue` file **must go through the `vue-expert` subagent** (CLAUDE.md rule). Run the e2e suite (`cd tests/e2e && npm run e2e`) and `vite build` after such a refactor. Small edits to plain `.js` files under `utils/` or `composables/` can be done directly.
