const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const outDir = resolve(process.argv[2] || "_research/v3-shots");
mkdirSync(outDir, { recursive: true });

const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", "--no-first-run", "--disable-gpu", "--no-sandbox",
  "--remote-debugging-pipe", "--user-data-dir=" + mkdtempSync(join(tmpdir(), "kinostates-")),
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
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url: pathToFileURL(resolve("prototype/index.html")).href });
  await wait(900);
  const run = async expression => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async name => {
    await wait(380);
    const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(outDir, `state-${name}.png`), Buffer.from(data, "base64"));
    console.log(name, "saved");
  };

  await run("document.querySelector('.date[data-empty=true]').click()");
  await shot("empty-date");
  await run("document.querySelector('.date[data-empty=true]').click()");
  await run("document.querySelector('#restart').click()");
  await wait(350);

  await run("document.querySelector('#directEntry').click()");
  await wait(350);
  await run("window.__demo.hint('4-6')");
  await shot("seat-tip");
  await run("window.__demo.hide()");
  await run("['4-6','4-7','4-8','5-6','5-7','5-8','6-6'].forEach(k=>document.querySelector('.seat[data-key=\"'+k+'\"]').click())");
  await shot("seat-limit");
  await run("document.querySelector('#restart').click()");
  await wait(300);

  await run("document.querySelector('#authBtn').click()");
  await wait(350);
  await run("document.querySelector('#authProvider').click()");
  await wait(800);
  await run("document.querySelector('#authBtn').click()");
  await wait(350);
  await shot("auth-profile");
  await run("document.querySelector('[data-auth-close]').click()");
  await wait(350);
  await run("document.querySelector('#directEntry').click()");
  await wait(350);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await run("document.querySelector('#toCheckout').click()");
  await wait(350);
  await shot("checkout-authorized");
  await run("document.querySelector('#consent').click(); document.querySelector('#demoOutcome').value='pending'; document.querySelector('#toPayment').click()");
  await wait(350);
  await shot("payment-checking");
  await wait(1300);
  await shot("payment-pending");
  await run("document.querySelector('#checkPayment').click()");
  await wait(1500);
  await shot("success-auth");

  await run("document.querySelector('#restart').click()");
  await wait(300);
  await run("document.querySelector('#directEntry').click()");
  await wait(300);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await run("document.querySelector('#toCheckout').click()");
  await run(`(() => { for (const [id, value] of [['email','anna.k@mail.ru'],['phone','9001234567']]) { const f=document.getElementById(id); f.value=value; f.dispatchEvent(new Event('input',{bubbles:true})); } const c=document.querySelector('#consent'); if(!c.checked) c.click(); })()`);
  await run("document.querySelector('[data-pay=sbp]').click(); document.querySelector('#toPayment').click()");
  await wait(350);
  await run("document.querySelector('.payment-qr').open = true");
  await shot("qr-open");

  await run("document.querySelector('#restart').click()");
  await wait(300);
  await run("document.querySelector('#directEntry').click()");
  await wait(300);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await run("document.querySelector('#toCheckout').click()");
  await run(`(() => { for (const [id, value] of [['email','anna.k@mail.ru'],['phone','9001234567']]) { const f=document.getElementById(id); f.value=value; f.dispatchEvent(new Event('input',{bubbles:true})); } const c=document.querySelector('#consent'); if(!c.checked) c.click(); })()`);
  await run("document.querySelector('#demoOutcome').value='error-seat'; document.querySelector('#toPayment').click()");
  await wait(350);
  await shot("error-seat");

  await run("document.querySelector('#restart').click()");
  await wait(300);
  await run("document.querySelector('#directEntry').click()");
  await wait(300);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await wait(200);
  await run("document.querySelector('[data-screen=\"seats\"] [data-back]').click()");
  await wait(350);
  await run("document.querySelector('.session[data-film=rocky][data-session=\"17:05\"]').click()");
  await wait(350);
  await shot("resume-order");

  await run("const b=document.querySelector('[data-resume-close]'); if(b) b.click();");
  await run("document.querySelector('#restart').click()");
  await wait(300);
  await run("document.querySelector('#directEntry').click()");
  await wait(300);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await wait(200);
  await run("Array.from(document.querySelectorAll('.seans-chip')).find(el => el.textContent.includes('16:00')).click()");
  await wait(350);
  await run("document.querySelectorAll('.seat:not([data-taken=true])')[0].click()");
  await wait(350);
  await shot("seat-switch-confirm");

  await run("const c=document.querySelector('#switchConfirm'); if(c) c.hidden=true;");
  await run("document.querySelector('#restart').click()");
  await wait(300);
  await run("document.querySelector('#directEntry').click()");
  await wait(300);
  await run("document.querySelector('.seat[data-key=\"4-6\"]').click()");
  await wait(200);
  await run("document.querySelector('#seatTrayToggle').click()");
  await wait(250);
  await shot("seats-tray-open");

  edge.kill();
})().catch(e => { console.error(e); edge.kill(); process.exitCode = 1; });
