const http = require("http");
const ws = require("C:\\powerweave-studio-os\\node_modules\\ws");
const BASE = "http://127.0.0.1:9222";
const EMAIL = "email-rujutapethe@gmail.com";
const PASS = "klQU3HeINZXQexvittW9BXrN";

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
    for (let i = 0; i < 10; i++) {
      try {
        const r = await this.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("EXC " + JSON.stringify(r.exceptionDetails));
        const val = r.result && r.result.result ? r.result.result.value : undefined;
        if (val !== undefined) return val;
        last = "empty";
      } catch (err) { last = err.message; }
      await sleep(400);
    }
    throw new Error("eval failed (" + last + "): " + e);
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function poll(cdp, fn, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { const v = await cdp.eval(fn); if (v) return v; } catch { }
    await sleep(300);
  }
  return null;
}

(async () => {
  const targets = await jsonGet("/json/list");
  const t = targets.find((x) => x.type === "page") || (await jsonGet("/json/new?about:blank"));
  const cdp = new Cdp(t.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: "http://localhost:3000/signin" });
  const email = await poll(cdp, `document.querySelector('input#email, input[name="email"]') ? true : null`, 30000);
  console.log("email input ready:", !!email);
  const filled = await cdp.eval(`(() => {
    const email = document.querySelector('input#email, input[name="email"]');
    const pass = document.querySelector('input#password, input[name="password"]');
    if (!email || !pass) return false;
    email.focus(); email.value = ${JSON.stringify(EMAIL)}; email.dispatchEvent(new Event('input', {bubbles:true}));
    pass.focus(); pass.value = ${JSON.stringify(PASS)}; pass.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  })()`);
  console.log("filled:", filled);
  const submitted = await cdp.eval(`(() => {
    const form = document.querySelector('form');
    if (!form) return false;
    form.requestSubmit ? form.requestSubmit() : form.submit();
    return true;
  })()`);
  console.log("submitted:", submitted);
  await sleep(5000);
  console.log("after submit:", await cdp.eval("window.location.href"));
  console.log("title:", await cdp.eval("document.title"));
  console.log("text:", JSON.stringify((await cdp.eval("document.body.innerText || ''")).slice(0, 600)));
  process.exit(0);
})().catch(e => { console.error("ERR", e); process.exit(1); });
