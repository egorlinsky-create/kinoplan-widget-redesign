// Открыть экран успеха для конкретной продажи и снять, что виджет запрашивает.
// Запуск: node _research/live-success.mjs <saleId> <token>
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = path.join(import.meta.dirname, "net");
fs.mkdirSync(OUT, { recursive: true });
const [saleId, token = ""] = process.argv.slice(2);
const Q = "?platform=widget&lang=ru&application_token=51859cc5bb6556ae4cdc19e92b5ff834";
const BASE = "https://kinowidget.kinoplan.ru";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const name = process.argv[4] || "success";

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); });
    const s = new Session(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && s.pending.has(msg.id)) {
        const { res, rej } = s.pending.get(msg.id);
        s.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) for (const h of s.handlers) h(msg);
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
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error("timeout " + method)); }, 60000);
    });
  }
  on(fn) { this.handlers.push(fn); }
}

async function browserWs() {
  for (let i = 0; i < 60; i++) {
    try { return (await (await fetch("http://127.0.0.1:9222/json/version")).json()).webSocketDebuggerUrl; }
    catch { await sleep(250); }
  }
  throw new Error("browser not ready on 9222");
}

const edge = spawn(EDGE, ["--headless=new", "--no-first-run", "--disable-gpu", "--no-sandbox",
  "--remote-debugging-port=9222", "--user-data-dir=" + mkdtempSync(path.join(tmpdir(), "kwsuc-")),
  "--window-size=390,844", "about:blank"], { stdio: "ignore", windowsHide: true });

const rec = new Map();
const log = [];
const isApi = (u) => /kinokassa|kinowidget/.test(u) && !/\.(png|jpe?g|webp|svg|css|woff2?|js)(\?|$)/i.test(u);

const bs = await Session.open(await browserWs());
const { targetId } = await bs.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await bs.send("Target.attachToTarget", { targetId, flatten: true });
const call = (m, p) => bs.send(m, p, sessionId);
bs.on(async (msg) => {
  try {
    if (msg.method === "Network.requestWillBeSent") {
      const r = msg.params.request;
      if (!isApi(r.url)) return;
      rec.set(msg.params.requestId, { url: r.url, method: r.method, post: r.postData, headers: r.headers, status: null });
    } else if (msg.method === "Network.responseReceived") {
      const e = rec.get(msg.params.requestId);
      if (e) e.status = msg.params.response.status;
    } else if (msg.method === "Network.loadingFinished") {
      const e = rec.get(msg.params.requestId);
      if (!e || e.status === null) return;
      rec.delete(msg.params.requestId);
      let body = null;
      try {
        const r = await call("Network.getResponseBody", { requestId: msg.params.requestId });
        body = r.base64Encoded ? Buffer.from(r.body, "base64").toString("utf8") : r.body;
      } catch {}
      log.push({ ...e, body: body ? body.slice(0, 6000) : null });
      console.log(`[${e.status}] ${e.method} ${e.url.replace(BASE, "").split("?")[0]} ${body ? body.length + "b" : ""}`);
    }
  } catch {}
});

const ev = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};
const shot = async (n) => {
  const { data } = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, `${n}.png`), Buffer.from(data, "base64"));
};

await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

try {
  const url = token
    ? `${BASE}/payment/success/${saleId}${Q}`
    : `${BASE}/payment/success/${saleId}${Q}`;
  await call("Page.navigate", { url });
  await sleep(9000);
  console.log("URL:", await ev("location.href"));
  await shot(`${name}-mobile`);
  console.log("TEXT:", (await ev("document.body.innerText")).replace(/\s+/g, " ").slice(0, 700));
  const broken = await ev(`[...document.querySelectorAll('img')].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.currentSrc || i.src)`);
  console.log("BROKEN_IMGS:", JSON.stringify(broken));

  // десктоп
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  await shot(`${name}-desktop`);

  // скачать билет
  const dl = await ev(`(() => { const b = [...document.querySelectorAll('button,a')].find(e => /Скачать билет/.test(e.innerText || '')); if (!b) return null; const href = b.href || null; b.click(); return { tag: b.tagName, href }; })()`);
  console.log("DOWNLOAD:", JSON.stringify(dl));
  await sleep(6000);

  // экран проверки статуса
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await call("Page.navigate", { url: `${BASE}/payment/status${Q}` });
  await sleep(7000);
  await shot("status");
  console.log("STATUS_TEXT:", (await ev("document.body.innerText")).replace(/\s+/g, " ").slice(0, 400));

  const sale = log.find((e) => /\/api\/v4\/sale\//.test(e.url));
  if (sale) {
    console.log("SALE_KEYS:", Object.keys(JSON.parse(sale.body)).join(", "));
    console.log("SALE_BODY:", sale.body.slice(0, 3000));
  }
  fs.writeFileSync(path.join(OUT, `${name}-net.json`), JSON.stringify(log, null, 1));
} catch (e) {
  console.error("ERR", e.message);
} finally {
  edge.kill();
  process.exit(0);
}
