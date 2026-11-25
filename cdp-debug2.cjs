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
  sendRaw(payload) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, ...payload })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout")); } }, 20000); }); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const targets = await jsonGet("/json/list");
  const t = targets.find((x) => x.type === "page") || (await jsonGet("/json/new?about:blank"));
  console.log("target url:", t.url, "ws:", t.webSocketDebuggerUrl);
  const cdp = new Cdp(t.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.sendRaw({ method: "Page.enable" });
  await cdp.sendRaw({ method: "Runtime.enable" });
  const r1 = await cdp.sendRaw({ method: "Runtime.evaluate", params: { expression: "1+1", returnByValue: true } });
  console.log("eval 1+1:", JSON.stringify(r1));
  const r2 = await cdp.sendRaw({ method: "Runtime.evaluate", params: { expression: "window.location.href", returnByValue: true } });
  console.log("eval href:", JSON.stringify(r2));
  const ctxts = await cdp.sendRaw({ method: "Runtime.getExecutionContexts" });
  console.log("contexts:", JSON.stringify(ctxts));
  process.exit(0);
})().catch(e => { console.error("ERR", e); process.exit(1); });
