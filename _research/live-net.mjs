// Снятие сети живого виджета: что за API, какие ответы. Дальше — подмена статуса оплаты.
// Запуск: node _research/live-net.mjs capture
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = path.join(import.meta.dirname, "net");
fs.mkdirSync(OUT, { recursive: true });
const Q = "?platform=widget&lang=ru&application_token=51859cc5bb6556ae4cdc19e92b5ff834";
const BASE = "https://kinowidget.kinoplan.ru";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    try {
      const v = await (await fetch("http://127.0.0.1:9222/json/version")).json();
      return v.webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error("browser not ready on 9222");
}

const edge = spawn(EDGE, [
  "--headless=new", "--no-first-run", "--disable-gpu", "--no-sandbox",
  "--remote-debugging-port=9222", "--user-data-dir=" + mkdtempSync(path.join(tmpdir(), "kwnet-")),
  "--window-size=390,844", "about:blank",
], { stdio: "ignore", windowsHide: true });

const rec = new Map();          // requestId -> запись
const log = [];                 // готовые записи с телами
const isApi = (u) => /kinowidget|kinoplan|api\./.test(u) && !/\.(png|jpe?g|webp|svg|css|woff2?|js)(\?|$)/i.test(u);

const bs = await Session.open(await browserWs());
const { targetId } = await bs.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await bs.send("Target.attachToTarget", { targetId, flatten: true });
const call = (m, p) => bs.send(m, p, sessionId);
bs.on(async (msg) => {
  try {
    if (msg.method === "Network.requestWillBeSent") {
      const r = msg.params.request;
      if (!isApi(r.url)) return;
      rec.set(msg.params.requestId, { url: r.url, method: r.method, post: r.postData, status: null, type: null });
    } else if (msg.method === "Network.responseReceived") {
      const e = rec.get(msg.params.requestId);
      if (e) { e.status = msg.params.response.status; e.type = msg.params.response.mimeType; }
    } else if (msg.method === "Network.loadingFinished") {
      const e = rec.get(msg.params.requestId);
      if (!e || e.status === null) return;
      rec.delete(msg.params.requestId);
      let body = null;
      try {
        const r = await call("Network.getResponseBody", { requestId: msg.params.requestId });
        body = r.base64Encoded ? Buffer.from(r.body, "base64").toString("utf8") : r.body;
      } catch { /* тело недоступно — не критично */ }
      log.push({ ...e, body: body ? body.slice(0, 4000) : null });
      console.log(`[${e.status}] ${e.method} ${e.url.replace(BASE, "")} ${body ? body.length + "b" : ""}`);
    }
  } catch { /* события не должны ронять прогон */ }
});

const ev = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};
const shot = async (name) => {
  const { data } = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
};
const tap = async (x, y) => {
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  await sleep(350);
};

await call("Page.enable");
await call("Runtime.enable");
await call("Network.enable");
await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

try {
  // 1. Афиша → ссылка на сеанс
  await call("Page.navigate", { url: `${BASE}/afisha/6440${Q}` });
  let href = null;
  for (let i = 0; i < 80 && !href; i++) {
    await sleep(500);
    href = await ev(`(() => { const a = [...document.querySelectorAll('a[href*="/seats/"]')].find(a => a.href); return a ? a.href : null; })()`);
  }
  if (!href) href = `${BASE}/seats/6440/24563/6b0021f4400000a900b147fc${Q}`;
  console.log("SEATS_URL:", href);
  await shot("01-afisha");

  // 2. Зал: подбор двух мест по canvas
  await call("Page.navigate", { url: href });
  await sleep(8000);
  await shot("02-hall");
  const c = await ev(`(() => { const el = document.querySelector('canvas'); if (!el) return null; const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  const counter = async () => Number((await ev(`document.body.innerText`)).match(/Билеты\s*\n?\s*(\d+)/)?.[1] || 0);
  let seats = 0;
  if (c) {
    for (let y = c.y + 260; y < c.y + c.h - 80 && seats < 2; y += 18) {
      for (let x = c.x + 60; x < c.x + c.w - 100 && seats < 2; x += 26) {
        await tap(x, y);
        const n = await counter();
        if (n > seats) seats = n;
      }
    }
  }
  console.log("SEATS:", seats);
  await shot("03-seats");

  // 3. Оформление
  const buy = await ev(`(() => { const b = document.querySelector('.buy-button'); if (!b) return null; const t = b.innerText; if (!/не выбраны/.test(t)) b.click(); return t; })()`);
  console.log("BUY:", buy);
  await sleep(5000);
  console.log("URL_CHECKOUT:", await ev("location.href"));
  await shot("04-checkout");
  const fields = await ev(`[...document.querySelectorAll('input')].map(i => ({ type: i.type, name: i.name, ph: i.placeholder, id: i.id }))`);
  console.log("INPUTS:", JSON.stringify(fields));

  // 4. Контакты: email, телефон вставкой (маска), согласия
  await ev(`(() => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
    const email = [...document.querySelectorAll('input')].find(i => i.type === 'email');
    if (email) { email.focus(); set(email, 'test@example.com'); email.blur(); }
    return true;
  })()`);
  await sleep(700);
  const phoneBox = await ev(`(() => { const i = [...document.querySelectorAll('input')].find(i => /900/.test(i.placeholder || '')); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, ph: i.placeholder }; })()`);
  console.log("PHONE_BOX:", JSON.stringify(phoneBox));
  if (phoneBox) {
    await tap(phoneBox.x, phoneBox.y);
    await call("Input.insertText", { text: "9001234567" });
    await sleep(800);
  }
  await ev(`document.querySelectorAll('input[type=checkbox]').forEach(ch => { if (!ch.checked) ch.click(); })`);
  await sleep(600);
  console.log("PHONE_VALUE:", await ev(`(() => { const i = [...document.querySelectorAll('input')].find(i => /900/.test(i.placeholder || '')); return i ? i.value : null; })()`));
  await shot("05-contacts");

  // 5. Продолжить → экран проверки/оплаты
  const cont = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Продолжить/.test(b.innerText)); if (!b) return null; const out = { dis: b.disabled, cls: b.className }; if (!b.disabled) b.click(); return out; })()`);
  console.log("CONTINUE:", JSON.stringify(cont));
  await sleep(7000);
  console.log("URL_PAY:", await ev("location.href"));
  await shot("06-payment");

  // 6. Что на экране оплаты и какие запросы он шлёт
  const payEls = await ev(`(() => {
    const out = [];
    document.querySelectorAll('button,[role=button],[class*=method],[class*=pay]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width < 2) return;
      out.push({ t: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60), dis: e.disabled || false, cls: (e.className || '').toString().slice(0, 50) });
    });
    return out.slice(0, 30);
  })()`);
  console.log("PAY_ELEMENTS:", JSON.stringify(payEls));

  fs.writeFileSync(path.join(OUT, "net-log.json"), JSON.stringify(log, null, 1));
  fs.writeFileSync(path.join(OUT, "endpoints.json"), JSON.stringify(
    [...new Set(log.map((e) => `${e.method} ${e.url.split("?")[0].replace(BASE, "")}`))].sort(), null, 1));
  console.log("SAVED:", log.length, "записей");
} catch (e) {
  console.error("ERR", e.message);
  try { fs.writeFileSync(path.join(OUT, "net-log.json"), JSON.stringify(log, null, 1)); await shot("99-error"); } catch {}
} finally {
  edge.kill();
  process.exit(0);
}
