export default async function ({ p, shot, ev, sleep, setViewport }) {
  const Q = "?platform=widget&lang=ru&application_token=51859cc5bb6556ae4cdc19e92b5ff834";
  const BASE = "https://kinowidget.kinoplan.ru";

  // --- perf: cold load of afisha
  await p.send("Page.navigate", { url: "about:blank" });
  await sleep(800);
  const t0 = Date.now();
  await p.send("Page.navigate", { url: `${BASE}/afisha/6440${Q}` });
  let ready = 0, firstCard = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    const has = await ev("!!document.querySelector('a[class*=nearest], [class*=seance], [class*=session]')");
    if (has && !firstCard) { firstCard = Date.now() - t0; break; }
  }
  console.log("SEANCES_VISIBLE_MS:", firstCard);
  await setViewport(p, 390, 844, true, 2);
  await sleep(600);

  // --- a11y probe on afisha
  const a11y = await ev(`(() => {
    const imgs = [...document.querySelectorAll('img')];
    const btns = [...document.querySelectorAll('button')];
    return {
      imgTotal: imgs.length,
      imgNoAlt: imgs.filter(i => !i.getAttribute('alt')).length,
      btnTotal: btns.length,
      btnNoName: btns.filter(b => !(b.innerText||'').trim() && !b.getAttribute('aria-label')).length,
      btnNames: btns.map(b => ((b.innerText||'').trim() || b.getAttribute('aria-label') || '(none)').slice(0,30)).slice(0,20),
      roleBtn: document.querySelectorAll('[role=button]').length,
      h1: [...document.querySelectorAll('h1')].map(h=>h.innerText),
      headings: [...document.querySelectorAll('h1,h2,h3')].map(h=>h.tagName+':'+h.innerText.slice(0,30)).slice(0,10),
      iframeTitle: [...document.querySelectorAll('iframe')].map(f=>f.title||'(no title)'),
      lang: document.documentElement.lang,
      zoomMeta: !!document.querySelector('meta[name=viewport]'),
    };
  })()`);
  console.log("A11Y_AFISHA:", JSON.stringify(a11y, null, 1));

  // --- small viewport overflow test
  await setViewport(p, 360, 740, true, 2);
  await sleep(800);
  const ov = await ev(`({docW: document.documentElement.scrollWidth, winW: innerWidth, overflowX: document.documentElement.scrollWidth > innerWidth})`);
  console.log("OVERFLOW_360:", JSON.stringify(ov));
  await shot("m14_afisha_360");

  // --- contacts: invalid email error handling
  await p.send("Page.navigate", { url: `${BASE}/seats/6440/24563/6afafba03c0000be0063f873${Q}` });
  await sleep(8000);
  await setViewport(p, 390, 844, true, 2);
  await sleep(600);
  // pick seats quickly via canvas probing with proper seat detection
  const canvas = await ev(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  const mouseTap = async (x, y) => {
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    await sleep(500);
  };
  let seats = 0;
  for (let y = canvas.y + 290; y < canvas.y + canvas.h - 100 && seats < 2; y += 20) {
    for (let x = canvas.x + 70; x < canvas.x + canvas.w - 120 && seats < 2; x += 30) {
      const before = (await ev("document.querySelectorAll('.hall-schema-tooltip').length + '|' + document.body.innerText.match(/Билеты\\s*\\n?(\\d+)/)?.[1]"));
      await mouseTap(x, y);
      const after = (await ev("document.querySelectorAll('.hall-schema-tooltip').length + '|' + document.body.innerText.match(/Билеты\\s*\\n?(\\d+)/)?.[1]"));
      if (after !== before) seats = Number(after.split("|")[1] || 0);
    }
  }
  console.log("SEATS:", seats);
  await shot("m15_seats_360");
  await ev(`(() => { const b = document.querySelector('.buy-button'); if (b && !/не выбраны/.test(b.innerText)) b.click(); return b ? b.innerText : 'no'; })()`);
  await sleep(4500);
  console.log("URL:", await ev("location.href"));

  // invalid email
  const errTest = await ev(`(async () => {
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    const setVal = (el,v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
    const email = [...document.querySelectorAll('input')].find(i=>i.type==='email');
    if (!email) return 'no email field';
    email.focus(); setVal(email, 'not-an-email'); await sleep(300);
    email.blur(); await sleep(600);
    const msg = [...document.querySelectorAll('[class*=error],[class*=invalid],[role=alert]')].map(e=>e.innerText.trim()).filter(Boolean);
    return { msg, border: getComputedStyle(email).borderColor };
  })()`);
  console.log("INVALID_EMAIL:", JSON.stringify(errTest));
  await shot("m16_email_error");
  return "ok";
}

