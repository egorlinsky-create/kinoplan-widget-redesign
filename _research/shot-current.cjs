const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const outDir = resolve(process.argv[2] || "_research/v3-shots");
mkdirSync(outDir, { recursive: true });
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const prefix = process.argv[5] || "cur";

const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", "--no-first-run", "--disable-gpu", "--no-sandbox",
  "--remote-debugging-pipe", "--user-data-dir=" + mkdtempSync(join(tmpdir(), "kinoshot-")),
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
  setTimeout(() => { if (pending.delete(id)) reject(new Error("Timed out: " + method)); }, 6000).unref();
});
const fs = require("node:fs");

(async () => {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await call("Page.navigate", { url: pathToFileURL(resolve("prototype/index.html")).href });
  await wait(800);
  const run = async expression => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async name => {
    const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(outDir, `${prefix}-${name}.png`), Buffer.from(data, "base64"));
    console.log(name, "saved");
  };
  await shot("afisha");
  await run("document.querySelector('.session[data-film=rocky][data-session=\"17:05\"]').click()");
  await wait(450);
  await shot("seats");
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click();document.querySelector('.seat[data-key=\"4-7\"]').click()");
  await wait(450);
  await shot("seats-selected");
  await run("document.querySelector('#toCheckout').click()");
  await wait(450);
  await run(`for(const [id,value] of [['email','anna.k@mail.ru'],['phone','9001234567']]){const f=document.getElementById(id);f.value=value;f.dispatchEvent(new Event('input',{bubbles:true}));} document.querySelector('#consent').click(); true`);
  await shot("checkout");
  await run("document.querySelector('#toPayment').click()");
  await wait(450);
  await shot("payment");
  await run("document.querySelector('#doPay').click()");
  await wait(1650);
  await shot("success");
  edge.kill();
})().catch(e => { console.error(e); edge.kill(); process.exitCode = 1; });
