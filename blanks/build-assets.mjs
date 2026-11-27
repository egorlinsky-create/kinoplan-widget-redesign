// 3D-инфографика для бланков тестового задания «Киноплан».
// Изометрия 30°, свет сверху-слева, мягкий пластик + стекло.
// Запуск: node blanks/build-assets.mjs  → blanks/svg/*.svg
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'svg');
mkdirSync(OUT, { recursive: true });

const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;

// ——— цвет ———
const NAVY = '#0F1D33';
const BLUE = '#1F76D1';
const BRIGHT = '#2E9BF6';
const SKY = '#6FBDFF';
const STEEL = '#D9E4F3';
const WHITE = '#FFFFFF';
const AMBER = '#FFB454';
const MINT = '#38D6A9';

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const hex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shade = (c, k) => hex(rgb(c).map((v) => v * k));
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));

// ——— сцена ———
let OX = 400, OY = 560;
const P = (x, y, z) => [OX + (x - y) * C30, OY + (x + y) * S30 - z];
const pts = (arr) => arr.map(([x, y, z]) => P(x, y, z).join(',')).join(' ');
const planeMatrix = (z, lean = [0, 0]) => {
  const [tx, ty] = P(lean[0], lean[1], z);
  return `matrix(${C30} ${S30} ${-C30} ${S30} ${tx} ${ty})`;
};

// Плоский объект в изометрической плоскости (скруглённый прямоугольник)
function slab(x, y, w, d, z, { r = 6, fill, lean = [0, 0], extra = '' } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${d}" rx="${r}" fill="${fill}" transform="${planeMatrix(z, lean)}" ${extra}/>`;
}

// Коробка: верх + две видимые боковые грани
function box(o) {
  const { w, d, h, z = 0, r = 6, base = BRIGHT, lean = [0, 0], topK = 1.08, frontK = 0.78, rightK = 0.6 } = o;
  const [lx, ly] = lean;
  const T = (x, y) => [x + lx, y + ly];
  const front = pts([[0, d, z], [w, d, z], [...T(w, d), z + h], [...T(0, d), z + h]]);
  const right = pts([[w, 0, z], [w, d, z], [...T(w, d), z + h], [...T(w, 0), z + h]]);
  return `<g>
    <polygon points="${right}" fill="${shade(base, rightK)}"/>
    <polygon points="${front}" fill="${shade(base, frontK)}"/>
    ${slab(0, 0, w, d, z + h, { r, fill: shade(base, topK), lean })}
  </g>`;
}

// Усечённая призма (ведро попкорна)
function frustum({ wb, db, wt, dt, h, z = 0, base, frontK = 0.82, rightK = 0.62, topK = 1.1 }) {
  const front = pts([[0, db, z], [wb, db, z], [wt, dt, z + h], [0, dt, z + h]]);
  const right = pts([[wb, 0, z], [wb, db, z], [wt, dt, z + h], [wt, 0, z + h]]);
  const top = pts([[0, 0, z + h], [wt, 0, z + h], [wt, dt, z + h], [0, dt, z + h]]);
  return `<g>
    <polygon points="${right}" fill="${shade(base, rightK)}"/>
    <polygon points="${front}" fill="${shade(base, frontK)}"/>
    <polygon points="${top}" fill="${shade(base, topK)}"/>
  </g>`;
}

