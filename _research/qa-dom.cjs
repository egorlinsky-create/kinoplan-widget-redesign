const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { runInNewContext } = require("node:vm");

const folder = mkdtempSync(join(tmpdir(), "kinoplan-qa-"));
const input = readFileSync("KINOPLAN-PROTOTYPE.html", "utf8");
for (const match of input.matchAll(/<script>([\s\S]*?)<\/script>/g))
  new (require("node:vm").Script)(match[1]);
const test = `<script>
const status = document.createElement('output'); status.id = 'qa-result'; document.body.append(status);
const q = s => document.querySelector(s);
const tap = s => q(s).click();
const screen = () => q('.screen[data-active=true]').dataset.screen;
const check = (a,b,label) => { if (a !== b) throw new Error(label+': '+a+' != '+b); };
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
(async () => {
  check(screen(),'afisha','general entry');
  tap('#directEntry'); check(screen(),'seats','direct entry');
  check(q('[data-timer]').closest('.holdbar').hidden,true,'clock empty');
  tap('.seat:not([data-taken=true])'); check(q('[data-timer]').closest('.holdbar').hidden,false,'clock selected');
  tap('#toCheckout'); check(screen(),'checkout','order');
  tap('#toPayment'); check(document.activeElement.id,'email','validation focus');
  for(const [id,value] of [['email','kino@example.com'],['phone','9001234567']]){
    const f=document.getElementById(id); f.value=value; f.dispatchEvent(new Event('input',{bubbles:true}));
  }
  tap('#consent');
  q('#demoOutcome').value='error-pay';
  tap('#toPayment'); tap('#doPay');
  check(q('#checking').hidden,false,'checking');
  await wait(1550); check(screen(),'error-pay','payment fail');
  tap('[data-screen=error-pay] [data-nav=payment]'); tap('#doPay');
  await wait(2600); check(screen(),'success','retry success');
  tap('#directEntry'); tap('.seat:not([data-taken=true])'); tap('#toCheckout');
  tap('.payopt[data-pay=sbp]'); tap('#toPayment'); check(screen(),'payment','sbp');
  check(Boolean(q('#qrCode svg')),true,'sbp qr');
  tap('#doPay'); await wait(2600); check(screen(),'success','sbp success');
  for(const outcome of ['expired','error-seat']){
    tap('#directEntry'); tap('.seat:not([data-taken=true])'); tap('#toCheckout');
    q('#demoOutcome').value=outcome; tap('#toPayment'); check(screen(),outcome,'recovery');
  }
  tap('#restart'); tap('.session[data-film=rocky][data-session="17:05"]');
  check(screen(),'seats','session list flow');
  tap('[data-mode-btn=desktop]'); check(q('#stage').dataset.mode,'desktop','desktop toggle');
  tap('.seat:not([data-taken=true])'); tap('#toCheckout');
  const fill = (id,value) => {
    const f=q('#'+id); f.value=value; f.dispatchEvent(new Event('input',{bubbles:true}));
  };
  q('#authStrip button').focus(); tap('#authStrip button');
  check(q('#authOverlay').dataset.open,'true','open auth from checkout');
  check(q('[data-screen=checkout]').inert,true,'background inert');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  check(q('#authOverlay').dataset.open,'false','escape');
  check(document.activeElement,q('#authStrip button'),'return focus');
  tap('#authStrip button');
  tap('#authPhoneForm [type=submit]');
  check(q('#phoneAuthError').hidden,false,'phone validation');
  fill('authPhone','9002223344'); tap('#authPhoneForm [type=submit]');
  check(q('[data-auth-step=code]').hidden,false,'show OTP');
  check(q('#resendCode').disabled,true,'resend cooldown');
  fill('authCode','1111'); tap('#authCodeForm [type=submit]');
  check(q('#codeError').hidden,false,'invalid OTP');
  fill('authCode','1234'); tap('#authCodeForm [type=submit]');
  check(q('#savedContacts').hidden,true,'signed contacts merged into account strip');
  check(getComputedStyle(q('#authStrip')).display !== 'none',true,'signed account strip visible');
  check(q('#authStrip').textContent.includes('Вы вошли'),true,'signed account strip explains state');
  check(q('#authStrip').textContent.includes('kino@example.com'),true,'signed strip shows delivery contact');
  check(getComputedStyle(q('#saveContacts')).display,'none','edit action hidden until editing');
  check(q('[data-pay=saved]').hidden,true,'signed profile without card');
  check(q('#recipientEmail').textContent,'kino@example.com','existing delivery contact');
  tap('[data-strip-action=edit]'); fill('email','edited@example.com'); tap('#saveContacts');
  check(q('#authStrip').textContent.includes('edited@example.com'),true,'edit recipient');
  tap('#restart'); tap('#authBtn'); tap('#logoutBtn');
  tap('#authBtn'); q('#demoOutcome').value='auth-error'; tap('#authProvider');
  await wait(750); check(q('#providerError').hidden,false,'ID provider error');
  tap('#authProvider');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  tap('#authBtn'); await wait(750);
  check(q('#authOverlay').dataset.open,'true','rapid reopen survives delayed close');
  check(q('#authBtnLabel').textContent,'Войти','late provider result discarded');
  tap('#authProvider'); await wait(750);
  check(q('#authBtnLabel').textContent,'Профиль','signed with saved card');
  tap('#directEntry'); tap('.seat:not([data-taken=true])'); tap('#toCheckout');
  check(q('[data-pay=saved]').hidden,false,'saved card shown');
  tap('[data-pay=saved]');
  check(q('[data-pay=card]').getAttribute('aria-pressed'),'false','one payment method selected');
  q('#demoOutcome').value='pending'; tap('#toPayment');
  check(q('#checking').hidden,false,'saved card starts directly');
  await wait(1350);
  check(q('#checkPayment').hidden,false,'payment pending');
  check(q('#doPay').disabled,true,'duplicate payment blocked');
  if(q('.device').clientWidth >= 900) check(q('.payment-grid').clientWidth >= 660,true,'desktop payment layout width');
  tap('#checkPayment'); await wait(2600);
  check(screen(),'success','pending recovered');
  tap('#restart'); tap('#authBtn'); tap('#logoutBtn');
  tap('#authBtn'); tap('[data-auth-step=phone] [data-auth-to=credentials]');
  fill('authEmail','mail@example.com'); fill('authPass','wrong');
  tap('#credentialForm [type=submit]');
  check(q('#credentialError').hidden,false,'password error');
  fill('authPass','demo'); tap('#credentialForm [type=submit]');
  check(q('#authBtnLabel').textContent,'Профиль','password success');
  const w=document.documentElement.clientWidth;
  check(document.documentElement.scrollWidth <= w+1,true,'viewport overflow');
  status.textContent = 'PASS guest, auth close/reopen, SMS and ID errors, contact edit, saved card and pending payment at '+w+' px';
})().catch(e => {status.textContent='FAIL '+e.message}).finally(() => parent.postMessage(status.textContent,'*'));
</script>`;
const file = join(folder, "demo.html");
writeFileSync(file, input.replace("</body>", () => test + "</body>"));
for (const width of [320,390,1280]) {
  const wrapper = join(folder, "viewport-" + width + ".html");
  writeFileSync(wrapper,'<!doctype html><meta charset="utf-8"><body><output id="qa-result"></output><script>window.addEventListener("message", e => document.querySelector("output").textContent = e.data)</script><iframe width="'+width+'" height="844" style="border:0" src="demo.html"></iframe></body>');
  const r = spawnSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox", "--dump-dom",
    "--window-size="+width+",900", "--force-device-scale-factor=1",
    "--virtual-time-budget=15000", "--user-data-dir="+join(folder,"p"+width), pathToFileURL(wrapper).href,
  ], {encoding:"utf8",maxBuffer:10*1024*1024,timeout:18000,windowsHide:true});
  const result = r.stdout?.match(/<output id="qa-result">([^<]*)<\/output>/)?.[1];
  console.log(width,result??r.error?.message??r.stderr?.slice(-750));
  if (!result?.startsWith("PASS")) process.exitCode=1;
}
