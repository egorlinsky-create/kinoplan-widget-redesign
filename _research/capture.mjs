export default async function ({ p, shot, ev, sleep, setViewport }) {
  const url = "file:///C:/Users/jonik/Documents/Проекты/Киноплан/prototype/index.html";

  const clipShot = async (name, pad = 0) => {
    const box = await ev(`(() => { const d = document.querySelector('.device'); const r = d.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; })()`);
    const { data } = await p.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2, scale: 2 },
    });
    const fs = await import("node:fs");
    fs.writeFileSync(`_research/shots/${name}.png`, Buffer.from(data, "base64"));
    return `_research/shots/${name}.png ${Math.round(box.w)}x${Math.round(box.h)}`;
  };

  await setViewport(p, 720, 1040, false, 1);
  await p.send("Page.navigate", { url });
  await sleep(1800);
  console.log("afisha:", await clipShot("after_01_afisha", 8));

  // выбрать сеанс
  await ev(`document.querySelector('.session[data-session="17:05"]').click()`);
  await sleep(700);
  console.log("seats:", await clipShot("after_02_seats", 8));

  // выбрать 2 места (ряд 4, места 6 и 7 — центр, 650 ₽)
  await ev(`document.querySelector('.seat[data-key="4-6"]').click(); document.querySelector('.seat[data-key="4-7"]').click();`);
  await sleep(600);
  console.log("seats selected:", await clipShot("after_03_seats_selected", 8));

  // ховер: карточка места с ценой (десктоп)
  const box = await ev(`(() => { const s = document.querySelector('.seat[data-key="3-7"]').getBoundingClientRect(); return {x: s.x + s.width/2, y: s.y + s.height/2}; })()`);
  for (const type of ["mouseMoved", "mouseMoved"]) {
    await p.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, pointerType: "mouse" });
    await sleep(180);
  }
  await sleep(400);
  console.log("hover:", await clipShot("after_03b_hover_price", 8));

  // мобильный первый тап: карточка с ценой и кнопкой «Выбрать»
  await ev(`window.__demo.peek('5-6')`);
  await sleep(400);
  console.log("peek:", await clipShot("after_03c_tap_peek", 8));
  await ev(`window.__demo.hide()`);

  // подсветка ценовой зоны по легенде
  await ev(`document.querySelector('.zone-chip[data-zone="center"]').click()`);
  await sleep(400);
  console.log("zone focus:", await clipShot("after_03d_zone_focus", 8));
  await ev(`document.querySelector('.zone-chip[data-zone="center"]').click()`);
  await sleep(300);

  // оформление
  await ev(`document.querySelector('#toCheckout').click()`);
  await sleep(500);
  await ev(`(() => {
    const e = document.querySelector('#email'); e.value = 'anna.k@mail.ru';
    e.dispatchEvent(new Event('input', {bubbles:true}));
    const ph = document.querySelector('#phone'); ph.value = '9001234567';
    ph.dispatchEvent(new Event('input', {bubbles:true}));
    const c = document.querySelector('#consent'); c.checked = true;
    c.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  await sleep(400);
  console.log("checkout:", await clipShot("after_04_checkout", 8));

  // валидация (пустые поля)
  await ev(`(() => {
    document.querySelector('#email').value=''; document.querySelector('#email').dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#phone').value=''; document.querySelector('#phone').dispatchEvent(new Event('input',{bubbles:true}));
    const c=document.querySelector('#consent'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#toPayment').click();
  })()`);
  await sleep(700);
  console.log("checkout invalid:", await clipShot("after_05_checkout_errors", 8));

  // заполнить и перейти к оплате
  await ev(`(() => {
    const e = document.querySelector('#email'); e.value = 'anna.k@mail.ru'; e.dispatchEvent(new Event('input',{bubbles:true}));
    const ph = document.querySelector('#phone'); ph.value = '9001234567'; ph.dispatchEvent(new Event('input',{bubbles:true}));
    const c = document.querySelector('#consent'); c.checked = true; c.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#toPayment').click();
  })()`);
  await sleep(700);
  console.log("payment:", await clipShot("after_06_payment", 8));

  // СБП-таб
  await ev(`document.querySelector('[data-paytab="sbp"]').click()`);
  await sleep(600);
  console.log("payment sbp:", await clipShot("after_07_payment_sbp", 8));

  // успех
  await ev(`document.querySelector('#doPay').click()`);
  await sleep(700);
  console.log("success:", await clipShot("after_08_success", 8));

  // ошибки
  await ev(`(() => { document.querySelectorAll('.screen').forEach(s=>s.dataset.active = s.dataset.screen==='error-seat' ? 'true':'false'); })()`);
  await sleep(400);
  console.log("error seat:", await clipShot("after_09_error_seat", 8));
  await ev(`(() => { document.querySelectorAll('.screen').forEach(s=>s.dataset.active = s.dataset.screen==='error-pay' ? 'true':'false'); })()`);
  await sleep(400);
  console.log("error pay:", await clipShot("after_10_error_pay", 8));

  // десктоп
  await setViewport(p, 1280, 980, false, 1);
  await sleep(400);
  await ev(`document.querySelector('[data-mode-btn="desktop"]').click()`);
  await sleep(800);
  await ev(`(() => { document.querySelectorAll('.screen').forEach(s=>s.dataset.active = s.dataset.screen==='afisha' ? 'true':'false'); })()`);
  await sleep(400);
  console.log("desktop afisha:", await clipShot("after_11_desktop_afisha", 10));

  await ev(`(() => { document.querySelectorAll('.screen').forEach(s=>s.dataset.active = s.dataset.screen==='seats' ? 'true':'false'); })()`);
  await sleep(400);
  console.log("desktop seats:", await clipShot("after_12_desktop_seats", 10));

  await ev(`(() => { document.querySelectorAll('.screen').forEach(s=>s.dataset.active = s.dataset.screen==='checkout' ? 'true':'false'); })()`);
  await sleep(400);
  console.log("desktop checkout:", await clipShot("after_13_desktop_checkout", 10));

  return "ok";
}