function sphere(x, y, r, fill) {
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>
    <circle cx="${x - r * 0.3}" cy="${y - r * 0.34}" r="${r * 0.52}" fill="#fff" opacity=".34"/>
    <circle cx="${x - r * 0.38}" cy="${y - r * 0.42}" r="${r * 0.2}" fill="#fff" opacity=".6"/></g>`;
}

function shadow(w, d, blur = 16, opacity = 0.26, ox = 0, oy = 0) {
  const c = P(w / 2, d / 2, 0);
  return `<ellipse cx="${c[0] + ox}" cy="${c[1] + oy}" rx="${(w + d) * 0.52 * C30}" ry="${(w + d) * 0.3 * S30}" fill="${NAVY}" opacity="${opacity}" filter="url(#soft${blur})"/>`;
}

const defs = (extra = '') => `<defs>
  <filter id="soft16" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="soft8" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8"/></filter>
  ${extra}
</defs>`;

const wrap = (body, extraDefs = '', vb = [0, 0, 800, 800]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}">${defs(extraDefs)}${body}</svg>`;

// ——— 01. Билет с QR ———
function ticket() {
  OX = 380; OY = 400;
  const b = 150, d = 168, h = 12;
  const qr = [];
  const cells = 7, cs = 8, gap = 1.2;
  const grid = [
    '1111111', '1000101', '1010101', '1110111', '1010001', '1001101', '1111111',
  ];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (grid[r][c] === '1') {
        qr.push(slab(86 + c * cs, 24 + r * cs, cs - gap, cs - gap, 12, { r: 1, fill: NAVY }));
      }
    }
  }
  const perforation = [];
  for (let y = 8; y < d - 8; y += 9) {
    perforation.push(slab(74, y, 2.4, 4.6, 12.4, { r: 1, fill: mix(STEEL, NAVY, 0.35) }));
  }
  return wrap(`
    ${shadow(b, d, 16, 0.3, 6, 10)}
    ${box({ w: b, d, h, base: mix(STEEL, WHITE, 0.62), topK: 1.02, frontK: 0.86, rightK: 0.72, r: 8 })}
    ${slab(0, 0, b, 30, 12, { r: 8, fill: BLUE })}
    ${slab(0, 0, 7, 30, 12, { r: 0, fill: BRIGHT })}
    ${perforation.join('')}
    ${qr.join('')}
    <text transform="${planeMatrix(12.2)}" x="16" y="19" font-family="Inter,Segoe UI,sans-serif" font-size="9" font-weight="700" letter-spacing="1.4" fill="${WHITE}">КИНОПЛАН</text>
    <text transform="${planeMatrix(12.2)}" x="16" y="112" font-family="Inter,Segoe UI,sans-serif" font-size="15" font-weight="700" fill="${NAVY}">БИЛЕТ</text>
    <text transform="${planeMatrix(12.2)}" x="16" y="126" font-family="Inter,Segoe UI,sans-serif" font-size="8" fill="${mix(NAVY, WHITE, 0.45)}">РЯД 4 · МЕСТО 12</text>
    <text transform="${planeMatrix(12.2)}" x="16" y="146" font-family="Inter,Segoe UI,sans-serif" font-size="12" font-weight="700" fill="${BLUE}">450 ₽</text>
  `);
}

// ——— 02. Кресло кинозала ———
function seat() {
  OX = 330; OY = 600;
  const w = 96, d = 86;
  return wrap(`
    ${shadow(w, d, 16, 0.3, 4, 6)}
    ${box({ w: 26, d: 26, h: 26, z: 0, base: STEEL, topK: 1.0, frontK: 0.72, rightK: 0.6 })}
    ${box({ w: w, d: d - 26, h: 14, z: 26, base: BRIGHT, r: 10 })}
    ${box({ w: 10, d: 58, h: 12, z: 40, base: shade(BRIGHT, 0.92), r: 5 })}
    ${box({ w: 10, d: 58, h: 12, z: 40, base: shade(BRIGHT, 0.92), r: 5, lean: [0, -0], })}
    ${box({ w: w, d: 16, h: 84, z: 26, base: shade(BRIGHT, 0.96), r: 12, lean: [0, -14] })}
  `);
}

// ——— 03. Попкорн ———
function popcorn() {
  OX = 360; OY = 570;
  const top = 96, bot = 62;
  const kernels = [];
  const seeds = [
    [-6, -4, 17], [18, 6, 19], [40, -2, 18], [62, 8, 17], [84, 0, 16], [10, -22, 15],
    [34, -18, 17], [58, -16, 16], [78, -18, 14], [22, 26, 15], [48, 24, 16], [70, 26, 14],
  ];
  for (const [kx, ky, r] of seeds) {
    const c = P(kx, ky, 96);
    kernels.push(sphere(c[0], c[1] - r * 0.35, r, mix('#FFF3D6', AMBER, 0.28)));
  }
  return wrap(`
    ${shadow(bot, bot, 16, 0.28, 2, 6)}
    ${frustum({ wb: bot, db: bot, wt: top, dt: top, h: 96, base: WHITE, frontK: 0.94, rightK: 0.76, topK: 1.0 })}
    ${[...Array(5)].map((_, i) => `<polygon points="${pts([[10 + i * 18, bot, 0], [20 + i * 18, bot, 0], [24 + i * 18, top, 96], [15 + i * 18, top, 96]])}" fill="${i % 2 ? '#FF6B57' : WHITE}"/>`).join('')}
    ${kernels.join('')}
  `);
}

