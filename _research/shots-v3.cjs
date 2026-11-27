const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const outDir = resolve(process.argv[2] || "_research/v3-shots");
mkdirSync(outDir, { recursive: true });
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const prefix = process.argv[5] || "v3";
const desktop = width >= 900;

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
    await wait(340);
    const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(outDir, `${prefix}-${name}.png`), Buffer.from(data, "base64"));
    console.log(name, "saved");
  };
  const fillContacts = () => run(`(() => {
    for (const [id, value] of [['email','anna.k@mail.ru'],['phone','9001234567']]) {
      const field = document.getElementById(id); field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const consent = document.querySelector('#consent');
    if (!consent.checked) consent.click();
    return true;
  })()`);

  if (desktop) {
    await run("document.querySelector('[data-mode-btn=desktop]').click()");
    await wait(500);
  }

  await shot("afisha");
  await run("document.querySelector('#directEntry').click()");
  await wait(450);
  await shot("seats");
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click(); document.querySelector('.seat[data-key=\"4-7\"]').click()");
  await wait(350);
  await shot("seats-selected");
  await run("document.querySelector('#toCheckout').click()");
  await wait(450);
  await shot("checkout");
  await run("document.querySelector('#toPayment').click()");
  await wait(350);
  await shot("checkout-errors");
  await fillContacts();
  await run("document.querySelector('#toPayment').click()");
  await wait(450);
  await shot("payment");
  await run("document.querySelector('#changePayMethod').click()");
  await wait(350);
  await run("document.querySelector('[data-pay=sbp]').click()");
  await run("document.querySelector('#toPayment').click()");
  await wait(450);
  await shot("payment-sbp");
  await run("document.querySelector('#doPay').click()");
  await wait(1800);
  await shot("success");

  await run("document.querySelector('#restart').click()");
  await wait(450);
  await run("document.querySelector('#authBtn').click()");
  await wait(400);
  await shot("auth");
  await run("document.querySelector('[data-auth-to=phone]').click()");
  await wait(250);
  await shot("auth-phone");
  await run("document.querySelector('#authPhone').value='9001234567'; document.querySelector('#authPhoneForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await wait(400);
  await shot("auth-code");
  await run("document.querySelector('#authCode').value='1111'; document.querySelector('#authCodeForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await wait(300);
  await shot("auth-error");
  await run("document.querySelector('[data-auth-close]').click()");
  await wait(400);

  await run("document.querySelector('#directEntry').click()");
  await wait(350);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await run("document.querySelector('#toCheckout').click()");
  await fillContacts();
  await run("document.querySelector('#demoOutcome').value='error-pay'; document.querySelector('#toPayment').click()");
  await wait(350);
  await run("document.querySelector('#doPay').click()");
  await wait(1700);
  await shot("error-pay");

  await run("document.querySelector('#restart').click()");
  await wait(350);
  await run("document.querySelector('#directEntry').click()");
  await wait(350);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await run("document.querySelector('#toCheckout').click()");
  await fillContacts();
  await run("document.querySelector('#demoOutcome').value='expired'; document.querySelector('#toPayment').click()");
  await wait(350);
  await shot("expired");

  await run("document.querySelector('#restart').click()");
  await wait(350);
  await run("document.querySelector('.session[data-session=\"23:55\"]').click()");
  await wait(450);
  await shot("soldout");

  edge.kill();
})().catch(e => { console.error(e); edge.kill(); process.exitCode = 1; });
