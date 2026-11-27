/* Прогресс шагов, таймер и меню демо.
   Движение здесь только объясняет состояние: никаких наклонов,
   параллакса, бликов и бесконечных анимаций. */

(() => {
  "use strict";

  const app = document.querySelector(".app");
  if (!app) return;

  const progress = document.getElementById("appProgress");
  const bars = progress ? [...progress.querySelectorAll("i")] : [];
  const steps = {
    afisha: 0,
    seats: 1,
    checkout: 2,
    payment: 3,
    success: 4,
    "error-seat": 1,
    expired: 1,
    "error-pay": 3,
  };

  function paintProgress() {
    const active = document.querySelector('.screen[data-active="true"]');
    if (!active || !bars.length) return;
    const step = steps[active.dataset.screen] ?? 0;
    bars.forEach((bar, index) => {
      bar.classList.toggle("is-done", index < step || step === 4);
      bar.classList.toggle("is-active", index === step && step < 4);
    });
    app.dataset.step = String(step);
  }

  const screenObserver = new MutationObserver(paintProgress);
  document.querySelectorAll(".screen").forEach((screen) => {
    screenObserver.observe(screen, { attributes: true, attributeFilter: ["data-active"] });
  });
  paintProgress();

  const timers = document.querySelectorAll(".timer");
  function paintTimers() {
    timers.forEach((timer) => {
      if (timer.hidden) {
        timer.removeAttribute("data-low");
        return;
      }
      const value = timer.querySelector("[data-timer]")?.textContent || "";
      const [m, s] = value.split(":").map(Number);
      const low = Number.isFinite(m) && Number.isFinite(s) && m === 0 && s > 0 && s <= 60;
      timer.toggleAttribute("data-low", low);
    });
  }
  const timerObserver = new MutationObserver(paintTimers);
  document.querySelectorAll("[data-timer]").forEach((node) => {
    timerObserver.observe(node, { childList: true, characterData: true, subtree: true });
  });
  setInterval(paintTimers, 1000);
  paintTimers();

  const menu = document.querySelector(".demo-menu");
  if (menu) {
    document.addEventListener("pointerdown", (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.open) menu.open = false;
    });
    menu.querySelectorAll("button, select").forEach((control) => {
      control.addEventListener("change", () => { menu.open = false; });
    });
  }
})();
