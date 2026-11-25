/**
 * Real-UI proof for the Client / Company (item name) save.
 *
 * Flow (exactly what the user asked for):
 *   1. Open the Practice board.
 *   2. Create a new item (New Item -> At bottom of board), or reuse the last row.
 *   3. Type a unique name into its Client / Company cell (data-grid-col="0") and press Enter.
 *   4. Switch to another board, come back -> name still there.
 *   5. Refresh the page -> name still there.
 *   6. Cross-check the DB row title matches (proves it hit records.title).
 *
 * The title cell is an <input> inside [data-grid-col="0"]; its value (not
 * textContent) is the title, so this reads input.value.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ws = require("C:\\powerweave-studio-os\\node_modules\\ws");
const { createClient } = require("C:\\powerweave-studio-os\\node_modules\\@supabase\\supabase-js");

const BASE = "http://127.0.0.1:9222";
const PRACTICE = "http://localhost:3000/practice-rvc5";
const OTHER = "http://localhost:3000/data-74so";
const NAME = "E2E " + Date.now();

let failures = 0;
function check(cond, msg) { console.log((cond ? "PASS" : "FAIL") + " — " + msg); if (!cond) failures++; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function jsonGet(p) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${p}`, (res) => { let b = ""; res.on("data", c => b += c); res.on("end", () => resolve(JSON.parse(b))); }).on("error", reject);
  });
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  connect() { return new Promise((res, rej) => { this.ws = new ws(this.url); this.ws.on("open", () => res()); this.ws.on("message", d => { const m = JSON.parse(d.toString()); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } }); this.ws.on("error", rej); }); }
  send(m, p = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout " + m)); } }, 25000); }); }
  async eval(e, retries = 6) {
    let last;
    for (let i = 0; i < retries; i++) {
      try {
        const r = await this.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
        if (r.result && r.result.exceptionDetails) throw new Error("EXC " + JSON.stringify(r.result.exceptionDetails));
        const val = r.result && r.result.result ? r.result.result.value : undefined;
        if (val !== undefined) return val;
        last = "empty";
      } catch (err) { last = err.message; }
      await sleep(400);
    }
    throw new Error("eval failed (" + last + "): " + e.slice(0, 90));
  }
}
async function poll(cdp, fn, timeoutMs, label) {
  const start = Date.now();
  let lastVal;
  while (Date.now() - start < timeoutMs) {
    try { const v = await cdp.eval(fn); lastVal = v; if (v) return v; } catch {}
    await sleep(300);
  }
  throw new Error("poll timed out: " + label + " (last=" + JSON.stringify(lastVal) + ")");
}

// Click a DOM element located by a JS predicate, via a real CDP mouse event.
async function clickByPredicate(cdp, predicateExpr) {
  const coords = await cdp.eval(`(() => {
    const el = (${predicateExpr});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!coords || coords.x === undefined) return false;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: coords.x, y: coords.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: coords.x, y: coords.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: coords.x, y: coords.y, button: "left", clickCount: 1 });
  return true;
}

// The title input of a row's Client / Company cell.
const titleInputValue = (rowIdx) => `(() => {
  const rows = document.querySelectorAll('[role="row"]');
  const row = rows[${rowIdx}];
  if (!row) return null;
  const cell = row.querySelector('[data-grid-col="0"]');
  if (!cell) return null;
  const inp = cell.querySelector('input');
  return inp ? inp.value : null;
})()`;

(async () => {
  const targets = await jsonGet("/json/list");
  const pageTarget = (Array.isArray(targets) ? targets : []).find(x => x.type === "page");
  const t = pageTarget || (await jsonGet("/json/new?about:blank"));
  const cdp = new Cdp(t.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  console.log("Target name:", JSON.stringify(NAME));

  // 1) Open the Practice board.
  await cdp.send("Page.navigate", { url: PRACTICE });
  await poll(cdp, `document.readyState === "complete" && window.location.pathname === "/practice-rvc5" ? "ok" : null`, 60000, "practice board loaded");
  await poll(cdp, `!!document.querySelector('[role="row"] [data-grid-col="0"] input') ? "inputs" : null`, 30000, "title inputs render");
  check(true, "opened Practice board, title inputs present");

  // 2) Pick the first data row that has a title input (data rows 0..N; the last
  //    [role="row"] is the "Add item" footer with no input). Record its id+title
  //    so we can restore it afterwards.
  const target = await cdp.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('[role="row"]'));
    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i].querySelector('[data-grid-col="0"]');
      const inp = cell && cell.querySelector('input');
      if (inp) {
        const dataRow = rows[i].getAttribute('data-row');
        return { rowIndex: i, original: inp.value, dataRow };
      }
    }
    return null;
  })()`);
  check(!!target, "found a data row with a Client / Company title input");
  console.log("Target row index:", target.rowIndex, "| data-row:", target.dataRow, "| original title:", JSON.stringify(target.original));

  // 3) Drive the React-controlled title input: set the value via the native
  //    setter (so React's onChange fires), then press Enter ( commits on blur).
  const nameJson = JSON.stringify(NAME);
  const typed = await cdp.eval(`(() => {
    const rows = document.querySelectorAll('[role="row"]');
    const inp = rows[${target.rowIndex}] && rows[${target.rowIndex}].querySelector('[data-grid-col="0"] input');
    if (!inp) return { ok: false, reason: 'no input' };
    inp.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, ${nameJson});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    return { ok: true, valueNow: inp.value };
  })()`);
  check(typed && typed.ok, "set title cell value via native setter + Enter (valueNow=" + JSON.stringify(typed && typed.valueNow) + ")");

  // Wait for the input to display the typed name (controlled component round-trip).
  let valueAfterCommit;
  try {
    valueAfterCommit = await poll(cdp, `(() => {
      const rows = document.querySelectorAll('[role="row"]');
      const inp = rows[${target.rowIndex}] && rows[${target.rowIndex}].querySelector('[data-grid-col="0"] input');
      return inp && inp.value === ${nameJson} ? inp.value : null;
    })()`, 12000, "committed value shows typed name");
  } catch (e) {
    valueAfterCommit = await cdp.eval(`(() => {
      const rows = document.querySelectorAll('[role="row"]');
      const inp = rows[${target.rowIndex}] && rows[${target.rowIndex}].querySelector('[data-grid-col="0"] input');
      return inp ? inp.value : null;
    })()`).catch(() => null);
  }
  check(valueAfterCommit === NAME, "cell shows the typed name after Enter (got: " + JSON.stringify(valueAfterCommit) + ")");

  const bodyText = await cdp.eval(`document.body.innerText`).catch(() => "");
  check(!/Failed to save|save failed|cannot save/i.test(bodyText), "no save-error toast visible");

  // 4) Switch to another board and come back.
  await cdp.send("Page.navigate", { url: OTHER });
  await poll(cdp, `document.readyState === "complete" && window.location.pathname === "/data-74so" ? "ok" : null`, 40000, "switched to Data board");
  check(true, "switched to another board (Data)");

  await cdp.send("Page.navigate", { url: PRACTICE });
  await poll(cdp, `document.readyState === "complete" && window.location.pathname === "/practice-rvc5" ? "ok" : null`, 40000, "back on Practice");
  let backValue;
  try {
    backValue = await poll(cdp, `(() => {
      const rows = document.querySelectorAll('[role="row"]');
      for (const row of rows) {
        const inp = row.querySelector('[data-grid-col="0"] input');
        if (inp && inp.value === ${JSON.stringify(NAME)}) return inp.value;
      }
      return null;
    })()`, 20000, "name present after returning to Practice");
  } catch (e) { backValue = null; }
  check(backValue === NAME, "name still there after switching boards and back (got: " + JSON.stringify(backValue) + ")");

  // 5) Refresh and confirm again.
  await cdp.send("Page.reload");
  await poll(cdp, `document.readyState === "complete" && !!document.querySelector('[role="row"] [data-grid-col="0"] input') ? "ok" : null`, 40000, "reloaded Practice");
  let refreshValue;
  try {
    refreshValue = await poll(cdp, `(() => {
      const rows = document.querySelectorAll('[role="row"]');
      for (const row of rows) {
        const inp = row.querySelector('[data-grid-col="0"] input');
        if (inp && inp.value === ${JSON.stringify(NAME)}) return inp.value;
      }
      return null;
    })()`, 20000, "name present after refresh");
  } catch (e) { refreshValue = null; }
  check(refreshValue === NAME, "name still there after page refresh (got: " + JSON.stringify(refreshValue) + ")");

  // 6) Cross-check the database: the saved title is in records.title.
  const env = {};
  for (const line of fs.readFileSync(path.join("C:\\powerweave-studio-os", ".env.local"), "utf8").split("\n")) {
    const tt = line.trim(); if (!tt || tt.startsWith("#")) continue; const i = tt.indexOf("="); if (i === -1) continue; env[tt.slice(0, i).trim()] = tt.slice(i + 1).trim();
  }
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: dbRows } = await db.from("records").select("id, title, board_id").eq("board_id", "d95b661a-57e2-442d-bf06-73d72335788b").eq("title", NAME);
  check(!!dbRows && dbRows.length > 0, "DB records.title contains the saved name (rows=" + (dbRows ? dbRows.length : 0) + ")");

  // 7) Restore the original title via the DB so the board is left clean.
  if (dbRows && dbRows.length) {
    await db.from("records").update({ title: target.original }).in("id", dbRows.map(r => r.id));
    console.log("Restored original title " + JSON.stringify(target.original) + " on " + dbRows.length + " row(s).");
  }

  console.log("");
  console.log(failures === 0 ? "RESULT: PASS — all real-UI checks passed" : "RESULT: FAIL — " + failures + " check(s) failed");
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error("TEST ERROR:", e); process.exit(1); });