const http = require("http");
const ws = require("C:\\powerweave-studio-os\\node_modules\\ws");
const BASE = "http://127.0.0.1:9222";

function jsonGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve(JSON.parse(b)));
    }).on("error", reject);
  });
}

class Cdp {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); }
  connect() { return new Promise((res, rej) => { this.ws = new ws(this.url); this.ws.on("open", () => res()); this.ws.on("message", d => { const m = JSON.parse(d.toString()); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } }); this.ws.on("error", rej); }); }
  send(m, p = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout " + m)); } }, 25000); }); }
  async eval(e) {
    let last;
    for (let i = 0; i < 8; i++) {
      try {
        const r = await this.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("EXC " + JSON.stringify(r.exceptionDetails));
        if (r.result && r.result.value !== undefined) return r.result.value;
        last = "empty";
      } catch (err) { last = err.message; }
      await sleep(400);
    }
    throw new Error("eval failed (" + last + "): " + e);
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const targets = await jsonGet("/json/list");
  const t = targets.find((x) => x.type === "page") || (await jsonGet("/json/new?about:blank"));
  const cdp = new Cdp(t.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: "http://localhost:3000/practice-rvc5" });
  for (let i = 0; i < 60; i++) {
    try {
      const v = await cdp.eval("window.location.href");
      console.log(i, v);
      if (v && v.includes("/practice-rvc5")) { console.log("REACHED PRACTICE"); break; }
    } catch (e) { console.log(i, "ERR", e.message.slice(0, 100)); }
    await sleep(1000);
  }
  try { console.log("title:", await cdp.eval("document.title")); } catch (e) { console.log("title err", e.message); }
  try { console.log("text:", JSON.stringify((await cdp.eval("document.body.innerText || ''")).slice(0, 500))); } catch (e) { console.log("text err", e.message); }
  process.exit(0);
})().catch(e => { console.error("ERR", e); process.exit(1); });
