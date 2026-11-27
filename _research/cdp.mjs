// Minimal CDP driver — no deps, Node 24 built-in WebSocket.
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });

async function browserWs() {
  const v = await (await fetch("http://127.0.0.1:9222/json/version")).json();
  return v.webSocketDebuggerUrl;
}
async function listTargets() {
  return await (await fetch("http://127.0.0.1:9222/json/list")).json();
}

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error("ws error")); });
    const s = new Session(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && s.pending.has(msg.id)) {
        const { res, rej } = s.pending.get(msg.id);
        s.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) {
        for (const h of s.handlers) h(msg);
      }
    };
    return s;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error("timeout " + method)); } }, 45000);
    });
  }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

export async function attachPage(preferUrl = "kinowidget") {
  const bs = await Session.open(await browserWs());
  const { targetInfos } = await bs.send("Target.getTargets");
  const pages = targetInfos.filter((t) => t.type === "page" && !t.url.startsWith("chrome://"));
  let page = pages.find((t) => t.url.includes(preferUrl)) || pages[0];
  if (!page) {
    const { targetId } = await bs.send("Target.createTarget", { url: "about:blank" });
    page = { targetId };
  }
  const { sessionId } = await bs.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  const pageSession = { browser: bs, sessionId, targetId: page.targetId, send: (m, p) => bs.send(m, p, sessionId) };
  await pageSession.send("Page.enable");
  await pageSession.send("Runtime.enable");
  return pageSession;
}

export async function attachIframe(match = "kinowidget") {
  const bs = await Session.open(await browserWs());
  for (let i = 0; i < 30; i++) {
    const { targetInfos } = await bs.send("Target.getTargets");
    const t = targetInfos.find((x) => (x.type === "iframe" || x.type === "page") && x.url.includes(match) && x.url !== "about:blank");
    if (t) {
      const { sessionId } = await bs.send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
      const s = { browser: bs, sessionId, targetId: t.targetId, url: t.url, send: (m, p) => bs.send(m, p, sessionId) };
      await s.send("Runtime.enable");
      return s;
    }
    await sleep(500);
  }
  bs.close();
  throw new Error("iframe not found: " + match);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function evalIn(session, expression, awaitPromise = true) {
  const r = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 900));
  return r.result.value;
}

export async function screenshot(session, name, fullPage = false) {
  const params = { format: "png", captureBeyondViewport: fullPage };
  if (fullPage) {
    const { cssContentSize } = await session.send("Page.getLayoutMetrics");
    params.clip = { x: 0, y: 0, width: cssContentSize.width, height: Math.min(cssContentSize.height, 6000), scale: 1 };
  }
  const { data } = await session.send("Page.captureScreenshot", params);
  const p = path.join(OUT, name + ".png");
  fs.writeFileSync(p, Buffer.from(data, "base64"));
  return p;
}

export async function setViewport(session, width, height, mobile = true, dsf = 2) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: dsf, mobile,
    screenWidth: width, screenHeight: height,
  });
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
  await session.send("Emulation.setUserAgentOverride", {
    userAgent: mobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
    platform: mobile ? "iPhone" : "Win32",
    acceptLanguage: "ru-RU,ru;q=0.9,en;q=0.8",
  });
}

export async function goto(session, url, waitMs = 6000) {
  await session.send("Page.navigate", { url });
  await sleep(waitMs);
}

export async function saveHtml(session, name) {
  const html = await evalIn(session, "document.documentElement.outerHTML");
  const p = path.join(OUT, name + ".html");
  fs.writeFileSync(p, html);
  return p;
}

export async function clickByText(session, text, tagFilter = "button, a, [role=button], div[class*=btn], span[class*=btn]") {
  const expr = `(() => {
    const txt = ${JSON.stringify(text)};
    const els = [...document.querySelectorAll(${JSON.stringify(tagFilter)})];
    const visible = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const hit = visible.find(e => (e.innerText || e.textContent || "").trim().toLowerCase().includes(txt.toLowerCase()));
    if (!hit) return { ok: false, candidates: visible.slice(0, 40).map(e => (e.innerText||"").trim().slice(0,60)) };
    hit.scrollIntoView({ block: "center" });
    hit.click();
    return { ok: true, text: (hit.innerText || "").trim().slice(0, 80) };
  })()`;
  return await evalIn(session, expr);
}

export async function clickAt(session, x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await session.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  }
}

export async function clickSelector(session, selector) {
  return await evalIn(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false };
    el.scrollIntoView({ block: "center" });
    el.click();
    return { ok: true, text: (el.innerText || el.value || "").slice(0, 80) };
  })()`);
}

export { listTargets, OUT };
