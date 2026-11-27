// Стресс-тест вёрстки: длинные строки, большие цены, много бейджей, узкий экран.
// Ищет: обрезанный контент (scrollWidth > clientWidth), выход за границы родителя,
// горизонтальный скролл контейнера.
import { attachPage, setViewport, evalIn, sleep } from "./cdp.mjs";
import fs from "node:fs";

const url = "file:///C:/Users/jonik/Documents/Проекты/Киноплан/prototype/index.html";
const p = await attachPage("prototype");

const audit = `(() => {
  const app = document.querySelector('.app');
  const bad = [];
  const truncated = [];
  const cls = (el) => {
    const c = (el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (c ? '.' + c : '');
  };
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 42);

  for (const el of app.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    const isForm = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    const clamped = (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') || cs.lineClamp;
    const scrollable = ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);

    const clipsX = el.scrollWidth - el.clientWidth > 1 && (cs.overflowX === 'hidden' || cs.overflowX === 'clip');
    const clipsY = el.scrollHeight - el.clientHeight > 2 && (cs.overflowY === 'hidden' || cs.overflowY === 'clip');

    if (clipsX && !isForm && !scrollable && !clamped) { if (cs.textOverflow === 'ellipsis') { truncated.push({ sel: cls(el), by: el.scrollWidth - el.clientWidth, title: el.getAttribute('title'), text: txt(el) }); } else { bad.push({ kind: 'clip-x', sel: cls(el), by: el.scrollWidth - el.clientWidth, text: txt(el) }); } }
    if (clipsY && !scrollable && !clamped) bad.push({ kind: 'clip-y', sel: cls(el), by: el.scrollHeight - el.clientHeight, text: txt(el) });

    const parent = el.parentElement;
    if (parent && !isForm) {
      const pr = parent.getBoundingClientRect();
      const pcs = getComputedStyle(parent);
      if (pcs.overflow === 'visible' && pcs.position !== 'fixed') {
        const overR = Math.round(r.right - pr.right);
        const overL = Math.round(pr.left - r.left);
        if (overR > 2 || overL > 2) bad.push({ kind: overR > 2 ? 'over-right' : 'over-left', sel: cls(el), by: Math.max(overR, overL), parent: cls(parent), text: txt(el) });
      }
    }
  }

  // наложение текстовых блоков внутри карточек (флаг поверх цены и подобное)
  const containers = [...app.querySelectorAll('.session, .film, .card, .sticky-cta, .toast, .overlay__head')];
  for (const box of containers) {
    if (box.offsetParent === null) continue;
    const kids = [...box.children].filter((k) => {
      const cs = getComputedStyle(k);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = k.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    });
    const rects = kids.map((k) => ({ el: k, r: k.getBoundingClientRect() }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r, b = rects[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) {
          const area = ox * oy;
          const minArea = Math.min(a.width * a.height, b.width * b.height);
          if (area > minArea * 0.25) {
            bad.push({ kind: 'overlap', sel: cls(rects[i].el) + ' × ' + cls(rects[j].el), by: Math.round(area), parent: cls(box), text: txt(rects[i].el) + ' / ' + txt(rects[j].el) });
          }
        }
      }
    }
  }

  const dedup = [];
  const seen = new Set();
  for (const b of bad) {
    const k = b.kind + b.sel + (b.parent || '');
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(b);
  }
  return { count: dedup.length, items: dedup.slice(0, 20), appScroll: app.scrollWidth - app.clientWidth, truncated: truncated.filter(t => !t.title).map(t => t.sel + " (нет title)").slice(0, 6) };
})()`;

async function stress(name) {
  const res = await evalIn(p, audit);
  console.log(`\n=== ${name} :: нарушений ${res.count}, гориз. скролл ${res.appScroll}`);
  if (res.truncated && res.truncated.length) console.log("   ⚠ обрезано без title: " + res.truncated.join(", "));
  res.items.forEach((i) =>
    console.log(`   ${i.kind.padEnd(10)} ${i.sel.padEnd(34)} +${i.by}px  «${i.text}»${i.parent ? "  ← " + i.parent : ""}`)
  );
  return res;
}

await setViewport(p, 720, 1040, false, 1);
await p.send("Page.navigate", { url });
await sleep(1600);

// --- стресс: длинные строки, большие цены, лишние бейджи
await evalIn(p, `(() => {
  const films = [...document.querySelectorAll('.film')];
  const longTitles = [
    'Рокки — это я: история одного возвращения на ринг',
    'Колотун и Волшебное королевство: большое путешествие',
    'Дедмобиль',
    'Бумажный тигр'
  ];
  films.forEach((f, i) => {
    const t = f.querySelector('.film__title');
    if (t) t.textContent = longTitles[i] || t.textContent;
    const badges = f.querySelector('.film__badges');
    if (badges && i === 0) badges.insertAdjacentHTML('beforeend', '<span class="badge badge--soft">Пушкинская карта</span><span class="badge">IMAX</span><span class="badge">18+</span>');
    f.querySelectorAll('.session').forEach((s, k) => {
      const hall = s.querySelector('.session__hall');
      const price = s.querySelector('.session__price');
      if (hall) hall.textContent = k === 0 ? 'Зал «Премьер» IMAX' : 'Зал 7';
      if (price) price.textContent = k === 0 ? 'от 10 500 ₽' : '1050 ₽';
    });
  });
  const title = document.querySelector('.topbar__title');
  if (title) title.textContent = 'Кинотеатр Горизонт Cinema & Emotion, мегацентр «Горизонт»';
  const meta = document.querySelector('.topbar__meta');
  if (meta) meta.textContent = 'Ростов-на-Дону, проспект Михаила Нагибина, 32д/2, 4 этаж';
  return 'stressed';
})()`);
await sleep(400);

await stress("афиша · стресс");

// --- зал
await evalIn(p, `document.querySelector('.session[data-session="17:05"]').click()`);
await sleep(400);
await evalIn(p, `['4-5','4-6','4-7','4-8','4-9','4-10'].forEach(k => { const s = document.querySelector('.seat[data-key="' + k + '"]'); if (s && s.dataset.taken !== 'true') s.click(); })`);
await sleep(300);
await stress("зал · 6 мест");

// --- оформление
await evalIn(p, `document.querySelector('#toCheckout').click()`);
await sleep(400);
await stress("оформление · 6 мест");

// --- длинный email и большая сумма
await evalIn(p, `(() => {
  const e = document.querySelector('#email');
  e.value = 'anna.kovalyova.mail@very-long-domain-example.ru';
  e.dispatchEvent(new Event('input', {bubbles:true}));
})()`);
await sleep(200);
await stress("оформление · длинный email");

// --- успех
await evalIn(p, `(() => {
  const c = document.querySelector('#consent'); c.checked = true; c.dispatchEvent(new Event('change', {bubbles:true}));
  document.querySelector('#toPayment').click();
})()`);
await sleep(400);
await evalIn(p, `document.querySelector('#doPay').click()`);
await sleep(800);
await stress("успех · 6 мест и длинный email");

// --- узкий экран 320
await setViewport(p, 400, 760, true, 2);
await sleep(400);
await evalIn(p, `(() => { document.querySelectorAll('.screen').forEach(s => s.dataset.active = s.dataset.screen === 'afisha' ? 'true' : 'false'); })()`);
await sleep(400);
await stress("афиша · ширина 320");

const h = await evalIn(p, `document.documentElement.scrollHeight`);
const { data } = await p.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 400, height: Math.min(h, 1400), scale: 2 } });
fs.writeFileSync("_research/shots/stress_320.png", Buffer.from(data, "base64"));
process.exit(0);
