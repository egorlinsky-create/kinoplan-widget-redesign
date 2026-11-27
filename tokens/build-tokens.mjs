// Сборка производных артефактов из tokens.dtcg.json:
//   1) prototype/tokens.css          — CSS-переменные для прототипа и превью
//   2) tokens/tokens-studio.json     — формат Tokens Studio для импорта в Figma (переменные)
//   3) tokens/tokens-flat.json       — плоский список «имя → значение» для ручной сверки и для UI-кита
//
// Запуск: node tokens/build-tokens.mjs

import fs from "node:fs";
import path from "node:path";

const dir = import.meta.dirname;
const src = JSON.parse(fs.readFileSync(path.join(dir, "tokens.dtcg.json"), "utf8"));

/* ---------- утилиты ---------- */

const isToken = (o) => o && typeof o === "object" && "$value" in o;

function walk(node, dashPrefix, dotPrefix, out, inheritedType) {
  const groupType = node.$type || inheritedType;
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    const name = dashPrefix ? `${dashPrefix}-${k}` : k;
    const dot = dotPrefix ? `${dotPrefix}.${k}` : k;
    if (isToken(v)) {
      out.push({ path: dot, cssName: name, token: { ...v, $type: v.$type || groupType } });
    } else if (v && typeof v === "object") {
      walk(v, name, dot, out, groupType);
    }
  }
  return out;
}

function dim(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "value" in v) return `${v.value}${v.unit}`;
  return String(v);
}

function shadow(v) {
  const list = Array.isArray(v) ? v : [v];
  return list
    .map((s) => {
      const color = String(s.color || "#000000");
      return `${s.offsetX || "0"} ${s.offsetY || "0"} ${s.blur || "0"} ${s.spread || "0"} ${color}`;
    })
    .join(", ");
}

