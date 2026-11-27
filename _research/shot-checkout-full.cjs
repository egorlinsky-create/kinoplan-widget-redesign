const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const outDir = resolve(process.argv[2] || "_research/review-shots");
mkdirSync(outDir, { recursive: true });
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);

const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", "--no-first-run", "--disable-gpu", "--no-sandbox",
  "--remote-debugging-pipe", "--user-data-dir=" + mkdtempSync(join(tmpdir(), "kinofull-")),
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], windowsHide: true });

let cursor = 0, buffer = "";
const pending = new Map();
edge.stderr.on("data", b => process.stderr.write(b));
edge.stdio[4].on("data", data => {
  buffer += data.toString();
  let end;
  while ((end = buffer.indexOf("\0")) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    const cb = pending.get(msg.id);
    if (cb) { pending.delete(msg.id); msg.error ? cb.reject(new Error(JSON.stringify(msg.error))) : cb.resolve(msg.result); }
  }
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++cursor;
  pending.set(id, { resolve, reject });
  edge.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
  setTimeout(() => { if (pending.delete(id)) reject(new Error("Timed out: " + method)); }, 8000).unref();
});

(async () => {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await call("Page.navigate", { url: pathToFileURL(resolve("prototype/index.html")).href });
  await wait(900);
  const run = async expression => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async name => {
    await wait(300);
    const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(outDir, `${width}-${name}.png`), Buffer.from(data, "base64"));
    console.log(width, name, "saved");
  };
  if (width >= 900) { await run("document.querySelector('[data-mode-btn=desktop]').click()"); await wait(500); }
  await run("document.querySelector('#directEntry').click()");
  await wait(350);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await run("document.querySelector('#toCheckout').click()");
  await wait(350);
  await shot("checkout-top");
  await run("document.querySelector('#toPayment').click()");
  await wait(300);
  await shot("checkout-error-top");
  await run("document.querySelector('.screen[data-screen=checkout] .screen__scroll').scrollTop = 9999");
  await shot("checkout-bottom");
  await run(`(() => { for (const [id, value] of [['email','anna.k@mail.ru'],['phone','9001234567']]) { const f=document.getElementById(id); f.value=value; f.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
  await run("document.querySelector('#toPayment').click()");
  await wait(600);
  await shot("checkout-consent-error");
  await run("document.querySelector('#consent').click()");
  await run("document.querySelector('#toPayment').click()");
  await wait(350);
  await shot("payment");
  edge.kill();
})().catch(e => { console.error(e); edge.kill(); process.exitCode = 1; });
