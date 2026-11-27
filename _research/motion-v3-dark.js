/* Микродвижение прототипа: прогресс сценария, глубина постеров,
   мягкий параллакс света и «дыхание» суммы. Логику покупки не трогает. */

(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const app = document.querySelector(".app");
  if (!app) return;

  /* --- 1. Прогресс сценария -------------------------------------- */

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

  /* --- 2. Глубина постеров и билета ------------------------------- */

  if (!reduce.matches) {
    let raf = 0;
    let current = null;

    const tilt = (event) => {
      if (!fine.matches) return;
      current = event.target.closest(".film, .ticket, .summary");
      if (!current) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!current || !current.isConnected) return;
        const rect = current.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        const target = current.querySelector(".film__poster, .ticket, .summary__poster") || current;
        target.style.setProperty("--js-ry", `${(x * 7).toFixed(2)}deg`);
        target.style.setProperty("--js-rx", `${(-y * 5).toFixed(2)}deg`);
      });
    };

    app.addEventListener("pointermove", tilt);

    app.addEventListener("pointerleave", () => {
      app.querySelectorAll(".film__poster, .ticket, .summary__poster").forEach((el) => {
        el.style.setProperty("--js-ry", "0deg");
        el.style.setProperty("--js-rx", "0deg");
      });
      app.style.setProperty("--mx", "0");
      app.style.setProperty("--my", "0");
    });

    app.addEventListener("pointermove", (event) => {
      if (!fine.matches) return;
      const rect = app.getBoundingClientRect();
      app.style.setProperty("--mx", (((event.clientX - rect.left) / rect.width) * 2 - 1).toFixed(2));
      app.style.setProperty("--my", (((event.clientY - rect.top) / rect.height) * 2 - 1).toFixed(2));
    });
  }

  /* --- 3. Сумма меняется заметно, но без счётчика ---------------- */

  const totals = document.querySelectorAll('[data-bind="total"]');
  totals.forEach((node) => {
    let previous = node.textContent;
    const observer = new MutationObserver(() => {
      if (node.textContent === previous) return;
      previous = node.textContent;
      const target = node.closest(".sticky-cta__value") || node;
      if (!target.classList.contains("sticky-cta__value")) return;
      target.classList.remove("is-bumped");
      void target.offsetWidth;
      target.classList.add("is-bumped");
      setTimeout(() => target.classList.remove("is-bumped"), 520);
    });
    observer.observe(node, { childList: true, characterData: true, subtree: true });
  });

  /* --- 4. Таймер: последняя минута тревожнее --------------------- */

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

  /* --- 5. Меню демо: закрывается по клику вне и Escape ----------- */

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
