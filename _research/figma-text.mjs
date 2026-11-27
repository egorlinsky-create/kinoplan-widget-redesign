import fs from "node:fs";
const token = JSON.parse(fs.readFileSync(process.env.USERPROFILE + "/.nf-secrets/figma.json", "utf8")).token;
const api = async (p) => {
  const r = await fetch("https://api.figma.com/v1" + p, { headers: { "X-Figma-Token": token } });
  if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 160));
  return r.json();
};
const F = { design: "vgDgIAeXyDavBWOQzSZLc4", deck: "9kemnk0FDHMujBnmC09MVI" };

// 1. тексты презентации
const deck = await api(`/files/${F.deck}/nodes?ids=${encodeURIComponent("1:1529")}`);
const ddoc = deck.nodes["1:1529"].document;
const texts = [];
const collect = (n) => {
  if (n.type === "TEXT" && n.characters) texts.push(n.characters.replace(/\s+/g, " ").trim());
  (n.children || []).forEach(collect);
};
collect(ddoc);
fs.writeFileSync("_research/deck-text.txt", texts.join("\n---\n"));
console.log("=== ПРЕЗЕНТАЦИЯ: текстов " + texts.length + " ===");
console.log(texts.slice(0, 90).join("\n").slice(0, 6500));

// 2. структура страниц дизайна
const meta = await api(`/files/${F.design}?depth=2`);
console.log("\n\n=== ДИЗАЙН: страницы и кадры ===");
for (const page of meta.document.children) {
  const kids = (page.children || []).map(c => c.type + " «" + c.name.slice(0, 46) + "» " + Math.round((c.absoluteBoundingBox || {}).width || 0) + "×" + Math.round((c.absoluteBoundingBox || {}).height || 0));
  console.log("\n## " + page.name + " (" + (page.children || []).length + " объектов)");
  kids.slice(0, 18).forEach(k => console.log("   " + k));
}
process.exit(0);
