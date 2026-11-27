const { spawn } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", "--no-first-run", "--disable-gpu", "--no-sandbox",
  "--remote-debugging-pipe", "--user-data-dir=" + mkdtempSync(join(tmpdir(), "kinoqa-")),
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
  setTimeout(() => { if (pending.delete(id)) reject(new Error("Timed out: " + method)); }, 4500).unref();
});

(async () => {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: pathToFileURL(resolve(process.argv[2] || "prototype/index.html")).href });
  await wait(600);
  const run = async expression => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const screen = () => run("document.querySelector('.screen[data-active=true]').dataset.screen");
  const click = q => run(`document.querySelector(${JSON.stringify(q)}).click()`);
  assert.equal(await screen(), "afisha");
  await click("#directEntry");
  assert.equal(await screen(), "seats");
  assert.equal(await run("document.querySelector('[data-timer]').closest('.holdbar').hidden"), true);
  await click(".seat:not([data-taken=true])");
  assert.equal(await run("document.querySelector('[data-timer]').closest('.holdbar').hidden"), false);
  await click("#toCheckout");
  assert.equal(await screen(), "checkout");
  await click("#toPayment");
  assert.equal(await run("document.activeElement.id"), "email");
  await run(`for(const [id,value] of [['email','kino@example.com'],['phone','9001234567']]){
    const field = document.getElementById(id);field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));
  } document.querySelector('#consent').click(); true`);
  await run("document.querySelector('#demoOutcome').value='error-pay'");
  await click("#toPayment");
  await click("#doPay");
  assert.equal(await run("document.querySelector('#checking').hidden"), false);
  await wait(1650);
  assert.equal(await screen(), "error-pay");
  await click("[data-screen=error-pay] [data-nav=payment]");
  await click("#doPay");
  await wait(2600);
  assert.equal(await screen(), "success");
  assert.equal(await run("document.activeElement.className"), "success__title");
  assert.equal(await run("document.querySelectorAll('[data-screen=success] #qrTicket svg').length"), 1);
  await click("#orderDetails > summary");
  assert.equal(await run("document.querySelector('#orderDetails').open"), true);
  await click("#orderDetails > summary");
  assert.equal(await run("document.querySelector('#orderDetails').open"), false);
  const download = await run(`(async () => {
    const click = HTMLAnchorElement.prototype.click;
    let file;
    HTMLAnchorElement.prototype.click = function () {
      file = { name: this.download, content: fetch(this.href).then(response => response.text()) };
    };
    try {
      document.querySelector("#downloadTickets").click();
      return { name: file.name, content: await file.content };
    } finally {
      HTMLAnchorElement.prototype.click = click;
    }
  })()`);
  assert.equal(download.name, "kinoplan-КП-26084.html");
  assert.match(download.content, /Демо-билет/);
  assert.match(download.content, /Рокки — это я/);
  assert.match(download.content, /<svg /);
  await click("#directEntry");
  await click(".seat:not([data-taken=true])");
  await click("#toCheckout");
  await click(".payopt[data-pay=sbp]");
  await click("#toPayment");
  assert.equal(await screen(), "payment");
  assert.equal(await run("Boolean(document.querySelector('#qrCode svg'))"), true);
  await click("#doPay");
  await wait(2600);
  assert.equal(await screen(), "success");
  for (const outcome of ["expired", "error-seat"]) {
    await click("#directEntry");
    await click(".seat:not([data-taken=true])");
    await click("#toCheckout");
    await run(`document.querySelector('#demoOutcome').value=${JSON.stringify(outcome)}`);
    await click("#toPayment");
    assert.equal(await screen(), outcome);
  }
  await click("[data-pick-seats]");
  assert.equal(await screen(), "seats");
  assert.equal(await run("document.querySelectorAll('.seat[aria-pressed=true]').length"), 2);
  await click("#restart");
  await click(".session[data-film=rocky][data-session='17:05']");
  assert.equal(await screen(), "seats");
  await click('[data-mode-btn=desktop]');
  assert.equal(await run("document.getElementById('stage').dataset.mode"), "desktop");
  console.log("PASS: both entries, seat hold, validation, card failure and retry, SBP, expiry and conflict, desktop toggle");
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => edge.kill());
