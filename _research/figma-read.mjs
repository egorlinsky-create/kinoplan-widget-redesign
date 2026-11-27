import fs from "node:fs";
const token = JSON.parse(fs.readFileSync(process.env.USERPROFILE + "/.nf-secrets/figma.json", "utf8")).token;
const api = async (path) => {
  const r = await fetch("https://api.figma.com/v1" + path, { headers: { "X-Figma-Token": token } });
  if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
};
const FILES = { design: "vgDgIAeXyDavBWOQzSZLc4", deck: "9kemnk0FDHMujBnmC09MVI" };
const NODES = { design: "21:2", deck: "1:1529" };

for (const key of ["design", "deck"]) {
  console.log("\n=== ФАЙЛ " + key + " (" + FILES[key] + ")");
  const meta = await api(`/files/${FILES[key]}?depth=1`);
  console.log("название:", meta.name, "| изменён:", meta.lastModified, "| страниц:", meta.document.children.length);
  console.log("страницы:", meta.document.children.map(s => s.name).join(" | ").slice(0, 300));

  const node = await api(`/files/${FILES[key]}/nodes?ids=${encodeURIComponent(NODES[key])}`);
  const doc = node.nodes[NODES[key]]?.document;
  if (!doc) { console.log("узла нет"); continue; }
  const bb = doc.absoluteBoundingBox || {};
  console.log("узел " + NODES[key] + ": " + doc.type + " «" + doc.name + "» " + Math.round(bb.width) + "×" + Math.round(bb.height));
  const walk = (n, d, max) => {
    if (d > max) return;
    for (const ch of n.children || []) {
      const b = ch.absoluteBoundingBox || {};
      console.log("  ".repeat(d) + "- " + ch.type + " «" + (ch.name || "").slice(0, 60) + "» " + Math.round(b.width || 0) + "×" + Math.round(b.height || 0));
      walk(ch, d + 1, max);
    }
  };
  walk(doc, 1, 2);
}
process.exit(0);
