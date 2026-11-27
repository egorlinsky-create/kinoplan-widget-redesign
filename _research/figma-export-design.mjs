import fs from "node:fs";
const token = JSON.parse(fs.readFileSync(process.env.USERPROFILE + "/.nf-secrets/figma.json", "utf8")).token;
const F = "vgDgIAeXyDavBWOQzSZLc4";
const api = async (p) => {
  const r = await fetch("https://api.figma.com/v1" + p, { headers: { "X-Figma-Token": token } });
  if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 160));
  return r.json();
};
const file = await api(`/files/${F}?depth=3`);
const wanted = [
  "Выбор сеанса / afisha", "Рокки — это я / seats", "Рокки — это я / selected",
  "Оформление / checkout", "Оплата картой / card", "Проверяем оплату / pending",
  "Заказ оплачен / success", "Оплата через СБП / sbp",
];
const found = [];
const walk = (n) => {
  if (n.type === "FRAME" && wanted.includes(n.name)) found.push({ id: n.id, name: n.name, w: Math.round((n.absoluteBoundingBox || {}).width || 0) });
  (n.children || []).forEach(walk);
};
file.document.children.forEach(walk);
console.log("найдено кадров:", found.length);
found.forEach(f => console.log("  " + f.id + "  " + f.name + "  " + f.w));

const ids = found.map(f => f.id).join(",");
const imgs = await api(`/images/${F}?ids=${encodeURIComponent(ids)}&format=png&scale=1`);
let i = 0;
for (const f of found) {
  const url = imgs.images[f.id];
  if (!url) { console.log("нет картинки:", f.name); continue; }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  i++;
  const safe = String(i).padStart(2, "0") + "_" + f.name.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 28) + ".png";
  fs.writeFileSync("_research/figma-design/" + safe, buf);
  console.log("  → " + safe + " (" + Math.round(buf.length / 1024) + " КБ)");
}
process.exit(0);
