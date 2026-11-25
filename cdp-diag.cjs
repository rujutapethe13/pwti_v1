const http = require("http");
const fs = require("fs");
const path = require("path");
const ws = require("C:\\powerweave-studio-os\\node_modules\\ws");
const { createClient } = require("C:\\powerweave-studio-os\\node_modules\\@supabase\\supabase-js");

const BASE = "http://127.0.0.1:9222";
const PRACTICE = "http://localhost:3000/practice-rvc5";
const NAME = "DIAG " + Date.now();
function jsonGet(p) { return new Promise((res, rej) => { http.get(BASE + p, r => { let b = ""; r.on("data", c => b += c); r.on("end", () => res(JSON.parse(b))); }).on("error", rej); }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  connect() { return new Promise((res, rej) => { this.ws = new ws(this.url); this.ws.on("open", () => res()); this.ws.on("message", d => { const m = JSON.parse(d.toString()); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } else if (m.method) { this.onEvent && this.onEvent(m); } }); this.ws.on("error", rej); }); }
  send(m, p = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout " + m)); } }, 20000); }); }
  async eval(e) { const r = await this.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result && r.result.result ? r.result.result.value : undefined; }
}
(async () => {
  const targets = await jsonGet("/json/list");
  const t = targets.find(x => x.type === "page") || (await jsonGet("/json/new?about:blank"));
  const cdp = new Cdp(t.webSocketDebuggerUrl);
  const consoleMsgs = [];
  const netFailures = [];
  cdp.onEvent = (m) => {
    if (m.method === "Runtime.consoleAPICalled") {
      const args = (m.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(" ");
      consoleMsgs.push(m.params.type + ": " + args);
    } else if (m.method === "Runtime.exceptionThrown") {
      consoleMsgs.push("EXCEPTION: " + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    } else if (m.method === "Network.loadingFailed") {
      netFailures.push(m.params.errorText + " " + m.params.type);
    }
  };
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Page.navigate", { url: PRACTICE });
  await sleep(9000);

  // Inspect rows
  const rowInfo = await cdp.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('[role="row"]'));
    return rows.map((r,i)=>{const inp=r.querySelector('[data-grid-col="0"] input');return i+':'+(inp?JSON.stringify(inp.value):'none');}).join(' ');
  })()`);
  console.log("Rows:", rowInfo);

  // Set value + Enter
  const nameJson = JSON.stringify(NAME);
  const res = await cdp.eval(`(() => {
    const rows = document.querySelectorAll('[role="row"]');
    let inp=null;
    for (const r of rows){ const c=r.querySelector('[data-grid-col="0"] input'); if(c){inp=c;break;} }
    if(!inp) return {ok:false};
    inp.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, ${nameJson});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    return {ok:true, valueNow: inp.value};
  })()`);
  console.log("Set result:", JSON.stringify(res));

  // Wait for network + console around the save
  await sleep(6000);

  const after = await cdp.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('[role="row"]'));
    return rows.map((r,i)=>{const inp=r.querySelector('[data-grid-col="0"] input');return i+':'+(inp?JSON.stringify(inp.value):'none');}).join(' ');
  })()`);
  console.log("Rows after:", after);

  console.log("\n=== Console (" + consoleMsgs.length + ") ===");
  consoleMsgs.slice(-40).forEach(m => console.log("  " + m));
  console.log("\n=== Network failures (" + netFailures.length + ") ===");
  netFailures.slice(-20).forEach(m => console.log("  " + m));

  // DB check
  const env = {};
  for (const line of fs.readFileSync(path.join("C:\\powerweave-studio-os", ".env.local"), "utf8").split("\n")) {
    const tt = line.trim(); if (!tt || tt.startsWith("#")) continue; const i = tt.indexOf("="); if (i === -1) continue; env[tt.slice(0, i).trim()] = tt.slice(i + 1).trim();
  }
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: dbRows } = await db.from("records").select("id,title").eq("board_id", "d95b661a-57e2-442d-bf06-73d72335788b").eq("title", NAME);
  console.log("\n=== DB rows with NAME:", dbRows ? dbRows.length : "err", "===");
  if (dbRows && dbRows.length) { await db.from("records").update({ title: "Untitled" }).in("id", dbRows.map(r=>r.id)); console.log("restored"); }
  process.exit(0);
})().catch(e => { console.error("DIAG ERROR:", e); process.exit(1); });