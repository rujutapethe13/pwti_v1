const http = require("http");
const ws = require("C:\\powerweave-studio-os\\node_modules\\ws");
const BASE = "http://127.0.0.1:9222";
const PAGE_URL = process.argv[2] || "http://localhost:3000/practice-rvc5";
const PATHNAME = new globalThis.URL(PAGE_URL).pathname;

function jsonGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => { let b = ""; res.on("data", c => b += c); res.on("end", () => resolve(JSON.parse(b))); }).on("error", reject);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  connect() { return new Promise((res, rej) => { this.ws = new ws(this.url); this.ws.on("open", () => res()); this.ws.on("message", d => { const m = JSON.parse(d.toString()); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } }); this.ws.on("error", rej); }); }
  send(m, p = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout " + m)); } }, 25000); }); }
  async eval(e, retries = 5) {
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

(async () => {
  const targets = await jsonGet("/json/list");
  const pageTarget = (Array.isArray(targets) ? targets : []).find(x => x.type === "page");
  const t = pageTarget || (await jsonGet("/json/new?about:blank"));
  const cdp = new Cdp(t.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  // Capture console errors from the page for diagnostics.
  const jsErrors = [];
  cdp.ws.on("message", d => {
    const m = JSON.parse(d.toString());
    if (m.method === "Runtime.exceptionThrown") {
      jsErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || "exception");
    }
  });

  await cdp.send("Page.navigate", { url: PAGE_URL });
  await poll(cdp, `document.readyState === "complete" && window.location.pathname === ${JSON.stringify(PATHNAME)} ? "ok" : null`, 60000, "page load + correct path");
  await poll(cdp, `!!document.querySelector('[role="row"]') ? "rows" : null`, 30000, "board rows render");

  // Dump DOM structure of the first data row's first column to understand the title cell.
  const struct = await cdp.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('[role="row"]'));
    const out = [];
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      const cells = Array.from(rows[i].querySelectorAll('[data-grid-col]'));
      const c0 = cells.find(c => c.getAttribute('data-grid-col') === '0');
      if (!c0) { out.push('row' + i + ':no-col0'); continue; }
      out.push('row' + i + ' col0 html=' + c0.outerHTML.slice(0, 400));
    }
    return out.join('\\n====\\n');
  })()`);
  console.log("=== DOM STRUCTURE (col0 of first rows) ===");
  console.log(struct);
  console.log("=== JS errors so far: " + jsErrors.length + " ===");
  jsErrors.slice(0, 5).forEach(e => console.log("  ! " + e.split("\n")[0]));
  process.exit(0);
})().catch(e => { console.error("INSPECT ERROR:", e); process.exit(1); });