const http = require("http");
const ws = require("C:\\powerweave-studio-os\\node_modules\\ws");
const BASE = "http://127.0.0.1:9222";
const PRACTICE = "http://localhost:3000/practice-rvc5";
const OTHER = "http://localhost:3000/data-74so";
const NAME = "E2E " + Date.now();

let failures = 0;
function check(cond, msg) { console.log((cond ? "PASS" : "FAIL") + " — " + msg); if (!cond) failures++; }

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
  async eval(e, retries = 5) {
    let last;
    for (let i = 0; i < retries; i++) {
      try {
        const r = await this.send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error("EXC " + JSON.stringify(r.exceptionDetails));
        const val = r.result && r.result.result ? r.result.result.value : undefined;
        if (val !== undefined) return val;
        last = "empty";
      } catch (err) { last = err.message; }
      await sleep(400);
    }
    throw new Error("eval failed after retries (" + last + "): " + e.slice(0, 80));
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function poll(cdp, fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const v = await cdp.eval(fn); if (v) return v; } catch { }
    await sleep(300);
  }
  throw new Error("poll timed out: " + label);
}

(async () => {
  const targets = await jsonGet("/json/list");
  const pageTarget = (Array.isArray(targets) ? targets : []).find((x) => x.type === "page");
  const t = pageTarget || (await jsonGet("/json/new?about:blank"));
  const cdp = new Cdp(t.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Input.enable");

  await cdp.send("Page.navigate", { url: PRACTICE });
  await sleep(8000);
  try {
    const readyState = await poll(cdp, `document.readyState === "complete" ? "complete" : null`, 60000, "page readyState complete");
    console.log("readyState:", readyState);
    const href = await poll(cdp, `window.location.pathname === "/practice-rvc5" ? window.location.pathname : null`, 60000, "practice board loads (via dev auto-login)");
    console.log("Landed on:", await cdp.eval("window.location.href"));
  } catch (e) {
    const actual = await cdp.eval("window.location.href").catch(() => "unknown");
    console.log("Still on:", actual);
    const bodyText = await cdp.eval(`document.body.innerText`).catch(() => "N/A");
    console.log("Body text:", bodyText.slice(0, 500));
    const innerHTML = await cdp.eval(`document.body.innerHTML`).catch(() => "N/A");
    console.log("Body innerHTML length:", innerHTML.length);
    console.log("Body innerHTML:", innerHTML.slice(0, 500));
    process.exit(1);
  }
  check(await cdp.eval("window.location.pathname") === "/practice-rvc5", "on practice board, not redirected to signin");

  try {
    const ready = await poll(cdp, `!!document.querySelector('[role="row"]')`, 30000, "board rows render");
    console.log("Board shell:", ready);
  } catch (e) {
    const bodyText = await cdp.eval(`document.body.innerText`).catch(() => "N/A");
    console.log("Body text:", bodyText.slice(0, 500));
    const innerHTML = await cdp.eval(`document.body.innerHTML`).catch(() => "N/A");
    console.log("Body innerHTML length:", innerHTML.length);
    console.log("Body innerHTML:", innerHTML.slice(0, 500));
    const jsErrors = await cdp.eval(`window.__jsErrors || []`).catch(() => "N/A");
    console.log("JS errors:", jsErrors);
    const url = await cdp.eval(`window.location.href`).catch(() => "unknown");
    console.log("URL:", url);
    process.exit(1);
  }

  // New Item - directly creates a row
  let clicked = await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /New Item/.test(b.textContent));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  // Find New Item button and click it via CDP mouse event
  const btnInfo = await cdp.eval(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /New Item/.test(b.textContent));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
  })()`);
  console.log("New Item button position:", btnInfo);
  if (btnInfo) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: btnInfo.x, y: btnInfo.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: btnInfo.x, y: btnInfo.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: btnInfo.x, y: btnInfo.y, button: "left", clickCount: 1 });
  }
  check(!!btnInfo, "New Item button clicked via CDP mouse event");
  await sleep(800);
  const menuVisible = await cdp.eval(`(() => {
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const t = all[i].textContent || '';
      if (t.trim() === 'At bottom of board') return true;
    }
    return false;
  })()`);
  console.log("Menu item visible after click:", menuVisible);

  clicked = await cdp.eval(`(() => {
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const t = all[i].textContent || '';
      if (t.trim() === 'At bottom of board') {
        const r = all[i].getBoundingClientRect();
        return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
      }
    }
    return null;
  })()`);
  if (clicked && clicked.x) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clicked.x, y: clicked.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clicked.x, y: clicked.y, button: "left", clickCount: 1 });
    clicked = true;
  } else {
    clicked = false;
  }
  check(clicked, "'At bottom of board' clicked via CDP mouse event");
  await sleep(8000);
  const rowCountAfter = await cdp.eval(`document.querySelectorAll('[role="row"]').length`);
  console.log("Row count after New Item:", rowCountAfter);
  const toastText = await cdp.eval(`Array.from(document.querySelectorAll('[data-toast], [role="alert"], .sonner-toast, [class*="toast"]')).map(e => e.textContent).join(" | ")`);
  console.log("Toast messages:", toastText);
  const allRowsText = await cdp.eval(`Array.from(document.querySelectorAll('[role="row"]')).map((r, i) => i + ": [" + Array.from(r.querySelectorAll('[data-grid-col]')).map(c => c.getAttribute('data-grid-col') + "=" + c.textContent.trim()).join("|") + "]").join(" || ")`);
  console.log("All row cells:", allRowsText);
  const inputs = await cdp.eval(`document.querySelectorAll('input').length`);
  console.log("Input count:", inputs);

  const nameForEval = JSON.stringify(NAME);
  const clickCoords = await cdp.eval(`(() => {
    const rows = document.querySelectorAll('[role="row"]');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const col0 = row.querySelector('[data-grid-col="0"]');
      const col6 = row.querySelector('[data-grid-col="6"]');
      if (col0 && col0.textContent.trim() === "" && col6 && col6.textContent.trim() === "Not Started") {
        const input = col0.querySelector('input');
        if (input) {
          const r = input.getBoundingClientRect();
          return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
        }
      }
    }
    return null;
  })()`);
  if (clickCoords && clickCoords.x !== undefined) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clickCoords.x, y: clickCoords.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: clickCoords.x, y: clickCoords.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickCoords.x, y: clickCoords.y, button: "left", clickCount: 1 });
    await sleep(500);
    await cdp.eval(`(() => {
      const rows = document.querySelectorAll('[role="row"]');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const col0 = row.querySelector('[data-grid-col="0"]');
        const col6 = row.querySelector('[data-grid-col="6"]');
        if (col0 && col0.textContent.trim() === "" && col6 && col6.textContent.trim() === "Not Started") {
          const input = col0.querySelector('input');
          if (input) {
            input.value = ${nameForEval};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            return true;
          }
        }
      }
      return false;
    })()`);
    clicked = true;
  } else {
    clicked = false;
  }
  check(clicked, "typed name into new row's title cell and pressed Enter");
  await sleep(2000);

  const saved = await poll(cdp, `(() => {
    const rows = document.querySelectorAll('[role="row"]');
    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i].querySelector('[data-grid-col="0"]');
      if (cell && cell.textContent.trim() === ${nameForEval}) return ${nameForEval};
    }
    return null;
  })()`, 15000, "cell shows saved name");
  check(saved === NAME, "cell retains name after commit (got: " + JSON.stringify(saved) + ")");
  const errText = await cdp.eval(`document.body.innerText`);
  check(!/Failed to save|save failed/i.test(errText), "no save error visible");

  await cdp.send("Page.navigate", { url: OTHER });
  await poll(cdp, `window.location.pathname === "/data-74so"`, 25000, "switched to other board");
  console.log("On:", await cdp.eval("window.location.pathname"));

  await cdp.send("Page.navigate", { url: PRACTICE });
  const backName = await poll(cdp, `(() => {
    const match = Array.from(document.querySelectorAll('[role="row"]')).find(row => {
      const cell = row.querySelector('[data-grid-col="0"]');
      return cell && cell.textContent.trim() === ${nameForEval};
    });
    return match ? ${nameForEval} : null;
  })()`, 20000, "back on Practice board");
  check(backName === NAME, "name still there after switching boards (got: " + JSON.stringify(backName) + ")");

  await cdp.send("Page.reload");
  await sleep(1000);
  const refreshed = await poll(cdp, `(() => {
    const match = Array.from(document.querySelectorAll('[role="row"]')).find(row => {
      const cell = row.querySelector('[data-grid-col="0"]');
      return cell && cell.textContent.trim() === ${nameForEval};
    });
    return match ? ${nameForEval} : null;
  })()`, 20000, "after page refresh");
  check(refreshed === NAME, "name still there after page refresh (got: " + JSON.stringify(refreshed) + ")");

  console.log("");
  console.log(failures === 0 ? "RESULT: PASS — all UI checks passed" : "RESULT: FAIL — " + failures + " check(s) failed");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("TEST ERROR:", e);
  process.exit(1);
});
