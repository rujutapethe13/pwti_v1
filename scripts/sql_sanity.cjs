// Static sanity checks for the migration, since no Postgres is reachable here.
// Catches the classes of error that would only surface on the dashboard.
const fs = require("fs");

const file = process.argv[2];
const sql = fs.readFileSync(file, "utf8");

// Strip line comments and dollar-quoted bodies so we only count real structure.
function stripComments(text) {
  return text.replace(/--[^\n]*/g, "");
}

const noComments = stripComments(sql);

// 1. Dollar-quote tags must all pair up.
const tags = noComments.match(/\$\$|\$[a-z_0-9]*\$/gi) || [];
const counts = new Map();
for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
const unbalanced = [...counts.entries()].filter(([, n]) => n % 2 !== 0);

// 2. statement splitter: check we can find function boundaries
const fns = [...noComments.matchAll(/create or replace function\s+([\w.]+)\s*\(/gi)].map(
  (m) => m[1],
);

// 3. paren balance outside string literals (rough)
const stripped = noComments.replace(/'[^']*'/g, "''");
let depth = 0;
let minDepth = 0;
for (const ch of stripped) {
  if (ch === "(") depth++;
  else if (ch === ")") {
    depth--;
    if (depth < minDepth) minDepth = depth;
  }
}

// 4. 42P13: a defaulted param followed by a non-defaulted one.
const sigs = [...noComments.matchAll(
  /create or replace function\s+[\w.]+\s*\(([\s\S]*?)\)\s*returns/gi,
)];
const violations = [];
for (const m of sigs) {
  const params = m[1]
    .split(",")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  let seenDefault = false;
  for (const p of params) {
    const hasDefault = /\bdefault\b/i.test(p);
    if (hasDefault) seenDefault = true;
    else if (seenDefault) violations.push(`${m[0].slice(0, 60)}... -> "${p}"`);
  }
}

// 5. Bare ROW_COUNT. It is a diagnostics item, not a plpgsql variable, so any
//    use outside a GET DIAGNOSTICS assignment is a 42703 at runtime.
const bareRowCount = [];
noComments.split(/\n/).forEach((line, i) => {
  if (!/\brow_count\b/i.test(line)) return;
  if (/get\s+diagnostics/i.test(line)) return;
  bareRowCount.push(`line ${i + 1}: ${line.trim()}`);
});

// 6. GET DIAGNOSTICS targets must be declared variables in the same block.
const declared = new Set(
  [...noComments.matchAll(/\b(v_\w+)\s+(?:bigint|int|integer|text|jsonb|boolean)/gi)].map(
    (m) => m[1],
  ),
);
const undeclared = [];
for (const m of noComments.matchAll(
  /get\s+diagnostics\s+(v_\w+)\s*=\s*(row_count|pg_context)/gi,
)) {
  if (!declared.has(m[1])) undeclared.push(m[1]);
}

console.log("file:", file);
console.log("functions defined:", fns.length);
console.log("unbalanced dollar-quotes:", unbalanced.length ? unbalanced : "(none)");
console.log("paren balance:", depth === 0 && minDepth === 0 ? "ok" : `BAD depth=${depth} min=${minDepth}`);
console.log("42P13 param-order violations:", violations.length ? violations : "(none)");
console.log("bare ROW_COUNT uses:", bareRowCount.length ? bareRowCount : "(none)");
console.log(
  "GET DIAGNOSTICS with undeclared target:",
  undeclared.length ? [...new Set(undeclared)] : "(none)",
);

// 7. PL/pgSQL-only statements at the top level. `raise` outside a function body
// is a 42601 and took a real migration down, so it is worth catching here.
// `begin;`/`end;` are not checked: `end;` terminates a CASE expression just as
// legitimately as a transaction block, and the two are indistinguishable line-wise.
const topLevelPlpgsql = [];
let inBlock = false;
let openTag = null;

noComments.split(/\n/).forEach((line, i) => {
  const tags = line.match(/\$[a-z_0-9]*\$/gi) || [];
  for (const t of tags) {
    if (!inBlock) {
      inBlock = true;
      openTag = t;
    } else if (t === openTag) {
      inBlock = false;
      openTag = null;
    }
  }

  if (inBlock) return;

  const trimmed = line.trim();
  if (/^(raise|declare|commit|rollback|exception)\b/i.test(trimmed)) {
    topLevelPlpgsql.push(`line ${i + 1}: ${trimmed.slice(0, 60)}`);
  } else if (/^if\b.*\bthen\s*$/i.test(trimmed) || /^while\b.*\bdo\s*$/i.test(trimmed)) {
    topLevelPlpgsql.push(`line ${i + 1}: ${trimmed.slice(0, 60)}`);
  }
});

console.log(
  "top-level PL/pgSQL (42601):",
  topLevelPlpgsql.length ? topLevelPlpgsql : "(none)",
);