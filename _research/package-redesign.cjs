const fs = require("node:fs");
const path = require("node:path");
const dir = path.resolve("prototype");
const read = name => fs.readFileSync(path.join(dir, name), "utf8");
const data = name => {
  const mime = name.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(path.join(dir, name)).toString("base64")}`;
};
const images = Object.fromEntries(fs.readdirSync(path.join(dir, "img")).filter(n => n.endsWith(".jpg")).map(n => [n, data(`img/${n}`)]));
const allImages = html => html.replace(/src="(img\/[a-z_/-]+\.(?:jpg|svg))"/g, (_, name) => `src="${data(name)}"`);
const style = `<style>\n${read("tokens.css")}\n${read("styles.css")}\n${read("antd.css")}\n</style>`;
const script = read("app.js").replace("poster.src = state.film.poster;", `poster.src = (${JSON.stringify(images)})[state.film.poster.split("/").pop()] || "";`);
const motion = read("motion.js");
const icons = read("ant-icons.js");
const html = allImages(read("index.html"))
  .replace(/<link rel="stylesheet" href="tokens\.css">\s*<link rel="stylesheet" href="styles\.css">\s*<link rel="stylesheet" href="antd\.css">/, () => style)
  .replace('<script src="app.js"></script>', () => `<script>\n${script}\n</script>`)
  .replace('<script src="motion.js"></script>', () => `<script>\n${motion}\n</script>`)
  .replace('<script src="ant-icons.js"></script>', () => `<script>\n${icons}\n</script>`);
const banner = "<!-- Сгенерировано из prototype/ — не править руками. Пересборка: node _research/package-redesign.cjs -->\n";
fs.writeFileSync("KINOPLAN-PROTOTYPE.html", banner + html);