// ——— 04. Телефон со схемой зала ———
function phone() {
  OX = 340; OY = 560;
  const w = 104, d = 168;
  const dots = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const on = (r === 2 && c === 1) || (r === 2 && c === 2);
      dots.push(slab(14 + c * 15.4, 44 + r * 15.4, 11, 11, 13.6, { r: 3, fill: on ? BRIGHT : mix(STEEL, NAVY, 0.12) }));
    }
  }
  return wrap(`
    ${shadow(w, d, 16, 0.3, 6, 8)}
    ${box({ w, d, h: 12, z: 0, base: mix(STEEL, NAVY, 0.25), topK: 1.14, frontK: 0.62, rightK: 0.5, r: 14 })}
    ${slab(6, 6, w - 12, d - 12, 12.4, { r: 10, fill: NAVY })}
    ${slab(10, 10, w - 20, 26, 12.8, { r: 7, fill: mix(NAVY, BRIGHT, 0.12) })}
    <text transform="${planeMatrix(13)}" x="15" y="27" font-family="Inter,Segoe UI,sans-serif" font-size="8" font-weight="700" fill="${SKY}">ЗАЛ 3 · 19:40</text>
    ${dots.join('')}
    ${slab(14, 108, 76, 22, 13.2, { r: 6, fill: BLUE })}
    <text transform="${planeMatrix(13.6)}" x="22" y="123" font-family="Inter,Segoe UI,sans-serif" font-size="9" font-weight="700" fill="${WHITE}">Оплатить 900 ₽</text>
    ${slab(14, 140, 76, 14, 13.2, { r: 5, fill: mix(STEEL, WHITE, 0.2) })}
  `);
}

// ——— 05. Карта оплаты ———
function card() {
  OX = 350; OY = 470;
  const w = 190, d = 120, h = 8;
  const numbers = [];
  for (let i = 0; i < 4; i++) numbers.push(slab(16 + i * 26, 74, 18, 5, 9.4, { r: 2, fill: mix(BLUE, WHITE, 0.55) }));
  return wrap(`
    ${shadow(w, d, 16, 0.28, 8, 8)}
    ${box({ w, d, h, base: BLUE, topK: 1.5, frontK: 0.7, rightK: 0.55, r: 12 })}
    ${slab(0, 0, w, d, 8.2, { r: 12, fill: 'none' })}
    ${slab(0, d - 46, w, 46, 8.1, { r: 12, fill: shade(BLUE, 0.82) })}
    ${slab(16, 18, 34, 26, 9, { r: 4, fill: mix(AMBER, WHITE, 0.15) })}
    ${slab(16, 18, 34, 26, 9.2, { r: 4, fill: 'none', extra: `stroke="${shade(AMBER, 0.7)}" stroke-width="1"` })}
    <text transform="${planeMatrix(9.4)}" x="${w - 64}" y="34" font-family="Inter,Segoe UI,sans-serif" font-size="13" font-weight="700" fill="${WHITE}" opacity=".92">КИНОПЛАН</text>
    ${numbers.join('')}
  `);
}

// ——— 06. Очки 3D ———
function glasses() {
  OX = 360; OY = 520;
  const lens = (x) => `<g>
      ${box({ w: 74, d: 12, h: 8, z: 0, base: NAVY, topK: 1.5, frontK: 0.5, rightK: 0.4, r: 10, lean: [-x * 0,0] }).replace(/transform="matrix\([^)]*\)"/g, '')}
    </g>`;
  return wrap(`
    ${shadow(190, 60, 16, 0.24, 0, 6)}
    <g transform="translate(-70,0)">
      ${box({ w: 82, d: 60, h: 9, z: 0, base: BLUE, topK: 1.35, frontK: 0.62, rightK: 0.5, r: 12 })}
      ${slab(8, 10, 66, 40, 9.2, { r: 8, fill: mix(BLUE, NAVY, 0.35) })}
      ${slab(14, 14, 24, 12, 9.4, { r: 6, fill: WHITE, extra: 'opacity=".28"' })}
    </g>
    <g transform="translate(24,34)">
      ${box({ w: 82, d: 60, h: 9, z: 0, base: BLUE, topK: 1.35, frontK: 0.62, rightK: 0.5, r: 12 })}
      ${slab(8, 10, 66, 40, 9.2, { r: 8, fill: mix(BLUE, NAVY, 0.35) })}
      ${slab(14, 14, 24, 12, 9.4, { r: 6, fill: WHITE, extra: 'opacity=".28"' })}
    </g>
    ${box({ w: 34, d: 10, h: 6, z: 2, base: shade(BLUE, 0.75), frontK: 0.8, rightK: 0.7, r: 4 })}
  `);
}

const assets = { ticket, seat, popcorn, phone, card, glasses };
for (const [name, fn] of Object.entries(assets)) {
  writeFileSync(join(OUT, `${name}.svg`), fn());
  console.log('svg/', name + '.svg');
}
