export default async function ({ p, shot, ev, sleep, setViewport }) {
  const Q = "?platform=widget&lang=ru&application_token=51859cc5bb6556ae4cdc19e92b5ff834";
  const BASE = "https://kinowidget.kinoplan.ru";

  // date picker on mobile
  await p.send("Page.navigate", { url: `${BASE}/afisha/6440${Q}` });
  await sleep(8000);
  const d = await ev(`(() => {
    const all = [...document.querySelectorAll('button, div, span')];
    const el = all.find(e => /^Сегодня, 20 Ноября/.test((e.innerText||'').trim()) && e.getBoundingClientRect().height < 70 && e.getBoundingClientRect().height > 20);
    if (!el) return 'none';
    const btn = el.closest('button') || el;
    btn.click();
    return 'clicked ' + (btn.innerText||'').trim().slice(0,30);
  })()`);
  await sleep(2000);
  await shot("m02b_datepicker");
  console.log("DATE:", d);
  await ev("document.body.click()");
  await sleep(600);

  // desktop pass
  await setViewport(p, 1280, 900, false, 1);
  await sleep(1200);
  await shot("d01_afisha");
  await p.send("Page.navigate", { url: `${BASE}/seats/6440/24563/6afafba03c0000be0063f873${Q}` });
  await sleep(8000);
  await setViewport(p, 1280, 900, false, 1);
  await sleep(800);
  await shot("d02_seats");
  // go through again to basket at desktop size
  await p.send("Page.navigate", { url: `${BASE}/basket/6440/24563/6afafba03c0000be0063f873${Q}` });
  await sleep(7000);
  await setViewport(p, 1280, 900, false, 1);
  await sleep(800);
  await shot("d03_basket");
  console.log("desktop url:", await ev("location.href"), await ev("innerWidth"));
  return "ok";
}
