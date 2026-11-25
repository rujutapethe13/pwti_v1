const http = require("http");
const ws = require("C:\\powerweave-studio-os\\node_modules\\ws");
const BASE = "http://127.0.0.1:9222";
const PAGE_URL = "http://localhost:3000/practice-rvc5";
function jsonGet(p) { return new Promise((res, rej) => { http.get(BASE + p, r => { let b = ""; r.on("data", c => b += c); r.on("end", () => res(JSON.parse(b))); }).on("error", rej); }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  connect() { return new Promise((res, rej) => { this.ws = new ws(this.url); this.ws.on("open", () => res()); this.ws.on("message", d => { const m = JSON.parse(d.toString()); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } }); this.ws.on("error", rej); }); }
  send(m, p = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout " + m)); } }, 20000); }); }
  async eval(e) { const r = await this.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result && r.result.result ? r.result.result.value : undefined; }
}
(async () => {
  const targets = await jsonGet("/json/list");
  const t = targets.find(x => x.type === "page") || (await jsonGet("/json/new?about:blank"));
  const cdp = new Cdp(t.webSocketDebuggerUrl); await cdp.connect();
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: PAGE_URL });
  await sleep(7000);
  await sleep(2000);

  const rowInfo = await cdp.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('[role="row"]'));
    return rows.map((r, i) => {
      const c0 = r.querySelector('[data-grid-col="0"]');
      const inp = c0 && c0.querySelector('input');
      return i + ': input=' + (inp ? JSON.stringify(inp.value) : 'none') + ' rowHTMLhead=' + r.outerHTML.slice(0,60);
    }).join('\\n');
  })()`);
  console.log("=== ROWS ===");
  console.log(rowInfo);

  // Click New Item and capture dropdown option texts.
  const coords = await cdp.eval(`(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /New Item/i.test(x.textContent)); if(!b) return null; b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
  if (coords) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: coords.x, y: coords.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: coords.x, y: coords.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: coords.x, y: coords.y, button: "left", clickCount: 1 });
    await sleep(800);
    const menu = await cdp.eval(`(() => {
      const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] *, [data-radix-collection-item], button, li'));
      const texts = new Set();
      for (const it of items) { const t = (it.textContent||'').trim(); if (t && t.length < 40) texts.add(t); }
      return Array.from(texts).join(' | ');
    })()`);
    console.log("=== MENU/CLICKABLE TEXTS AFTER New Item ===");
    console.log(menu);
  } else {
    console.log("New Item button not found");
  }
  process.exit(0);
})().catch(e => { console.error("ERR", e); process.exit(1); });