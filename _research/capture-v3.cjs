const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const outDir = resolve("audit/after/v3");
mkdirSync(outDir, { recursive: true });
const desktop = process.argv[2] === "desktop";
const width = desktop ? 1280 : 390;
const height = desktop ? 1000 : 896;
const prefix = desktop ? "desktop" : "mobile";

const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", "--no-first-run", "--disable-gpu", "--no-sandbox",
  "--remote-debugging-pipe", "--user-data-dir=" + mkdtempSync(join(tmpdir(), "kinocap-")),
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
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !desktop });
  await call("Page.navigate", { url: pathToFileURL(resolve("prototype/index.html")).href });
  await wait(900);
  const run = async expression => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async name => {
    await wait(420);
    const rect = await run(`(() => { const r = document.querySelector('.device').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
    const { data } = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      clip: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), scale: 2 },
    });
    writeFileSync(join(outDir, `${prefix}-${name}.png`), Buffer.from(data, "base64"));
    console.log(prefix, name, "saved", Math.round(rect.width) + "x" + Math.round(rect.height));
  };
  const fill = () => run(`(() => {
    for (const [id, value] of [['email','anna.k@mail.ru'],['phone','9001234567']]) {
      const f = document.getElementById(id); f.value = value; f.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const c = document.querySelector('#consent'); if (!c.checked) c.click();
    return true;
  })()`);

  if (desktop) { await run("document.querySelector('[data-mode-btn=desktop]').click()"); await wait(500); }

  await shot("01-afisha");
  await run("document.querySelector('#directEntry').click()");
  await wait(450);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click(); document.querySelector('.seat[data-key=\"4-7\"]').click()");
  await shot("02-seats-selected");
  await run("document.querySelector('#toCheckout').click()");
  await wait(450);
  await shot("03-checkout");
  await fill();
  await run("document.querySelector('#toPayment').click()");
  await wait(450);
  await shot("04-payment");
  await run("document.querySelector('#changePayMethod').click(); document.querySelector('[data-pay=sbp]').click(); document.querySelector('#toPayment').click()");
  await wait(450);
  await run("document.querySelector('.payment-qr').open = true");
  await shot("05-payment-sbp");
  await run("document.querySelector('#doPay').click()");
  await wait(1700);
  await shot("06-success");

  if (!desktop) {
    await run("document.querySelector('#restart').click()");
    await wait(400);
    await run("document.querySelector('#authBtn').click()");
    await shot("07-auth");
    await run("document.querySelector('[data-auth-close]').click()");
    await wait(350);
    await run("document.querySelector('#directEntry').click()");
    await wait(450);
    await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
    await run("document.querySelector('#toCheckout').click()");
    await fill();
    await run("document.querySelector('#demoOutcome').value='error-seat'; document.querySelector('#toPayment').click()");
    await wait(450);
    await shot("08-conflict");
  }

  edge.kill();
})().catch(e => { console.error(e); edge.kill(); process.exitCode = 1; });
