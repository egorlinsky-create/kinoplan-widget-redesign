// Разбор бандла виджета: какие API-пути и как называется экран успеха.
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(import.meta.dirname, "js");
fs.mkdirSync(OUT, { recursive: true });
const BASE = "https://kinowidget.kinoplan.ru";
const files = ["/js/kinowidget-core-BqvQ_VzD.min.js", "/js/vendors-2rV6tdav.min.js"];

const uniq = (a) => [...new Set(a)];
for (const f of files) {
  const r = await fetch(BASE + f);
  const code = await r.text();
  const name = f.split("/").pop();
  fs.writeFileSync(path.join(OUT, name), code);
  console.log(`\n=== ${name} (${Math.round(code.length / 1024)} КБ) ===`);
  const api = uniq([...code.matchAll(/["'`](\/(?:api|sale|payment)[^"'`\s]{0,80})["'`]/g)].map((m) => m[1]));
  console.log("API-пути:", api.slice(0, 60).join("\n  "));
  for (const kw of ["success", "ticket", "payment/status", "qrcode", "poll"]) {
    const hits = uniq([...code.matchAll(new RegExp(`.{0,70}${kw}.{0,70}`, "gi"))].map((m) => m[0]))
      .filter((s) => /\/|route|status|paid|success/i.test(s))
      .slice(0, 6);
    if (hits.length) { console.log(`\n-- ${kw} --`); hits.forEach((h) => console.log("  " + h.replace(/\s+/g, " "))); }
  }
}
