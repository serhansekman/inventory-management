#!/usr/bin/env node
// Static structure scan for Vue SFCs. Regex-based on purpose (no dependencies, runs anywhere Node does),
// so every number is a lead to verify by reading the file, not a verdict.
// Usage: node analyze.mjs [dir-or-file ...]   (default: client/src)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { createHash } from "node:crypto";

const roots = process.argv.slice(2);
if (roots.length === 0)
  roots.push(existsSync("client/src") ? "client/src" : ".");

const walk = (p, out = []) => {
  if (statSync(p).isFile()) {
    out.push(p);
    return out;
  }
  for (const e of readdirSync(p)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    walk(join(p, e), out);
  }
  return out;
};
const files = roots.flatMap((r) => walk(r));
const vueFiles = files.filter((f) => extname(f) === ".vue");
const jsFiles = files.filter((f) => [".js", ".ts"].includes(extname(f)));

const block = (src, tag) => {
  const m = src.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
};
const count = (s, re) => (s.match(re) || []).length;
const lines = (s) => (s ? s.split("\n").length : 0);
const norm = (s) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\/\/.*$/gm, "")
    .trim();
const hash = (s) =>
  createHash("sha1").update(norm(s)).digest("hex").slice(0, 8);

// Extract top-level-ish helper functions: `const name = (...) => {...}` and `function name(...) {...}`
const extractFns = (script) => {
  const fns = [];
  const re =
    /(?:const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:async\s+)?function\s+(\w+)\s*\([^)]*\))\s*(\{|[^\n{]+)/g;
  let m;
  while ((m = re.exec(script))) {
    const name = m[1] || m[2];
    let body = "";
    if (m[3] === "{") {
      let depth = 0,
        i = m.index + m[0].length - 1;
      for (; i < script.length; i++) {
        if (script[i] === "{") depth++;
        else if (script[i] === "}" && --depth === 0) break;
      }
      body = script.slice(m.index, i + 1);
    } else {
      body = m[0];
    }
    fns.push({ name, body, size: lines(body) });
  }
  return fns;
};

const report = { files: [], duplicates: [], shared: [], summary: {} };

// Shared modules that already exist (utils/composables) so duplicates can point at them
const sharedExports = {};
for (const f of jsFiles) {
  if (!/(utils|composables)\//.test(f)) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(
    /export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g,
  )) {
    sharedExports[m[1]] = relative(process.cwd(), f);
  }
}

