// Finds PL/pgSQL-only statements sitting at the top level of a SQL script,
// outside any dollar-quoted block. `raise` at top level is a 42601.
const fs = require("fs");

const files = process.argv.slice(2);
let problems = 0;

// `begin;` / `end;` are deliberately not checked: `end;` is how both a
// transaction block and a CASE expression terminate, and the two cannot be told
// apart line-wise. Neither construct is used in these migrations.
const PLPGSQL_TOP_LEVEL = [
  /^raise\b/i,
  /^declare\b/i,
  /^commit\b/i,
  /^rollback\b/i,
  /^exception\b/i,
  /^if\b.*\bthen\s*$/i,
  /^while\b.*\bdo\s*$/i,
];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  let inBlock = false;
  let tag = null;

  lines.forEach((raw, i) => {
    const line = raw.replace(/--.*$/, "");

    // Track dollar-quote nesting so function bodies are ignored.
    const tags = line.match(/\$[a-z_0-9]*\$/gi) ?? [];
    for (const t of tags) {
      if (!inBlock) {
        inBlock = true;
        tag = t;
      } else if (t === tag) {
        inBlock = false;
        tag = null;
      }
    }

    if (inBlock) return;

    const trimmed = line.trim();
    if (!trimmed) return;

    for (const pattern of PLPGSQL_TOP_LEVEL) {
      if (pattern.test(trimmed)) {
        console.log(`${file}:${i + 1}: top-level PL/pgSQL -> ${trimmed.slice(0, 70)}`);
        problems += 1;
        return;
      }
    }
  });
}

console.log(problems === 0 ? "no top-level PL/pgSQL found" : `${problems} problem(s)`);
process.exit(problems === 0 ? 0 : 1);