function toCssValue(token) {
  const t = token.$type;
  const v = token.$value;
  switch (t) {
    case "color":
      return v;
    case "dimension":
      return dim(v);
    case "fontFamily":
      return (Array.isArray(v) ? v : [v]).map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");
    case "fontWeight":
    case "number":
      return String(v);
    case "shadow":
      return shadow(v);
    case "duration":
      return dim(v);
    case "cubicBezier":
      return `cubic-bezier(${(Array.isArray(v) ? v : [v]).join(", ")})`;
    default:
      return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

/* ---------- 1. CSS ---------- */

const tokens = walk(src, "", "", []);
const byPath = new Map(tokens.map((t) => [t.path, t]));

function resolve(pathName, depth = 0) {
  if (depth > 12) throw new Error("cyclic alias: " + pathName);
  const t = byPath.get(pathName);
  if (!t) return null;
  const v = t.token.$value;
  if (typeof v === "string") {
    const m = v.match(/^\{(.+)\}$/);
    if (m) {
      const target = resolve(m[1], depth + 1);
      if (!target) throw new Error("unresolved alias: " + m[1]);
      return target;
    }
  }
  return v;
}

const colorTokens = tokens.filter((t) => t.token.$type === "color");
const otherTokens = tokens.filter((t) => t.token.$type !== "color" && t.token.$type !== "typography");

// тёмная тема: только семантические цвета, значения — предложение команды (в виджете тёмной темы нет)
const darkOverrides = {
  "color-text-primary": "#F2F3F5",
  "color-text-secondary": "#A5ACB8",
  "color-text-tertiary": "#C6CCD6",
  "color-text-disabled": "#5A6472",
  "color-text-inverse": "#0F1319",
  "color-bg-canvas": "#0F1319",
  "color-bg-surface": "#161B22",
  "color-bg-subtle": "#1B2129",
  "color-bg-muted": "#232A34",
  "color-bg-order": "#1B2129",
  "color-bg-disabled": "#232A34",
  "color-border-default": "#2A323D",
  "color-border-strong": "#3A434F",
  "color-accent-subtle": "#16233D",
  "component-input-bg": "#161B22",
  "component-sheet-bg": "#161B22",
  "component-button-primary-bg": "{color.accent.default}",
};

let css = `/* Сгенерировано из tokens/tokens.dtcg.json — не править руками.
   Пересборка: node tokens/build-tokens.mjs */

:root {
`;
for (const t of [...colorTokens, ...otherTokens]) {
  const v = toCssValue({ $type: t.token.$type, $value: resolve(t.path) });
  css += `  --${t.cssName}: ${v};\n`;
}
css += `}

/* Тёмная тема — предложение: в текущем виджете тёмного режима нет */
[data-theme="dark"] {
`;
for (const [name, value] of Object.entries(darkOverrides)) {
  const v = value.startsWith("{") ? toCssValue({ $type: "color", $value: resolve(value.slice(1, -1)) }) : value;
  css += `  --${name}: ${v};\n`;
}
css += `}

/* Базовые текстовые стили из типографических токенов */
`;
for (const [name, tok] of Object.entries(src.typography || {})) {
  const v = tok.$value;
  const size = dim(resolve(v.fontSize.replace(/[{}]/g, "")) ?? "15px");
  const weight = resolve(v.fontWeight.replace(/[{}]/g, "")) ?? 400;
  const lh = resolve(v.lineHeight.replace(/[{}]/g, "")) ?? 1.4;
  const ls = resolve(v.letterSpacing.replace(/[{}]/g, "")) ?? 0;
  css += `.text-${name} { font-family: var(--font-family-base); font-size: ${dim(size)}; font-weight: ${weight}; line-height: ${lh}; letter-spacing: ${dim(ls)}; }\n`;
}

fs.writeFileSync(path.join(dir, "..", "prototype", "tokens.css"), css);

/* ---------- 2. Tokens Studio ---------- */

const SET_CORE = {};
const SET_LIGHT = {};
const SET_DARK = {};

const toStudio = (token) => {
  const out = { value: token.$value };
  if (token.$type) out.type = token.$type;
  if (token.$description) out.description = token.$description;
  return out;
};

function setNested(target, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

for (const t of tokens) {
  const ttype = t.token.$type;
  const isSemanticColor = ttype === "color" && /^color-(text|bg|border|accent|feedback|seat)-/.test(t.cssName);
  if (isSemanticColor) {
    setNested(SET_LIGHT, t.path, toStudio(t.token));
    const dark = darkOverrides[t.cssName];
    setNested(SET_DARK, t.path, toStudio({ ...t.token, $value: dark && !dark.startsWith("{") ? dark : t.token.$value }));
  } else {
    setNested(SET_CORE, t.path, toStudio(t.token));
  }
}

const studio = {
  core: SET_CORE,
  "semantic/light": SET_LIGHT,
  "semantic/dark": SET_DARK,
  $themes: [
    { name: "Light", selectedTokenSets: { core: "source", "semantic/light": "enabled", "semantic/dark": "disabled" } },
    { name: "Dark", selectedTokenSets: { core: "source", "semantic/light": "disabled", "semantic/dark": "enabled" } },
  ],
  $metadata: {
    tokenSetOrder: ["core", "semantic/light", "semantic/dark"],
  },
};

fs.writeFileSync(path.join(dir, "tokens-studio.json"), JSON.stringify(studio, null, 2));

/* ---------- 3. Плоский список ---------- */

const flat = tokens.map((t) => ({
  name: t.cssName,
  path: t.path,
  type: t.token.$type,
  value: toCssValue({ $type: t.token.$type, $value: resolve(t.path) }),
  alias: typeof t.token.$value === "string" && t.token.$value.startsWith("{") ? t.token.$value : null,
  description: t.token.$description || null,
}));
fs.writeFileSync(path.join(dir, "tokens-flat.json"), JSON.stringify(flat, null, 2));

/* ---------- отчёт ---------- */

const stats = {};
for (const t of tokens) stats[t.token.$type] = (stats[t.token.$type] || 0) + 1;
console.log("Токенов:", tokens.length);
console.log("По типам:", JSON.stringify(stats));
console.log("Записали: prototype/tokens.css, tokens/tokens-studio.json, tokens/tokens-flat.json");