const allFns = new Map(); // name -> [{file, hash, size}]
for (const f of vueFiles) {
  const src = readFileSync(f, "utf8");
  const tpl = block(src, "template"),
    script = block(src, "script"),
    style = block(src, "style");
  const rel = relative(process.cwd(), f);
  const findings = [];

  const vFor = [...tpl.matchAll(/<[^>]*\sv-for="[^"]*"[^>]*>/g)].map(
    (m) => m[0],
  );
  const noKey = vFor.filter((t) => !/:key=|v-bind:key=/.test(t)).length;
  const idxKey = vFor.filter(
    (t) =>
      /v-for="\(\s*\w+\s*,\s*(\w+)\s*\)[^"]*"/.test(t) &&
      new RegExp(
        `:key="${(t.match(/v-for="\(\s*\w+\s*,\s*(\w+)\s*\)/) || [])[1]}"`,
      ).test(t),
  ).length;
  const ifWithFor = vFor.filter((t) => /\sv-if=/.test(t)).length;
  const inlineHandlers = count(tpl, /@\w+(?:\.\w+)*="[^"]*(?:=|\(.*\))[^"]*"/g);
  // Method calls in {{ }} re-run on every render. t() translations and format*/translate* helpers are cheap
  // and idiomatic here, so only count other calls.
  const tplCalls = [...tpl.matchAll(/\{\{([^}]*)\}\}/g)].reduce(
    (n, m) =>
      n +
      [...m[1].matchAll(/(?<![.\w])(\w+)\(/g)].filter(
        (c) => !/^(t|format\w*|translate\w*)$/.test(c[1]),
      ).length,
    0,
  );
  const tables = count(tpl, /<table\b/g);
  const cards = count(tpl, /class="[^"]*\bcard\b/g);

  const refs = count(script, /\bref\(/g);
  const computeds = count(script, /\bcomputed\(/g);
  const watches = count(script, /\bwatch(?:Effect)?\(/g);
  const deepWatch = count(script, /deep:\s*true/g);
  const onMounted = count(script, /\bonMounted\(/g);
  const apiCalls = count(script, /\bapi\.\w+\(/g);
  const imports = [
    ...script.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.vue)['"]/g),
  ].map((m) => m[1]);
  const usesOptionsSetup = /export default\s*\{[\s\S]*setup\s*\(/.test(script);
  const scriptSetup = /<script\s+setup/.test(src);
  // Only a bare identifier receiver (`items.value.sort(`) mutates existing state; `.filter(...).sort(` and
  // `[...x].sort(` operate on a fresh array and are fine
  const sortNoCopy = count(script, /\w\.sort\(/g);
  const sequentialAwaits = count(
    script,
    /await\s+api\.\w+\([^)]*\)\s*\n\s*(?:const|let)?\s*[\w.\[\]]*\s*=?\s*await\s+api\./g,
  );
  const promiseAll = count(script, /Promise\.all/g);

  const fns = extractFns(script);
  for (const fn of fns) {
    if (!allFns.has(fn.name)) allFns.set(fn.name, []);
    allFns.get(fn.name).push({ file: rel, hash: hash(fn.body), size: fn.size });
  }

  if (lines(src) > 600)
    findings.push(
      `large file (${lines(src)} lines): candidate to split into child components`,
    );
  if (noKey) findings.push(`${noKey} v-for without :key`);
  if (idxKey)
    findings.push(
      `${idxKey} v-for keyed by index (use a stable id: sku, id, month)`,
    );
  if (ifWithFor)
    findings.push(
      `${ifWithFor} element(s) with v-if and v-for together (filter in a computed instead)`,
    );
  if (tables > 1)
    findings.push(
      `${tables} tables in one view: repeated table markup is a reuse candidate`,
    );
  if (tplCalls > 3)
    findings.push(
      `${tplCalls} non-formatter function calls inside {{ }}: re-run every render, move heavy work to a computed`,
    );
  if (deepWatch)
    findings.push(
      `${deepWatch} deep watcher(s): check if a narrower source works`,
    );
  if (sortNoCopy > 0)
    findings.push(
      `${sortNoCopy} .sort() without a copy: mutates reactive state, copy first with [...arr]`,
    );
  if (apiCalls >= 2 && !promiseAll && apiCalls > onMounted * 3)
    findings.push(
      `${apiCalls} api calls, no Promise.all: independent requests may be parallelizable`,
    );
  if (!scriptSetup && !usesOptionsSetup)
    findings.push("no setup(): check API style consistency with sibling files");

  report.files.push({
    file: rel,
    lines: lines(src),
    templateLines: lines(tpl),
    scriptLines: lines(script),
    styleLines: lines(style),
    refs,
    computeds,
    watches,
    tables,
    cards,
    vFor: vFor.length,
    apiCalls,
    childComponents: imports,
    findings,
  });
}

for (const [name, uses] of allFns) {
  const files = new Set(uses.map((u) => u.file));
  if (files.size < 2) continue;
  const byHash = {};
  for (const u of uses) (byHash[u.hash] ||= []).push(u.file);
  const identical = Object.values(byHash).filter((v) => new Set(v).size > 1);
  report.duplicates.push({
    name,
    files: [...files],
    identicalBodies: identical.length > 0,
    existingSharedHelper: sharedExports[name] || null,
  });
}
for (const [name, path] of Object.entries(sharedExports)) {
  const localCopies = (allFns.get(name) || []).map((u) => u.file);
  if (localCopies.length)
    report.shared.push({
      helper: name,
      definedIn: path,
      shadowedIn: localCopies,
    });
}

const fmt = (n) => String(n).padStart(5);
const out = [];
out.push("# Vue structure scan", "");
out.push(
  `${vueFiles.length} components, ${vueFiles.reduce((a, _, i) => a + report.files[i].lines, 0)} lines total`,
  "",
);
out.push(
  "| file | lines | tpl | script | style | refs | computed | watch | tables | v-for | api |",
);
out.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of [...report.files].sort((a, b) => b.lines - a.lines)) {
  out.push(
    `| ${basename(r.file)} |${fmt(r.lines)} |${fmt(r.templateLines)} |${fmt(r.scriptLines)} |${fmt(r.styleLines)} |${fmt(r.refs)} |${fmt(r.computeds)} |${fmt(r.watches)} |${fmt(r.tables)} |${fmt(r.vFor)} |${fmt(r.apiCalls)} |`,
  );
}
out.push("", "## Per-file findings (leads to verify)");
for (const r of report.files)
  if (r.findings.length)
    out.push(`- **${r.file}**`, ...r.findings.map((f) => `  - ${f}`));
out.push("", "## Helpers duplicated across files");
if (!report.duplicates.length) out.push("- none");
for (const d of report.duplicates) {
  out.push(
    `- \`${d.name}\` in ${d.files.length} files (${d.identicalBodies ? "identical bodies" : "differing bodies"})${d.existingSharedHelper ? `; shared helper already exists: ${d.existingSharedHelper}` : ""}`,
  );
  for (const f of d.files) out.push(`  - ${f}`);
}
out.push("", "## Existing shared helpers shadowed by local copies");
if (!report.shared.length) out.push("- none");
for (const s of report.shared)
  out.push(
    `- \`${s.helper}\` (${s.definedIn}) re-implemented in: ${s.shadowedIn.join(", ")}`,
  );

if (process.env.FORMAT === "json") console.log(JSON.stringify(report, null, 2));
else console.log(out.join("\n"));
