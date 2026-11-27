// CLI driver: node walk.mjs <cmd> [args]
// Every invocation re-applies the emulated viewport (CDP emulation is per-session).
import { attachPage, setViewport, screenshot, evalIn, saveHtml, sleep } from "./cdp.mjs";
import fs from "node:fs";

const [cmd, ...args] = process.argv.slice(2);

const VW = Number(process.env.WALK_W || 390);
const VH = Number(process.env.WALK_H || 844);
const MOBILE = (process.env.WALK_M || "1") === "1";
const DSF = Number(process.env.WALK_DSF || 2);

const p = await attachPage("kinowidget");
await setViewport(p, VW, VH, MOBILE, DSF);

try {
  switch (cmd) {
    case "url":
      console.log(await evalIn(p, "location.href"));
      break;
    case "goto":
      await p.send("Page.navigate", { url: args[0] });
      await sleep(Number(args[1] || 8000));
      await setViewport(p, VW, VH, MOBILE, DSF);
      console.log("URL:", await evalIn(p, "location.href"), "vw:", await evalIn(p, "innerWidth"));
      break;
    case "shot":
      console.log(await screenshot(p, args[0], args[1] === "full"));
      break;
    case "html":
      console.log(await saveHtml(p, args[0]));
      break;
    case "text":
      console.log(await evalIn(p, "document.body.innerText"));
      break;
    case "shorttext":
      console.log((await evalIn(p, "document.body.innerText")).slice(0, Number(args[0] || 2500)));
      break;
    case "ev":
      console.log(JSON.stringify(await evalIn(p, args[0]), null, 1));
      break;
    case "click": {
      const r = await evalIn(
        p,
        `(() => {
          const q = ${JSON.stringify(args[0])};
          let el = null;
          try { el = document.querySelector(q); } catch (e) {}
          if (!el) {
            const els = [...document.querySelectorAll('button, a, [role=button], div, span, li, label, input[type=submit]')]
              .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
            el = els.find(e => ((e.innerText || e.value || "").trim().toLowerCase() === q.toLowerCase()))
              || els.find(e => ((e.innerText || e.value || "").trim().toLowerCase().includes(q.toLowerCase())));
          }
          if (!el) return { ok: false, err: "not found" };
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          el.click();
          return { ok: true, tag: el.tagName, text: (el.innerText || el.value || "").trim().slice(0, 60), at: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } };
        })()`
      );
      console.log(JSON.stringify(r));
      break;
    }
    case "tap": {
      const [x, y] = args.map(Number);
      for (const type of ["mousePressed", "mouseReleased"]) {
        await p.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "touch" });
      }
      console.log("tapped", x, y);
      break;
    }
    case "els":
      console.log(JSON.stringify(await evalIn(p, `(() => {
        const out = [];
        document.querySelectorAll('button,a,[role=button],input,select,textarea,[onclick],[class*=btn],[class*=button]').forEach(e => {
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return;
          const t = (e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' ').slice(0, 70);
          out.push({ tag: e.tagName, cls: (e.className || '').toString().slice(0,60), t, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), dis: e.disabled || false });
        });
        return out.slice(0, 140);
      })()`), null, 1));
      break;
    case "layout":
      console.log(JSON.stringify(await evalIn(p, `({html: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight, ua: navigator.userAgent.slice(0,60)})`)));
      break;
    case "sleep":
      await sleep(Number(args[0] || 1000));
      console.log("slept");
      break;
    case "run": {
      const mod = await import("./" + args[0]);
      await mod.default({ p, shot: (n, f) => screenshot(p, n, f), ev: (e) => evalIn(p, e), sleep, setViewport, saveHtml: (n) => saveHtml(p, n) });
      console.log("run done");
      break;
    }
    default:
      console.log("unknown cmd");
  }
} catch (e) {
  console.error("ERR", e.message);
}
process.exit(0);
