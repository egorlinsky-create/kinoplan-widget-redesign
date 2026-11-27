const names = [
  "left-outlined", "right-outlined", "close-outlined", "clock-circle-outlined",
  "calendar-outlined", "user-outlined", "mail-outlined", "camera-outlined",
  "tags-outlined", "safety-certificate-outlined", "info-circle-outlined",
  "exclamation-circle-outlined", "credit-card-outlined", "check-circle-filled",
  "up-outlined", "down-outlined", "reload-outlined", "search-outlined",
  "picture-outlined", "ticket-outlined",
];

const symbols = [];
for (const name of names) {
  const res = await fetch(`https://api.iconify.design/ant-design/${name}.svg`);
  if (!res.ok) { console.error("skip", name, res.status); continue; }
  const svg = await res.text();
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] || "0 0 1024 1024";
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "").trim();
  symbols.push(`<symbol id="ant-${name}" viewBox="${viewBox}">${inner}</symbol>`);
}

const script = `/* Ant Design Icons (Iconify ant-design set), inlined as a sprite. */
(() => {
  const sprite = '<svg xmlns="http://www.w3.org/2000/svg" class="ant-sprite" style="position:absolute;width:0;height:0" aria-hidden="true">${symbols.join("")}</svg>';
  const holder = document.createElement("div");
  holder.innerHTML = sprite;
  document.body.prepend(holder.firstChild);

  const rules = [
    [/m15 18-6-6|M15 18l-6-6|724 218/, "left-outlined"],
    [/m9 18 6-6-6-6|M9 18l6-6-6-6/, "right-outlined"],
    [/m6 6 12 12|M18 6 6 18|m6 6 12 12/, "close-outlined"],
    [/M12 7\\.5V12l3 2/, "clock-circle-outlined"],
    [/M8 3v4M16 3v4/, "calendar-outlined"],
    [/circle cx="12" cy="8\\.5"/, "user-outlined"],
    [/m4 7 8 6 8-6/, "mail-outlined"],
    [/M4 7h3l1\\.5-2h7/, "camera-outlined"],
    [/M3 9a2 2 0 0 0 2-2/, "tags-outlined"],
    [/M12 3 4 6v6|m9 12 2 2 4-4/, "safety-certificate-outlined"],
    [/M12 8v5M12 16\\.5h\\.01/, "exclamation-circle-outlined"],
    [/M12 8v5M12 16\\.5|M12 7\\.5V12/, "info-circle-outlined"],
    [/M3 12a9 9 0 1 0 3-6\\.7/, "reload-outlined"],
    [/m6 15 6-6 6 6/, "up-outlined"],
    [/m6 9 6 6 6-6/, "down-outlined"],
    [/M12 3 4 6/, "safety-certificate-outlined"],
  ];

  function antIcon(name, className = "") {
    return '<svg class="ant-icon ' + className + '" aria-hidden="true"><use href="#ant-' + name + '"></use></svg>';
  }

  document.querySelectorAll("svg").forEach((svg) => {
    if (svg.closest(".ant-sprite")) return;
    const html = svg.innerHTML;
    if (svg.querySelector('use[href="#icon-card"]') || svg.classList.contains("pay-icon")) {
      svg.outerHTML = antIcon("credit-card-outlined", "pay-icon");
      return;
    }
    if (svg.querySelector('use[href="#icon-check"]')) {
      svg.outerHTML = antIcon("check-circle-filled");
      return;
    }
    for (const [pattern, name] of rules) {
      if (pattern.test(html)) {
        svg.outerHTML = antIcon(name, svg.getAttribute("class") || "");
        return;
      }
    }
  });
})();`;

await import("node:fs/promises").then((fs) => fs.writeFile("prototype/ant-icons.js", script, "utf8"));
console.log("icons:", symbols.length);

