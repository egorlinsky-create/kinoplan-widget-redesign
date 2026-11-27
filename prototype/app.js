/* Виджет продажи билетов — прототип редизайна.
   Схема зала: цена в легенде и на ховере, выбор места одним нажатием. */

(() => {
  "use strict";

  const MAX_SEATS = 6;
  const HALL = { rows: 11, cols: 13 };

  // Ценовые зоны: цвет = цена. Как «ценовые пояса» в кассовых системах.
  const ZONES = {
    side: { label: "Боковые", price: 450, short: "боковое" },
    center: { label: "Центр", price: 650, short: "центр" },
    vip: { label: "VIP", price: 1050, short: "VIP" },
  };

  const state = {
    screen: "afisha",
    film: { id: "rocky", title: "Рокки — это я", poster: "img/rocky.jpg" },
    session: { time: "17:05", hall: "Зал 5", date: "20 ноября", base: 450 },
    seats: [],
    // по умолчанию — последний удачный способ оплаты; у нового зрителя — СБП
    pay: (() => { try { const p = localStorage.getItem("kp.lastPay"); return ["sbp", "card", "saved"].includes(p) ? p : "sbp"; } catch (e) { return "sbp"; } })(),
    payChosen: false,
    email: "",
    phone: "",
    consent: false,
    holdUntil: 0,
    user: null,
    bonusUse: false,
    editingContacts: false,
    conflictSeats: [],
  };

  const WEEKDAYS = {
    20: "пятница", 21: "суббота", 22: "воскресенье", 23: "понедельник",
    24: "вторник", 25: "среда", 26: "четверг",
  };
  const shortDate = (date) => date.replace(" ноября", " ноя");
  const weekdayOf = (date) => WEEKDAYS[Number.parseInt(date, 10)] || "";

  const BONUS = 120;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rub = (n) => (n === 0 ? "Бесплатно" : new Intl.NumberFormat("ru-RU").format(n).replace(/\s/g, "\u00A0") + "\u00A0₽");

  const takenMap = new Set([
    "1-4", "1-5", "2-8", "2-9", "3-5", "3-6",
    "4-10", "4-11", "5-2", "5-14", "6-7", "6-8",
    "7-9", "7-10", "8-3", "8-4", "8-12", "8-13",
  ]);

  function priceForZone(zone) {
    const base = state.session.base || 450;
    if (zone === "center") return Math.round((base * 1.44) / 10) * 10;
    if (zone === "vip") return Math.round((base * 2.33) / 10) * 10;
    return base;
  }

  function hallSize() {
    return state.session.big ? { rows: 11, cols: 21 } : { rows: 8, cols: 17 };
  }

  // Зал 5 Горизонта: 7 рядов по 17 мест + приставной 8-й ряд на 24 места = 143.
  function rowCols(r, h) {
    return h.rows === 8 && r === 8 ? 24 : h.cols;
  }

  function hallArea() {
    const h = hallSize();
    let total = 0;
    for (let r = 1; r <= h.rows; r++) total += rowCols(r, h);
    return total;
  }

  function zoneOf(row, col) {
    // Как в реальных схемах: цена зависит от ряда (пояс), а не от колонки.
    const h = hallSize();
    if (row <= Math.max(1, Math.round(h.rows * 0.25))) return "vip";
    if (row <= Math.round(h.rows * 0.7)) return "center";
    return "side";
  }

  function priceLabel(value) {
    return value === 0 ? "Бесплатно" : `${new Intl.NumberFormat("ru-RU").format(value).replace(/\\s/g, "\u00A0")}\u00A0₽`;
  }

  const isTouch = () => window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* ---------------------------------------------------------------
     Схема зала
     --------------------------------------------------------------- */
  function buildHall() {
    const grid = $("#hallGrid");
    grid.innerHTML = "";
    const HALL = hallSize();
    grid.classList.toggle("hall--compact", !!state.session.big);
    for (let r = 1; r <= HALL.rows; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="row__num">${r}</span>`;
      const seats = document.createElement("div");
      seats.className = "seats";
      for (let c = 1; c <= rowCols(r, HALL); c++) {
        const key = `${r}-${c}`;
        const zone = zoneOf(r, c);
        const z = ZONES[zone];
        const taken = state.session.soldOut
          ? true
          : state.session.big
            ? (r * 7 + c * 3) % 11 === 0
            : takenMap.has(key) || state.conflictSeats.includes(key);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `seat seat--${zone}`;
        btn.dataset.key = key;
        btn.dataset.row = r;
        btn.dataset.col = c;
        btn.dataset.zone = zone;
        btn.dataset.price = priceForZone(zone);
        if (taken) btn.dataset.taken = "true";
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute(
          "aria-label",
          `Ряд ${r}, место ${c}, ${z.label.toLowerCase()}, ${priceForZone(zone)} рублей${taken ? ", занято" : ""}`
        );
        // не disabled: заблокированная кнопка молча глотает нажатие,
        // а человеку нужно объяснение «почему нельзя»
        if (taken) btn.setAttribute("aria-disabled", "true");
        seats.appendChild(btn);
      }
      row.appendChild(seats);
      row.insertAdjacentHTML("beforeend", `<span class="row__num row__num--right">${r}</span>`);
      grid.appendChild(row);
    }
  }

  /* ---------------------------------------------------------------
     Карточка места: ховер на десктопе, первый тап на телефоне
     --------------------------------------------------------------- */
  let tipEl = null;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "seat-tip";
    tipEl.setAttribute("role", "status");
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function showTip(seat, x, y, mode) {
    const el = ensureTip();
    const z = ZONES[seat.dataset.zone];
    const r = Number(seat.dataset.row);
    const c = Number(seat.dataset.col);
    const taken = seat.dataset.taken === "true";
    el.innerHTML = `
      <div class="seat-tip__title">Ряд ${r} · место ${c}</div>
      <div class="seat-tip__price">${rub(z.price)}</div>
      <div class="seat-tip__row">
        <span class="seat-tip__swatch seat-tip__swatch--${seat.dataset.zone}"></span>
        <span>${z.label}</span>
      </div>
      ${taken
        ? `<div class="seat-tip__hint">Место занято</div>`
        : mode === "peek"
          ? `<button class="seat-tip__btn" type="button">Выбрать место</button>`
          : `<div class="seat-tip__hint">Нажмите, чтобы выбрать</div>`}
    `;
    el.dataset.open = "true";

    // позиционирование над местом, с прижатием к краям экрана
    const rect = seat.getBoundingClientRect();
    const tipW = el.offsetWidth || 200;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - tipW / 2), window.innerWidth - tipW - 8);
    el.style.left = left + "px";
    el.style.bottom = window.innerHeight - rect.top + 8 + "px";

    const btn = $(".seat-tip__btn", el);
    if (btn) btn.addEventListener("click", () => selectSeat(seat));
    return el;
  }

  function hideTip() {
    if (tipEl) tipEl.dataset.open = "false";
  }

  /* ---------------------------------------------------------------
     Выбор мест
     --------------------------------------------------------------- */
  let hintTimer = null;

  function showHallHint(text, tone = "warn") {
    const el = $("#hallHint");
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
    el.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { el.hidden = true; }, 4500);
  }

  function rejectSeat(btn, reason) {
    btn.dataset.rejected = "true";
    setTimeout(() => { delete btn.dataset.rejected; }, 260);
    showHallHint(reason);
  }

  function selectSeat(btn) {
    if (btn.dataset.taken === "true") {
      rejectSeat(btn, "Это место уже занято — выберите свободное рядом.");
      return;
    }
    if (heldSelection) {
      pendingSeat = btn;
      const confirm = $("#switchConfirm");
      const heldCount = heldSelection.seats.length;
      $("#switchConfirmText").textContent = `Сейчас держим ${heldCount} ${heldCount === 1 ? "место" : heldCount < 5 ? "места" : "мест"} в сеансе ${heldSelection.session.time} · ${heldSelection.session.hall}. Заменить их на место в этом сеансе?`;
      $("#switchConfirmYes").textContent = "Заменить";
      $("#switchConfirmNo").textContent = `Оставить ${heldSelection.session.time}`;
      confirm.hidden = false;
      $("#switchConfirmYes")?.focus();
      return;
    }
    const key = btn.dataset.key;
    const idx = state.seats.findIndex((s) => s.key === key);
    if (idx >= 0) {
      state.seats.splice(idx, 1);
    } else {
      if (state.seats.length >= MAX_SEATS) {
        rejectSeat(btn, `Больше ${MAX_SEATS} мест за один заказ нельзя. Оформите эти или снимите одно — цена пересчитается.`);
        return;
      }
      state.seats.push({
        key,
        row: Number(btn.dataset.row),
        col: Number(btn.dataset.col),
        zone: btn.dataset.zone,
        price: Number(btn.dataset.price),
      });
    }
    hideTip();
    syncSeats();
  }

  function wireSeats() {
    $$(".seat").forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        if (isTouch()) return;
        showTip(btn, 0, 0, "hover");
      });
      btn.addEventListener("mouseleave", () => {
        if (isTouch()) return;
        hideTip();
      });
      btn.addEventListener("focus", () => {
        if (btn.dataset.taken === "true") return;
        if (!isTouch()) showTip(btn, 0, 0, "hover");
      });
      btn.addEventListener("blur", () => {
        if (!isTouch()) hideTip();
      });
      btn.addEventListener("click", () => selectSeat(btn));
    });
  }

  function renderSeatsState() {
    const sold = $("#seatSoldOut");
    const layout = $(".seats-layout");
    const bar = $("#sessionBar");
    const isSold = !!state.session.soldOut;
    if (sold) sold.hidden = !isSold;
    if (layout) layout.hidden = isSold;
    if (bar) bar.hidden = false;
  }

  /* ---------------------------------------------------------------
     Полоса сеансов
     --------------------------------------------------------------- */
  function sessionData(btn) {
    return {
      time: btn.dataset.session,
      hall: btn.dataset.hall,
      base: Number(btn.dataset.price),
      big: /IMAX/i.test(btn.dataset.hall),
      soldOut: btn.dataset.film === "rocky" && btn.dataset.session === "23:55",
      pushkin: btn.dataset.pushkin === "true",
    };
  }

  function filmSessions() {
    return $$(".session")
      .filter(btn => btn.dataset.film === state.film.id)
      .map(sessionData)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  function renderSessionBar() {
    const bar = $("#sessionBar");
    if (!bar) return;
    bar.innerHTML = "";
    const track = document.createElement("div");
    track.className = "sessionbar__track";
    bar.appendChild(track);
    const sessions = filmSessions();
    const minBase = Math.min(...sessions.filter(s => !s.soldOut).map(s => s.base));
    sessions.forEach((s) => {
      const active = s.time === state.session.time && s.hall === state.session.hall;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "seans-chip";
      el.setAttribute("aria-pressed", active ? "true" : "false");
      el.innerHTML =
        `<span class="seans-chip__time">${s.time}</span>` +
        `<span class="seans-chip__price">${s.hall} · ${s.soldOut ? "мест нет" : "от " + priceLabel(s.base)}</span>`;
      el.addEventListener("click", () => requestSessionSwitch(s));
      track.appendChild(el);
    });
    requestAnimationFrame(centerActiveSession);
  }

  function centerActiveSession() {
    const bar = $("#sessionBar");
    if (!bar) return;
    const track = bar.querySelector(".sessionbar__track");
    if (!track) return;
    const active = track.querySelector('[aria-pressed="true"]');
    if (!active) return;
    track.scrollLeft = Math.max(0, active.offsetLeft - track.clientWidth / 2 + active.clientWidth / 2);
  }

  let pendingSession = null;
  let heldSelection = null;
  let pendingSeat = null;

  function requestSessionSwitch(next) {
    if (next.time === state.session.time && next.hall === state.session.hall) return;
    if (state.seats.length) {
      heldSelection = {
        session: { ...state.session },
        seats: state.seats.map((s) => ({ ...s })),
      };
    }
    // Переходим сразу: подтверждение спрашиваем не на смене сеанса,
    // а когда человек реально выбирает место в другом сеансе.
    applySession(next);
  }

  function applySession(next) {
    state.session = { ...next, date: state.session.date };
    state.seats = [];
    state.conflictSeats = [];
    buildHall();
    wireSeats();
    syncSeats();
    renderSessionBar();
    bind();
    renderSeatsState();
    const confirm = $("#switchConfirm");
    if (confirm) confirm.hidden = true;
    const tray = $(".sheet--side");
    if (tray) {
      tray.classList.remove("is-open");
      $("#seatTrayToggle")?.setAttribute("aria-expanded", "false");
    }
    pendingSession = null;
  }

  /* ---------------------------------------------------------------
     Рендер
     --------------------------------------------------------------- */
  function bind() {
    const t = state.film.title;
    const s = state.session;
    const total = totalPrice();
    const seatsLine = seatsText();

    $$('[data-bind="filmTitle"]').forEach((el) => (el.textContent = t));
    $$('[data-bind="sessionMeta"]').forEach(
      (el) => (el.textContent = `${s.date}, ${s.time} · ${s.hall} · 2D`)
    );
    $$('[data-bind="sessionMetaNoHall"]').forEach(
      (el) => (el.textContent = `${shortDate(s.date)}, ${s.time} · 2D`)
    );
    $$('[data-bind="filmSessionShort"]').forEach(
      (el) => (el.textContent = `${t} · ${s.date}, ${s.time}`)
    );
    $$('[data-bind="seatsLine"]').forEach((el) => (el.textContent = seatsLine || "—"));
    $$('[data-bind="sessionDateLine"]').forEach(
      (el) => (el.textContent = `${shortDate(s.date)}, ${s.time}`)
    );
    $$('[data-bind="filmSessionLine"]').forEach(
      (el) => (el.textContent = `${t} · ${shortDate(s.date)}, ${s.time} · ${s.hall}`)
    );
    $$('[data-bind="seatCount"]').forEach((el) => (el.textContent = String(state.seats.length)));
    $$('[data-bind="seatsShort"]').forEach(
      (el) => (el.textContent = `${countLabel()} · ${rub(total)}`)
    );
    $$('[data-bind="seatsCountLabel"]').forEach((el) => (el.textContent = countLabel()));
    $$('[data-bind="total"]').forEach((el) => (el.textContent = rub(total)));
    $$('[data-bind="amountMeta"]').forEach(
      (el) => (el.textContent = countLabel())
    );
    const seatPrices = [...new Set(state.seats.map((s) => s.price))];
    const calc = state.seats.length && seatPrices.length === 1
      ? `${state.seats.length} × ${rub(seatPrices[0])}`
      : "";
    $$('[data-bind="amountCalc"]').forEach((el) => (el.textContent = calc));
    $$('[data-bind="emailEcho"]').forEach(
      (el) => (el.textContent = state.email || "name@mail.ru")
    );
    $$('[data-bind="selCount"]').forEach((el) => {
      const atLimit = state.seats.length >= MAX_SEATS;
      el.textContent = atLimit ? `лимит ${MAX_SEATS}` : `${state.seats.length} из ${MAX_SEATS}`;
      el.dataset.limit = atLimit ? "true" : "false";
    });
    ["side", "center", "vip"].forEach((z) => {
      $$(`[data-zone-price="${z}"]`).forEach((el) => (el.textContent = priceLabel(priceForZone(z))));
    });

    $$('[data-bind="hallCaption"]').forEach(
      (el) => (el.textContent = `${s.hall} · ${hallArea()} мест${s.soldOut ? " · мест нет" : " · от " + priceLabel(priceForZone("side"))}`)
    );

    const title = $('[data-bind="selTitle"]');
    if (title) title.textContent = state.seats.length ? `Выбрано мест: ${state.seats.length}` : "Выберите места";
    $$('[data-bind="sheetToggleSummary"]').forEach(
      (el) => (el.textContent = state.seats.length ? `${countLabel()} · ${rub(total)}` : "Выбрать места")
    );

    $$('[data-bind="ctaLabel"]').forEach(
      (el) => (el.textContent = state.seats.length ? `Оформить · ${rub(total)}` : "Выберите места")
    );
    $$("#toCheckout, #toCheckoutMobile").forEach((btn) => {
      btn.dataset.muted = state.seats.length ? "false" : "true";
    });

    renderAuth();

    $$('[data-bind="seatsList"]').forEach((list) => {
      if (!state.seats.length) {
        list.innerHTML = `<div class="ord-row"><span class="ord-row__seat">Места не выбраны</span></div>`;
        return;
      }
      // В карточке заказа строка — это один билет: зона, место, цена и «убрать».
      const removable = Boolean(list.closest(".co-order"));
      list.innerHTML = state.seats
        .slice()
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .map(
          (s2) =>
            `<div class="ord-row"><span class="ord-row__zone ord-row__zone--${s2.zone}"></span><span class="ord-row__seat">Ряд ${s2.row}, место ${s2.col}</span><span class="ord-row__price">${rub(s2.price)}</span>${
              removable
                ? `<button class="ord-row__rm" type="button" data-remove-seat="${s2.key}" aria-label="Убрать ряд ${s2.row}, место ${s2.col}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>`
                : ""
            }</div>`
        )
        .join("");
      list.querySelectorAll("[data-remove-seat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.seats = state.seats.filter((x) => x.key !== btn.dataset.removeSeat);
          syncSeats();
        });
      });
    });
  }

  function countLabel() {
    const n = state.seats.length;
    return `${n} ${plural(n, "место", "места", "мест")}`;
  }

  function seatsText() {
    if (!state.seats.length) return "";
    const rows = new Map();
    state.seats
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .forEach((s) => {
        if (!rows.has(s.row)) rows.set(s.row, []);
        rows.get(s.row).push(s.col);
      });
    return [...rows.entries()]
      .map(([row, cols]) => {
        const list = cols.length === 1
          ? `место ${cols[0]}`
          : `места ${cols.slice(0, -1).join(", ")} и ${cols[cols.length - 1]}`;
        return `Ряд ${row}, ${list}`;
      })
      .join(" · ");
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  function totalPrice() {
    const base = state.seats.reduce((sum, s) => sum + s.price, 0);
    if (state.user && state.bonusUse) {
      return Math.max(0, base - Math.min(BONUS, Math.floor(base * 0.3)));
    }
    return base;
  }

  function renderChips() {
    const box = $("#selChips");
    box.innerHTML = "";
    if (!state.seats.length) {
      box.innerHTML = '<div class="selchips__empty">Нажмите на место, чтобы выбрать.</div>';
      return;
    }
    state.seats
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .forEach((s) => {
        const el = document.createElement("span");
        el.className = "selchip";
        el.innerHTML = `<span class="selchip__zone selchip__zone--${s.zone}"></span><span>Ряд ${s.row}, место <b>${s.col}</b></span><span class="selchip__price">${rub(s.price)}</span><button type="button" aria-label="Убрать место ряд ${s.row}, место ${s.col}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>`;
        $("button", el).addEventListener("click", () => {
          state.seats = state.seats.filter((x) => x.key !== s.key);
          syncSeats();
        });
        box.appendChild(el);
      });
  }

  function findAdjacent(n) {
    const h = hallSize();
    const center = (h.cols + 1) / 2;
    let best = null;
    for (let r = 1; r <= h.rows; r++) {
      for (let c = 1; c <= h.cols - n + 1; c++) {
        let ok = true;
        for (let k = 0; k < n; k++) {
          const el = document.querySelector(`.seat[data-key="${r}-${c + k}"]`);
          if (!el || el.dataset.taken === "true") { ok = false; break; }
        }
        if (!ok) continue;
        const mid = c + (n - 1) / 2;
        const zone = zoneOf(r, Math.round(mid));
        const zonePenalty = zone === "center" ? 0 : zone === "side" ? 60 : 120;
        const score = zonePenalty + Math.abs(mid - center) + r * 0.8;
        if (!best || score < best.score) best = { r, c, score };
      }
    }
    if (!best) return false;
    state.seats = [];
    for (let k = 0; k < n; k++) {
      const el = document.querySelector(`.seat[data-key="${best.r}-${best.c + k}"]`);
      state.seats.push({
        key: el.dataset.key,
        row: best.r,
        col: best.c + k,
        zone: el.dataset.zone,
        price: Number(el.dataset.price),
      });
    }
    syncSeats();
    showToast(`Подобрали ${n} ${plural(n, "место", "места", "мест")} рядом: ряд ${best.r}, места ${best.c}–${best.c + n - 1}`);
    return true;
  }

  function syncSeats() {
    if (state.seats.length && !state.holdUntil) state.holdUntil = Date.now() + 15 * 60 * 1000;
    if (!state.seats.length) state.holdUntil = 0;
    updateTimer();
    $$(".seat").forEach((btn) => {
      const on = state.seats.some((s) => s.key === btn.dataset.key);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderChips();
    bind();
    savePendingOrder();
    // профилактика ошибки: лимит виден до того, как человек в него упрётся
    if (state.seats.length >= MAX_SEATS) {
      showHallHint(`Выбрано ${MAX_SEATS} — это максимум на один заказ. Снимите место, чтобы выбрать другое, или оформляйте.`, "warn");
    }
  }

  /* ---------------------------------------------------------------
     Авторизация
     --------------------------------------------------------------- */

  function renderAuth() {
    const signed = Boolean(state.user);
    const editing = signed && state.editingContacts;
    $("#authBtnLabel").textContent = signed ? "Профиль" : "Войти";
    $("#authBtn").dataset.auth = String(signed);
    $$("[data-profile-label]").forEach(
      (el) => (el.textContent = signed ? state.user?.name || "Профиль" : "Войти")
    );
    $$("[data-profile]").forEach((el) => (el.dataset.auth = String(signed)));
    const strip = $("#authStrip");
    if (signed) {
      const email = state.email || state.user?.email || "";
      const phone = state.phone ? `+7 ${formatPhone(state.phone)}` : "";
      strip.innerHTML = `<div class="auth-strip__user"><span class="auth-avatar" aria-hidden="true">${email.slice(0, 1).toUpperCase()}</span><div class="auth-strip__text"><strong>Вы вошли</strong><span>Билеты на ${email}</span>${phone ? `<span>${phone}</span>` : ""}</div><div class="auth-strip__actions"><button class="link-btn" type="button" data-strip-action="edit">Изменить</button><button class="link-btn" type="button" data-strip-action="logout">Выйти</button></div></div>`;
      $("[data-strip-action='edit']", strip).addEventListener("click", () => {
        state.editingContacts = true;
        renderAuth();
        $("#email").focus();
      });
      $("[data-strip-action='logout']", strip).addEventListener("click", logout);
    } else {
      strip.innerHTML = '<div class="auth-strip__guest"><span><strong>Вы не вошли</strong> — покупаете без входа</span><button class="link-btn" type="button" data-strip-action="login">Войти</button></div>';
      $("[data-strip-action='login']", strip).addEventListener("click", () => openAuth("checkout"));
    }
    strip.hidden = false;
    $("#contactFields").hidden = signed && !editing;
    $("#savedContacts").hidden = true;
    $("#saveContacts").hidden = !editing;
    $("#recipientEmail").textContent = state.email;
    $("#recipientPhone").textContent = state.phone ? "+7 " + formatPhone(state.phone) : "";
    $("#profileContact").textContent = signed ? state.user.email + " · +7 " + formatPhone(state.user.phone) : "";

    const saved = $('[data-pay="saved"]');
    saved.hidden = !state.user?.saved;
    if (state.pay === "saved" && saved.hidden) state.pay = "sbp";
    const pushkin = $("#pushkinOption");
    const eligible = Boolean(state.session.pushkin);
    pushkin.setAttribute("aria-disabled", String(!eligible));
    pushkin.dataset.disabled = String(!eligible);
    $("#pushkinMeta").textContent = eligible ? "Доступна для этого сеанса" : "Недоступна для этого сеанса";
    if (state.pay === "pushkin" && !eligible) state.pay = "card";
    if ($("#toProfile")) $("#toProfile").hidden = !signed;
    syncPayChoices();
  }

  function basePrice() {
    return state.seats.reduce((sum, s) => sum + s.price, 0);
  }

  const authTitles = {
    credentials: "Вход по почте", phone: "Вход",
    code: "Код из СМС", profile: "Профиль",
  };
  let authTrigger = null;
  let authScreen = null;
  let authEpoch = 0;
  let authCloseTimer = 0;
  let resendDeadline = 0;
  let resendInterval = 0;

  function setAuthStep(step) {
    authEpoch++;
    if (step === "phone") {
      $$(".auth-provider", $("#authOverlay")).forEach((btn) => {
        btn.disabled = false;
        btn.lastChild.textContent = " " + (btn.dataset.label || "Войти");
      });
    }
    $("#authTitle").textContent = authTitles[step];
    $("#authGuest").hidden = step === "profile";
    $$("#authOverlay [data-auth-step]").forEach(el => { el.hidden = el.dataset.authStep !== step; });
    const tab = step === "credentials" ? "credentials" : step === "profile" ? "" : "phone";
    $$("#authOverlay .auth-tab").forEach(el => {
      el.setAttribute("aria-selected", el.dataset.authTo === tab ? "true" : "false");
    });
    const stepNode = $('#authOverlay [data-auth-step="' + step + '"]');
    (stepNode.querySelector("input") || stepNode.querySelector(".auth-provider") || stepNode.querySelector("button") || $(".overlay__sheet", $("#authOverlay"))).focus({ preventScroll: true });
  }

  function openAuth(from, step = "phone") {
    const ov = $("#authOverlay");
    if (!ov.hidden && ov.dataset.open === "true") return;
    authEpoch++;
    clearTimeout(authCloseTimer);
    authTrigger = document.activeElement;
    authScreen = $('.screen[data-active="true"]');
    if (authScreen) authScreen.inert = true;
    ov.hidden = false;
    ov.inert = false;
    ov.style.pointerEvents = "";
    $("#authContext").hidden = from !== "checkout";
    $$(".auth-provider", $("#authOverlay")).forEach((btn) => {
      btn.disabled = false;
      btn.lastChild.textContent = " " + (btn.dataset.label || "Войти");
    });
    for (const id of ["providerError", "credentialError", "phoneAuthError", "codeError"]) $("#" + id).hidden = true;
    $("#authPass").value = "";
    $("#authPass").type = "password";
    $("#passToggle").textContent = "Показать";
    $("#passToggle").setAttribute("aria-pressed", "false");
    ov.getBoundingClientRect();
    ov.dataset.open = "true";
    setAuthStep(step);
  }

  function closeAuth(focus = authTrigger) {
    const ov = $("#authOverlay");
    if (ov.hidden || ov.dataset.open !== "true") return;
    const epoch = ++authEpoch;
    ov.dataset.open = "false";
    ov.inert = true;
    ov.style.pointerEvents = "none";
    clearInterval(resendInterval);
    if (authScreen) authScreen.inert = false;
    if (focus?.isConnected) focus.focus({ preventScroll: true });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    authCloseTimer = setTimeout(() => { if (authEpoch === epoch) ov.hidden = true; }, reduced ? 0 : 260);
  }

  function tickResend() {
    const btn = $("#resendCode");
    const left = Math.max(0, Math.ceil((resendDeadline - Date.now()) / 1000));
    btn.disabled = left > 0;
    btn.textContent = left ? "Отправить снова через " + left + " с" : "Отправить код снова";
    if (!left) clearInterval(resendInterval);
  }

  function sendDemoCode() {
    resendDeadline = Date.now() + 30000;
    $("#authCode").value = "";
    $("#authCode").removeAttribute("aria-invalid");
    $("#codeError").hidden = true;
    setAuthStep("code");
    clearInterval(resendInterval);
    tickResend();
    resendInterval = setInterval(tickResend, 1000);
  }

  function login(email, phone, saved = true) {
    state.user = { email, phone, saved };
    state.email ||= email;
    state.phone ||= phone;
    state.editingContacts = false;
    placeAuthData();
    for (const field of ["email", "phone"]) clearInvalid(field);
    if (state.pay === "card" && saved && !state.payChosen) state.pay = "saved";
    renderAuth();
    bind();
    closeAuth(state.screen === "checkout" ? $("#editContacts") : $("#authBtn"));
  }

  /* --- тосты --- */
  let toastTimer = null;

  function showToast(text, actionLabel, onAction, state) {
    const t = $("#toast");
    if (!t) return;
    t.hidden = false;
    t.dataset.state = state || "info";
    t.innerHTML = `<span>${text}</span>` + (actionLabel ? `<button class="toast__action" type="button">${actionLabel}</button>` : "");
    if (actionLabel) {
      $(".toast__action", t).addEventListener("click", () => {
        hideToast();
        if (onAction) onAction();
      });
    }
    t.dataset.open = "false";
    requestAnimationFrame(() => (t.dataset.open = "true"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6000);
  }

  function hideToast() {
    const t = $("#toast");
    if (!t || t.hidden) return;
    t.dataset.open = "false";
    clearTimeout(toastTimer);
    setTimeout(() => { t.hidden = true; }, 200);
  }

  function placeAuthData() {
    const e = $("#email");
    const p = $("#phone");
    if (e) e.value = state.email;
    if (p) p.value = formatPhone(state.phone);
  }


  function logout() {
    state.user = null;
    state.editingContacts = false;
    state.bonusUse = false;
    renderAuth();
    bind();
  }

  let interruptTrigger = null;
  let interruptCloseTimer = 0;

  function openInterrupt() {
    const ov = $("#interruptOverlay");
    if (!ov || ov.dataset.open === "true") return;
    interruptTrigger = document.activeElement;
    ov.hidden = false;
    ov.getBoundingClientRect();
    ov.dataset.open = "true";
    $(".interrupt__card", ov)?.focus({ preventScroll: true });
  }

  function closeInterrupt(focus = interruptTrigger) {
    const ov = $("#interruptOverlay");
    if (!ov || ov.hidden || ov.dataset.open !== "true") return;
    ov.dataset.open = "false";
    if (focus?.isConnected) focus.focus({ preventScroll: true });
    clearTimeout(interruptCloseTimer);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    interruptCloseTimer = setTimeout(() => { ov.hidden = true; }, reduced ? 0 : 220);
  }

  function wireInterrupt() {
    $$("[data-interrupt]").forEach((b) => b.addEventListener("click", openInterrupt));
    $$("[data-interrupt-close]").forEach((b) => b.addEventListener("click", () => closeInterrupt()));
    $("#interruptConfirm")?.addEventListener("click", () => {
      closeInterrupt(null);
      go("afisha");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if ($("#interruptOverlay")?.dataset.open !== "true") return;
      event.preventDefault();
      closeInterrupt();
    });
    $$("[data-profile]").forEach((btn) =>
      btn.addEventListener("click", () => openAuth(state.screen, state.user ? "profile" : "phone"))
    );
  }

  function wireAuth() {
    const overlay = $("#authOverlay");
    $("#authBtn").addEventListener("click", () => openAuth("afisha", state.user ? "profile" : "phone"));
    $$("#authOverlay [data-auth-close]").forEach(el => el.addEventListener("click", () => closeAuth()));
    $$("#authOverlay [data-auth-to]").forEach(el => el.addEventListener("click", () => setAuthStep(el.dataset.authTo)));
    document.addEventListener("keydown", event => {
      if (overlay.dataset.open !== "true") return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeAuth();
        return;
      }
      if (event.key !== "Tab") return;
      const items = $$("button, input, a[href]", overlay).filter(el => !el.disabled && el.getClientRects().length);
      const target = event.shiftKey ? items[items.length - 1] : items[0];
      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      if (target && (document.activeElement === edge || !overlay.contains(document.activeElement))) {
        event.preventDefault();
        target.focus();
      }
    });

    $$(".auth-provider").forEach((provider) => {
      provider.addEventListener("click", () => {
        const epoch = authEpoch;
        provider.disabled = true;
        provider.lastChild.textContent = " Подтверждаем вход…";
        setTimeout(() => {
          if (authEpoch !== epoch || overlay.dataset.open !== "true") return;
          if ($("#demoOutcome").value === "auth-error") {
            $("#demoOutcome").value = "success";
            $("#providerError").hidden = false;
            provider.disabled = false;
            provider.lastChild.textContent = " " + (provider.dataset.label || "Войти");
            provider.focus();
            return;
          }
          login("viewer@example.com", "9001234567");
        }, 650);
      });
    });

    $("#authPhone").addEventListener("input", event => {
      event.target.value = formatPhone(normalizePhone(event.target.value));
      event.target.removeAttribute("aria-invalid");
      $("#phoneAuthError").hidden = true;
    });
    $("#authPhoneForm").addEventListener("submit", event => {
      event.preventDefault();
      const field = $("#authPhone");
      const phone = normalizePhone(field.value);
      if (phone.length !== 10) {
        $("#phoneAuthError").hidden = false;
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      $("#authPhoneEcho").textContent = "+7 " + formatPhone(phone);
      sendDemoCode();
    });
    $("#authCode").addEventListener("input", event => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
      event.target.removeAttribute("aria-invalid");
      $("#codeError").hidden = true;
    });
    $("#authCodeForm").addEventListener("submit", event => {
      event.preventDefault();
      const field = $("#authCode");
      if (field.value === "1234") {
        login("viewer@example.com", normalizePhone($("#authPhone").value), false);
        return;
      }
      field.setAttribute("aria-invalid", "true");
      $("#codeError").hidden = false;
      field.focus();
    });
    $("#resendCode").addEventListener("click", sendDemoCode);

    $("#passToggle").addEventListener("click", event => {
      const input = $("#authPass");
      input.type = input.type === "password" ? "text" : "password";
      event.target.textContent = input.type === "text" ? "Скрыть" : "Показать";
      event.target.setAttribute("aria-pressed", String(input.type === "text"));
    });
    $("#credentialForm").addEventListener("submit", event => {
      event.preventDefault();
      const email = $("#authEmail"), pass = $("#authPass"), error = $("#credentialError");
      if (!email.validity.valid || !pass.value) {
        error.textContent = "Проверьте адрес и пароль — без них не войти.";
        error.hidden = false;
        (!email.validity.valid ? email : pass).focus();
        return;
      }
      if (pass.value === "demo") {
        login(email.value.trim(), "9001234567");
        return;
      }
      error.textContent = "Не удалось войти. Пароль для демо — demo.";
      error.hidden = false;
    });

    $("#editContacts").addEventListener("click", () => {
      state.editingContacts = true;
      renderAuth();
      $("#email").focus();
    });
    $("#saveContacts").addEventListener("click", () => {
      if (!validateContacts()) return;
      state.editingContacts = false;
      renderAuth();
      $("#editContacts").focus();
    });
    $("#logoutBtn").addEventListener("click", () => { logout(); closeAuth($("#authBtn")); });
    $("#toProfile")?.addEventListener("click", () => openAuth(state.screen, "profile"));
  }

  function syncPayChoices() {
    $$(".payopt").forEach(option => {
      const selected = option.dataset.pay === state.pay;
      option.setAttribute("aria-checked", String(selected));
      option.setAttribute("aria-pressed", String(selected));
      option.tabIndex = selected && !option.hidden ? 0 : -1;
    });
    const cta = $("#toPayment");
    // на шаге оформления кнопка — шаг сценария, без суммы: сумма живёт в плашке заказа
    if (cta) cta.textContent = "Перейти к оплате";
  }

  const paymentMethods = {
    card: { title: "Банковская карта", action: "Оплатить" },
    saved: { title: "Карта •••• 4242", action: "Оплатить" },
    sbp: { title: "СБП", action: "Оплатить" },
    pushkin: { title: "Пушкинская карта", action: "Перейти к оплате" },
    cert: { title: "Сертификат", action: "Применить сертификат" },
  };
  let paymentPhase = "ready";
  let paymentAttempt = 0;

  function renderPayment(phase) {
    paymentPhase = phase;
    const ready = phase === "ready";
    const pending = phase === "pending";
    const issuing = phase === "issuing";
    const method = paymentMethods[state.pay];
    const wide = (document.querySelector(".device")?.clientWidth || 0) >= 900;
    $$("[data-paypanel]").forEach(el => { el.hidden = !ready || el.dataset.paypanel !== state.pay; });
    $("#payMethodName").textContent = method.title;
    const payStep = $('[data-payment-stage="pay"]');
    if (payStep) {
      payStep.textContent = state.pay === "sbp"
        ? "Оплата в приложении банка"
        : state.pay === "saved"
          ? "Списание с карты"
          : "Оплата картой";
    }
    $("#changePayMethod").hidden = !ready;
    const backBtn = $('[data-screen="payment"] .whead__back');
    if (backBtn) backBtn.disabled = !ready;
    $(".payment-main").setAttribute("aria-busy", String(phase === "checking" || phase === "issuing"));
    $("#checking").hidden = ready;
    $("#paymentStatusTitle").textContent = issuing
      ? "Оплата прошла — готовим билеты"
      : pending
        ? "Банк ещё подтверждает оплату"
        : "Проверяем оплату";
    $("#paymentStatusText").textContent = issuing
      ? "Обычно это занимает несколько секунд. Не закрывайте виджет."
      : pending
        ? "Ответ задерживается. Проверьте статус через несколько секунд. Повторно платить не нужно."
        : "Ждём подтверждение банка. Повторно платить не нужно.";
    $("#checkPayment").hidden = !pending;
    const cta = $("#doPay");
    cta.disabled = !ready;
    cta.textContent = ready
      ? method.action
      : pending
        ? "Ждём ответ банка"
        : issuing
          ? "Готовим билеты…"
          : "Проверяем оплату…";
    $$("[data-payment-stage]").forEach(el => {
      const active = ready ? "pay" : issuing ? "issue" : "verify";
      if (el.dataset.paymentStage === active) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
    if (ready && state.pay === "sbp") {
      $("#paymentQr").open = wide;
      const summary = $("#paymentQrSummary");
      if (summary) {
        summary.hidden = wide;
        summary.textContent = $("#paymentQr").open ? "Скрыть QR-код" : "Показать QR-код";
      }
      const instruction = $("#sbpInstruction");
      if (instruction) {
        instruction.textContent =
          "Отсканируйте QR-код камерой телефона для быстрого перехода к оплате в приложении банка.";
      }
      drawQr($("#qrCode"), 5);
    }
    if (!ready && state.screen === "payment") $("#paymentStatusTitle").focus({ preventScroll: true });
  }

  function startDemoPayment(outcome = $("#demoOutcome").value) {
    if (state.screen !== "payment" || ["checking", "issuing"].includes(paymentPhase)) return;
    const attempt = ++paymentAttempt;
    renderPayment("checking");
    setTimeout(() => {
      if (attempt !== paymentAttempt || state.screen !== "payment") return;
      $("#demoOutcome").value = "success";
      if (outcome === "pending") { renderPayment("pending"); return; }
      if (outcome === "error-pay") {
        paymentPhase = "ready";
        go(state.holdUntil > Date.now() ? "error-pay" : "expired");
        return;
      }
      renderPayment("issuing");
      setTimeout(() => {
        if (attempt !== paymentAttempt || state.screen !== "payment") return;
        state.holdUntil = 0;
        try { localStorage.setItem("kp.lastPay", state.pay); } catch (e) {}
        go("success");
      }, 900);
    }, 1250);
  }

  /* ---------------------------------------------------------------
     Навигация
     --------------------------------------------------------------- */
  function go(screen) {
    if ($("#authOverlay").dataset.open === "true") closeAuth(null);
    if (screen === "afisha" && ["seats", "checkout"].includes(state.screen) && state.seats.length) savePendingOrder();
    if (screen === "success") clearPendingOrder();
    if (screen === "expired") clearPendingOrder();
    if (state.screen === "payment" && screen !== "payment") paymentAttempt++;
    state.screen = screen;
    if (screen === "afisha" && window.__restoreFilters) window.__restoreFilters();
    renderAuth();
    if (screen === "payment") renderPayment("ready");
    $$(".screen").forEach((el) => (el.dataset.active = el.dataset.screen === screen ? "true" : "false"));
    const scroll = $('.screen[data-screen="' + screen + '"] .screen__scroll');
    if (scroll) scroll.scrollTop = 0;
    if (screen === "seats") {
      const tray = $(".sheet--side");
      if (tray) {
        tray.classList.remove("is-open");
        $("#seatTrayToggle")?.setAttribute("aria-expanded", "false");
      }
      requestAnimationFrame(centerActiveSession);
    }
    if (screen === "success") {
      $(".ok__title")?.focus({ preventScroll: true });
    }
    hideTip();
  }

  /* ---------------------------------------------------------------
     QR-заглушка
     --------------------------------------------------------------- */
  function drawQr(target, seed = 7) {
    const n = 25;
    const cell = 100 / n;
    let rects = "";
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const finder = (x, y) => {
      const isFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
      if (!isFinder) return null;
      const lx = x < 8 ? x : x - (n - 8);
      const ly = y < 8 ? y : y - (n - 8);
      const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6;
      const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
      return ring || core;
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const f = finder(x, y);
        const on = f === null ? rnd() > 0.52 : f;
        if (on) rects += `<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
      }
    }
    target.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-label="QR-код билета"><rect width="100" height="100" fill="#fff"/><g fill="#0f1319">${rects}</g></svg>`;
  }

  /* ---------------------------------------------------------------
     Обработчики
     --------------------------------------------------------------- */
  const PENDING_KEY = "kinoplan_pending_v1";
  let pendingFallback = null;

  function readPendingOrder() {
    try {
      const stored = sessionStorage.getItem(PENDING_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return pendingFallback;
  }

  function savePendingOrder() {
    if (!state.seats.length || state.screen === "success") return;
    const data = {
      film: { ...state.film },
      session: { ...state.session },
      seats: state.seats.map((s) => ({ ...s })),
    };
    pendingFallback = data;
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(data)); } catch {}
  }

  function clearPendingOrder() {
    pendingFallback = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  }

  let resumeTrigger = null;

  function openResumeOrder(pending, trigger) {
    resumeTrigger = trigger;
    $("#resumeFilm").textContent = pending.film.title;
    $("#resumePoster").src = pending.film.poster;
    $("#resumeSession").textContent = `${pending.session.date}, ${pending.session.time} · ${pending.session.hall}`;
    $("#resumeSeats").textContent = pending.seats
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((s) => `Ряд ${s.row}, место ${s.col}`)
      .join(" · ");
    const ov = $("#resumeOverlay");
    ov.hidden = false;
    ov.dataset.open = "true";
    $("#resumeContinue").focus({ preventScroll: true });
  }

  function closeResumeOrder() {
    const ov = $("#resumeOverlay");
    ov.dataset.open = "false";
    ov.hidden = true;
    if (resumeTrigger) resumeTrigger.focus({ preventScroll: true });
    resumeTrigger = null;
  }

  function enterSession(btn) {
    state.session = {
      ...sessionData(btn),
      date: `${$('.date[aria-pressed="true"] .date__num')?.textContent || "20"} ноября`,
    };
    state.film.id = btn.dataset.film;
    state.film.title = ({
      rocky: "Рокки — это я",
      kolotun: "Колотун и Волшебное королевство",
      dedmobil: "Дедмобиль",
      tiger: "Бумажный тигр",
    })[btn.dataset.film] || state.film.title;
    state.film.poster = `img/${btn.dataset.film}.jpg`;
    const poster = $('[data-bind="poster"]');
    if (poster) poster.src = state.film.poster;
    state.seats = [];
    state.conflictSeats = [];
    buildHall();
    wireSeats();
    syncSeats();
    renderSessionBar();
    go("seats");
    renderSeatsState();
  }

  function wire() {
    $$(".session").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pending = readPendingOrder();
        if (pending && pending.film.id === btn.dataset.film && pending.session.time === btn.dataset.session) {
          openResumeOrder(pending, btn);
          return;
        }
        enterSession(btn);
      });
    });

    $$(".date").forEach((b) =>
      b.addEventListener("click", () => {
        $$(".date").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        const day = b.querySelector(".date__num")?.textContent || "20";
        state.session.date = `${day} ноября`;
        $$('[data-bind="dateContext"]').forEach((el) => {
          el.textContent = b.dataset.empty === "true"
            ? `${b.dataset.dateLabel || state.session.date} — сеансов нет`
            : `Сеансы на ${b.dataset.dateLabel || state.session.date}`;
        });
        const empty = b.dataset.empty === "true";
        const emptyState = $("#emptyDates");
        const films = $("#filmList");
        if (emptyState) emptyState.hidden = !empty;
        if (films) films.hidden = empty;
      })
    );

    const emptyGo = $("#emptyGoNext");
    if (emptyGo) {
      emptyGo.addEventListener("click", () => {
        const dates = $$(".date");
        const current = dates.findIndex((d) => d.getAttribute("aria-pressed") === "true");
        const next = dates.slice(current + 1).find((d) => d.dataset.empty !== "true") || dates.find((d) => d.dataset.empty !== "true");
        if (next) next.click();
      });
    }

    const expiredRetry = $("#expiredRetry");
    if (expiredRetry) expiredRetry.addEventListener("click", () => go("seats"));
    const timeBucket = (hhmm) => {
      const h = Number((hhmm || "00:00").split(":")[0]);
      if (h < 12) return "morning";
      if (h < 17) return "day";
      return "evening";
    };

    function applyFilters() {
      const q = ($("#filmSearch")?.value || "").trim().toLowerCase();
      const active = $$(".chip").find((c) => c.getAttribute("aria-pressed") === "true");
      const mode = active ? active.dataset.filter : "all";
      let visibleFilms = 0;

      $$(".film").forEach((film) => {
        const title = (film.querySelector(".film__title")?.textContent || "").toLowerCase();
        const isPushkin = !!film.querySelector(".badge--soft, .film__badges")?.textContent?.includes("Пушкинская");
        const sessions = [...film.querySelectorAll("[data-session]")];
        let shown = 0;

        sessions.forEach((s) => {
          const t = s.dataset.session;
          const bucket = timeBucket(t);
          const isVip = s.classList.contains("session--vip");
          let ok = true;
          if (mode === "pushkin") ok = isPushkin;
          else if (mode === "vip") ok = isVip;
          else if (mode === "imax") ok = /imax/i.test(s.dataset.hall || "");
          else if (mode !== "all") ok = bucket === mode;
          if (q && !title.includes(q)) ok = false;
          s.hidden = !ok;
          if (ok) shown += 1;
        });

        const more = film.querySelector("[data-sessions-more]");
        if (more) more.hidden = shown === 0;
        film.hidden = shown === 0;
        if (shown > 0) visibleFilms += 1;
      });

      const emptySearch = $("#emptySearch");
      if (emptySearch) emptySearch.hidden = visibleFilms > 0;
    }

    // фильтр одиночный: выбран ровно один чипс
    $$(".chip").forEach((b) =>
      b.addEventListener("click", () => {
        $$(".chip").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        saveFilters();
        applyFilters();
      })
    );

    state.filters = state.filters || { q: "", mode: "all" };

    function saveFilters() {
      state.filters.q = $("#filmSearch") ? $("#filmSearch").value : "";
      const active = $$(".chip").find((c) => c.getAttribute("aria-pressed") === "true");
      state.filters.mode = active ? active.dataset.filter : "all";
    }

    function restoreFilters() {
      const s = $("#filmSearch");
      if (s) s.value = state.filters.q || "";
      $$(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.filter === (state.filters.mode || "all") ? "true" : "false"));
      applyFilters();
    }

    window.__restoreFilters = restoreFilters;

    // сортировка сеансов: по времени или по цене
    let sortMode = "time";
    function applySort() {
      $$(".film").forEach((film) => {
        const box = film.querySelector("[data-sessions]");
        if (!box) return;
        const list = [...box.querySelectorAll("[data-session]")];
        const more = box.querySelector("[data-sessions-more]");
        list.sort((x, y) => {
          if (sortMode === "price") return Number(x.dataset.price) - Number(y.dataset.price);
          return (x.dataset.session || "").localeCompare(y.dataset.session || "");
        });
        list.forEach((el) => box.insertBefore(el, more || null));
      });
      if (window.__markNextSession) window.__markNextSession();
    }

    $$("[data-sort]").forEach((b) =>
      b.addEventListener("click", () => {
        $$("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        sortMode = b.dataset.sort;
        applySort();
        showToast(sortMode === "price" ? "Сеансы отсортированы: сначала дешёвые" : "Сеансы отсортированы по времени");
      })
    );
    window.__applySort = applySort;

    const search = $("#filmSearch");
    if (search) {
      search.addEventListener("input", () => {
        saveFilters();
        applyFilters();
      });
    }

    const resetFilters = $("#emptySearchReset");
    if (resetFilters) {
      resetFilters.addEventListener("click", () => {
        if (search) search.value = "";
        $$(".chip").forEach((x) => x.setAttribute("aria-pressed", x.dataset.filter === "all" ? "true" : "false"));
        applyFilters();
      });
    }

    // ближайший сеанс — первый по времени среди видимых
    markNextSession();
    function markNextSession() {
      $$(".film").forEach((film) => {
        const list = [...film.querySelectorAll("[data-session]")].filter((s) => !s.hidden);
        list.forEach((s) => delete s.dataset.next);
        if (list[0]) list[0].dataset.next = "true";
      });
    }
    window.__markNextSession = markNextSession;

    // подсветка зоны по клику на легенду
    $$(".zone-chip[data-zone]").forEach((b) =>
      b.addEventListener("click", () => {
        const grid = $("#hallGrid");
        const was = b.getAttribute("aria-pressed") === "true";
        $$(".zone-chip[data-zone]").forEach((x) => x.setAttribute("aria-pressed", "false"));
        grid.dataset.focusZone = was ? "" : b.dataset.zone;
        if (!was) b.setAttribute("aria-pressed", "true");
      })
    );

    $$("[data-back]").forEach((b) => b.addEventListener("click", () => go(b.dataset.back)));
    $$("[data-nav]").forEach((b) => b.addEventListener("click", () => go(b.dataset.nav)));

    // «Выбрать» на экране конфликта действительно выбирает предложенные места
    $$("[data-pick-seats]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const picked = btn.dataset.pickSeats
          .split(",")
          .map((key) => {
            const el = document.querySelector(`.seat[data-key="${key}"]`);
            if (!el || el.dataset.taken === "true") return null;
            return {
              key,
              row: Number(el.dataset.row),
              col: Number(el.dataset.col),
              zone: el.dataset.zone,
              price: Number(el.dataset.price),
            };
          })
          .filter(Boolean);
        if (!picked.length) {
          showHallHint("Эти места уже заняли. Выберите другие на схеме.", "warn");
          return;
        }
        state.seats = picked;
        go("seats");
        syncSeats();
        showToast(`Выбрали ${picked.length} ${plural(picked.length, "место", "места", "мест")} рядом`);
      });
    });

    // подбор мест рядом: шит «Сколько мест?» из Figma (382:2666) вместо инлайн-кнопок в панели
    if (!document.body.dataset.suggestWired) {
      document.body.dataset.suggestWired = "1";
      const sheet = $("#suggestSheet");
      const qtyBtns = $$("[data-qty]", sheet || document);
      let qty = 2;
      const openSuggest = (trigger) => {
        if (!sheet) return;
        suggestTrigger = trigger || null;
        sheet.hidden = false;
        const first = qtyBtns.find((b) => b.getAttribute("aria-pressed") === "true") || qtyBtns[0];
        if (first) first.focus();
      };
      const closeSuggest = () => {
        if (!sheet || sheet.hidden) return;
        sheet.hidden = true;
        if (suggestTrigger) suggestTrigger.focus();
      };
      let suggestTrigger = null;
      document.addEventListener("click", (event) => {
        const open = event.target.closest("[data-suggest-open]");
        if (open) {
          openSuggest(open);
          return;
        }
        if (event.target.closest("[data-suggest-close]")) {
          closeSuggest();
          return;
        }
        const qtyBtn = event.target.closest("[data-qty]");
        if (qtyBtn) {
          qty = Number(qtyBtn.dataset.qty);
          qtyBtns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.qty) === qty)));
          return;
        }
        if (event.target.closest("#suggestPick")) {
          closeSuggest();
          if (state.seats.length && state.seats.length !== qty) {
            showHallHint(`Сейчас выбрано ${state.seats.length}. Подбор заменит выбор на ${qty} мест рядом.`, "info");
          }
          if (!findAdjacent(qty)) {
            showHallHint("Рядом столько свободных мест не нашлось — попробуйте меньше или другой сеанс.", "warn");
          }
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSuggest();
      });
    }

    // зум схемы: меняет размер кресла, а не масштаб картинки
    const seatSteps = [16, 18, 20, 22, 24, 26];
    let seatStep = 0;
    const hallWrap = $(".hall-wrap");
    function applySeatSize() {
      const base = seatSteps[seatStep];
      document.documentElement.style.setProperty("--seat-size", base + "px");
    }
    // Возвращает true, если масштаб реально изменился.
    function zoomBy(delta, anchorY) {
      const next = Math.min(seatSteps.length - 1, Math.max(0, seatStep + delta));
      if (next === seatStep) return false;
      const ratio = seatSteps[next] / seatSteps[seatStep];
      const prevTop = hallWrap ? hallWrap.scrollTop : 0;
      seatStep = next;
      applySeatSize();
      // держим точку под курсором на месте, иначе схема «убегает» при каждом шаге
      if (hallWrap) {
        const y = typeof anchorY === "number" ? anchorY : hallWrap.clientHeight / 2;
        requestAnimationFrame(() => {
          hallWrap.scrollTop = Math.max(0, (prevTop + y) * ratio - y);
        });
      }
      return true;
    }
    $$("[data-zoom]").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.zoom === "in") zoomBy(1);
        else if (b.dataset.zoom === "fit") {
          seatStep = 0;
          applySeatSize();
          if (hallWrap) hallWrap.scrollTop = 0;
        } else zoomBy(-1);
      })
    );
    // Колесико над схемой масштабирует зал. Shift+колесо оставлено для прокрутки.
    if (hallWrap) {
      let wheelAcc = 0;
      hallWrap.addEventListener(
        "wheel",
        (e) => {
          if (e.shiftKey || e.altKey || e.metaKey) return;
          e.preventDefault();
          const unit = e.deltaMode === 2 ? 400 : e.deltaMode === 1 ? 16 : 1;
          wheelAcc += e.deltaY * unit;
          if (Math.abs(wheelAcc) < 40) return;
          const dir = wheelAcc > 0 ? -1 : 1;
          wheelAcc = 0;
          const rect = hallWrap.getBoundingClientRect();
          zoomBy(dir, e.clientY - rect.top);
        },
        { passive: false }
      );
    }
    applySeatSize();

    const switchModal = $("#switchConfirm");
    if (switchModal && !switchModal.dataset.wired) {
      switchModal.dataset.wired = "1";
      switchModal.addEventListener("click", (event) => {
        if (event.target === switchModal) $("#switchConfirmNo")?.click();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !switchModal.hidden) $("#switchConfirmNo")?.click();
      });
    }

    const yes = $("#switchConfirmYes");    if (yes) {
      yes.addEventListener("click", () => {
        heldSelection = null;
        $("#switchConfirm").hidden = true;
        if (pendingSeat) {
          const seat = pendingSeat;
          pendingSeat = null;
          selectSeat(seat);
        }
      });
    }
    const no = $("#switchConfirmNo");
    if (no) {
      no.addEventListener("click", () => {
        const held = heldSelection;
        heldSelection = null;
        pendingSeat = null;
        $("#switchConfirm").hidden = true;
        if (held) {
          applySession(held.session);
          state.seats = held.seats.map((s) => ({ ...s }));
          buildHall();
          wireSeats();
          syncSeats();
          renderSeatsState();
          showToast(`Вернулись на ${held.session.time} · ${held.session.hall}`);
        }
      });
    }

    $$("[data-photo]").forEach((btn) =>
      btn.addEventListener("click", () => showToast("Фото зала откроется в галерее кинотеатра."))
    );

    $("#seatTrayToggle")?.addEventListener("click", () => {
      const sheet = $(".sheet--side");
      const open = !sheet.classList.contains("is-open");
      sheet.classList.toggle("is-open", open);
      $("#seatTrayToggle").setAttribute("aria-expanded", String(open));
    });

    const goCheckout = () => {
      if (!state.seats.length) {
        showHallHint("Сначала выберите хотя бы одно место на схеме — можно нажать на любое свободное.", "info");
        return;
      }
      go("checkout");
    };
    $("#toCheckout").addEventListener("click", goCheckout);
    $("#toCheckoutMobile")?.addEventListener("click", goCheckout);

    $$(".payopt").forEach(option => option.addEventListener("click", () => {
      if (option.hidden || option.getAttribute("aria-disabled") === "true") return;
      state.pay = option.dataset.pay;
      state.payChosen = true;
      syncPayChoices();
      bind();
    }));
    $(".paylist").addEventListener("keydown", event => {
      const direction = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      const available = $$(".payopt").filter(el => !el.hidden && el.getAttribute("aria-disabled") !== "true");
      const next = (available.indexOf(document.activeElement) + direction + available.length) % available.length;
      available[next].click();
      available[next].focus();
    });

    // сеансов может быть много: на мобильном шесть + «ещё», на десктопе все
    function syncSessionCollapse() {
      $$("[data-sessions]").forEach((box) => {
        const extras = [...box.querySelectorAll("[data-extra]")];
        const btn = box.querySelector("[data-sessions-more]");
        if (!btn || !extras.length) return;
        const wide = (document.querySelector(".device")?.clientWidth || 0) >= 900;
        const count = box.querySelector("[data-sessions-count]");
        if (wide) {
          extras.forEach((el) => (el.hidden = false));
          btn.hidden = true;
          return;
        }
        btn.hidden = false;
        extras.forEach((el) => (el.hidden = btn.dataset.open !== "true"));
      });
    }
    window.__syncSessionCollapse = syncSessionCollapse;
    syncSessionCollapse();

    $$("[data-sessions]").forEach((box) => {
      const extras = [...box.querySelectorAll("[data-extra]")];
      const btn = box.querySelector("[data-sessions-more]");
      if (!btn || !extras.length) return;
      const count = box.querySelector("[data-sessions-count]");
      if (count) count.textContent = String(extras.length);
      btn.addEventListener("click", () => {
        const open = btn.dataset.open === "true";
        extras.forEach((el) => (el.hidden = open));
        btn.dataset.open = open ? "false" : "true";
        btn.innerHTML = open ? `Ещё ${extras.length} сеансов` : "Свернуть";
        if (window.__markNextSession) window.__markNextSession();
      });
    });

    $("#toPayment").addEventListener("click", () => {
      if (!validateCheckout()) return;
      const outcome = $("#demoOutcome").value;
      if (outcome === "error-seat" || outcome === "expired") {
        if (outcome === "error-seat") {
          state.conflictSeats = state.seats.map((seat) => seat.key);
          buildHall();
          wireSeats();
        }
        state.seats = [];
        syncSeats();
        $("#demoOutcome").value = "success";
        go(outcome);
        return;
      }
      go("payment");
      if (state.pay === "saved") startDemoPayment();
    });

    $("#doPay").addEventListener("click", () => startDemoPayment());
    $("#checkPayment").addEventListener("click", () => startDemoPayment("success"));

    $$("[data-paytab]").forEach((t) =>
      t.addEventListener("click", () => {
        $$("[data-paytab]").forEach((x) => x.setAttribute("aria-selected", "false"));
        t.setAttribute("aria-selected", "true");
        $$("[data-paypanel]").forEach((el) => (el.hidden = el.dataset.paypanel !== t.dataset.paytab));
        if (t.dataset.paytab === "sbp") drawQr($("#qrCode"), 5);
      })
    );

    $("#email").addEventListener("input", (e) => {
      state.email = e.target.value;
      clearInvalid("email");
      $$('[data-bind="emailEcho"]').forEach((el) => (el.textContent = state.email || "name@mail.ru"));
    });
    $("#phone").addEventListener("input", (e) => {
      state.phone = normalizePhone(e.target.value);
      e.target.value = formatPhone(state.phone);
      clearInvalid("phone");
    });
    $("#consent").addEventListener("change", (e) => {
      state.consent = e.target.checked;
      $("[data-consent]").dataset.invalid = "false";
      e.target.removeAttribute("aria-invalid");
      const error = $("#consentError");
      if (error) error.hidden = true;
    });

    const paymentQr = $("#paymentQr");
    const paymentQrSummary = $("#paymentQrSummary");
    if (paymentQr && paymentQrSummary) {
      paymentQr.addEventListener("toggle", () => {
        if (!paymentQrSummary.hidden) {
          paymentQrSummary.textContent = paymentQr.open ? "Скрыть QR-код" : "Показать QR-код";
        }
      });
    }

    $$("[data-refund]").forEach((btn) =>
      btn.addEventListener("click", () => {
        showToast("Возврат билета оформляют в кассе или поддержке кинотеатра. Найдите заказ по email.");
      })
    );

    const share = async () => {
      const url = location.href;
      try {
        if (navigator.share) {
          await navigator.share({ title: document.title, url });
        } else {
          await navigator.clipboard.writeText(url);
          showToast("Ссылка на виджет скопирована");
        }
      } catch {
        showToast("Ссылку можно скопировать из адресной строки");
      }
    };
    $$("#shareWidget, [data-share]").forEach((btn) => btn.addEventListener("click", share));

    $("#downloadTickets").addEventListener("click", () => {
      const order = $("#ticketOrder")?.textContent || "";
      const email = state.email || "";
      const file = new Blob([
        '<!doctype html><html lang="ru"><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<title>Демо-билет Киноплан</title>',
        '<style>body{font:1rem system-ui;margin:2rem auto;padding:0 1rem;max-width:28rem}',
        'h1{font-size:1.4rem}</style>',
        '<h1>Заказ успешно оформлен</h1>',
        '<p>Номер заказа: <strong>' + order + '</strong></p>',
        '<p>Подтверждение отправлено на почту: ' + email + '</p>',
        '<p>Демо-билет для прототипа.</p></html>',
      ], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kinoplan-" + order + ".html";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // Узкое окно: десктопную рамку 1180×820 вписываем в экран масштабом,
    // иначе переключатель «Десктоп» при ширине < 940 не давал видимых изменений.
    function fitDesktopFrame() {
      const stage = $("#stage");
      const device = $(".device");
      const fit = device && device.parentElement;
      if (!stage || !device || !fit || !fit.classList.contains("device-fit")) return;
      const reset = () => {
        device.style.transform = "";
        device.style.transformOrigin = "";
        fit.style.width = "";
        fit.style.height = "";
        fit.style.overflow = "";
      };
      // мобильный режим масштабировать нечем: рамка и так 100% ширины
      if (stage.dataset.mode !== "desktop") {
        reset();
        return;
      }
      const DESKTOP_W = 1180;
      const DESKTOP_H = 820;
      const narrow = stage.clientWidth < 940;
      const k = narrow
        ? Math.min(1, (stage.clientWidth - 24) / DESKTOP_W, (stage.clientHeight - 48) / DESKTOP_H)
        : 1;
      if (k >= 0.999) {
        device.style.transform = "";
        device.style.transformOrigin = "";
        fit.style.width = "";
        fit.style.height = "";
        fit.style.overflow = "";
        return;
      }
      device.style.transformOrigin = "top left";
      device.style.transform = `scale(${k})`;
      fit.style.width = `${Math.round(DESKTOP_W * k)}px`;
      fit.style.height = `${Math.round(DESKTOP_H * k)}px`;
      fit.style.overflow = "hidden";
    }

    $$("[data-mode-btn]").forEach((b) =>
      b.addEventListener("click", () => {
        $$("[data-mode-btn]").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        $("#stage").dataset.mode = b.dataset.modeBtn;
        fitDesktopFrame();
        // ширина рамки меняется с переходом — пересчитываем после него
        setTimeout(() => {
          fitDesktopFrame();
          window.__syncSessionCollapse && window.__syncSessionCollapse();
          if (state.screen === "payment") renderPayment(paymentPhase);
        }, 320);
        hideTip();
      })
    );

    if (!window.__fitDesktopWired) {
      window.__fitDesktopWired = true;
      let fitTimer = null;
      window.addEventListener("resize", () => {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(fitDesktopFrame, 120);
      });
      fitDesktopFrame();
    }

    $("#restart").addEventListener("click", () => {
      clearPendingOrder();
      state.seats = [];
      state.conflictSeats = [];
      buildHall();
      wireSeats();
      syncSeats();
      go("afisha");
    });
    $("#directEntry").addEventListener("click", () => {
      $(".date").click();
      $('.session[data-film="rocky"][data-session="17:05"]').click();
    });
    $("#demoAuthorized")?.addEventListener("click", () => {
      login("viewer@example.com", "9001234567");
      showToast("Вы вошли как viewer@example.com");
    });

    $("#resumeContinue")?.addEventListener("click", () => {
      const pending = readPendingOrder();
      if (!pending) { closeResumeOrder(); return; }
      state.film = { ...pending.film };
      state.session = { ...pending.session };
      state.seats = pending.seats.map((s) => ({ ...s }));
      buildHall();
      wireSeats();
      syncSeats();
      renderSessionBar();
      bind();
      clearPendingOrder();
      closeResumeOrder();
      go("checkout");
      showToast("Вернули выбранные места");
    });
    $("#resumeCancel")?.addEventListener("click", () => {
      const btn = resumeTrigger;
      clearPendingOrder();
      closeResumeOrder();
      if (btn) enterSession(btn);
    });
    $$("[data-resume-close]").forEach((el) => el.addEventListener("click", closeResumeOrder));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#resumeOverlay").hidden) closeResumeOrder();
    });

    window.addEventListener("scroll", hideTip, true);
  }

  // принимаем любой формат: +7 900 123-45-67, 8 (900) 123 45 67, 9001234567
  function normalizePhone(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
    if (d.length > 10 && d[0] === "7") d = d.slice(1);
    return d.slice(0, 10);
  }

  function formatPhone(d) {
    if (!d) return "";
    const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
    return p.filter(Boolean).join(" ");
  }

  function clearInvalid(name) {
    const field = $(`[data-field="${name}"]`);
    if (field) field.dataset.invalid = "false";
  }

  function validateContacts() {
    let ok = true;
    const email = state.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(email)) {
      $('[data-field="email"]').dataset.invalid = "true";
      ok = false;
    }
    if (state.phone.length !== 10) {
      $('[data-field="phone"]').dataset.invalid = "true";
      ok = false;
    }
    if (!ok) {
      if ($("#contactFields").hidden) {
        state.editingContacts = true;
        renderAuth();
      }
      const first = $('#contactFields [data-invalid="true"] input');
      if (first) first.focus();
    }
    return ok;
  }

  function validateCheckout() {
    if (!validateContacts()) return false;
    if (state.consent) return true;
    $("[data-consent]").dataset.invalid = "true";
    const error = $("#consentError");
    if (error) error.hidden = false;
    $("#consent").setAttribute("aria-invalid", "true");
    $("#consent").scrollIntoView({ block: "center", behavior: "smooth" });
    $("#consent").focus({ preventScroll: true });
    return false;
  }

  function updateTimer() {
    const active = Boolean(state.holdUntil);
    const remaining = active ? Math.max(0, Math.ceil((state.holdUntil - Date.now()) / 1000)) : 0;
    const m = String(Math.floor(remaining / 60)).padStart(2, "0");
    const s = String(remaining % 60).padStart(2, "0");
    $$("[data-timer]").forEach((el) => {
      el.textContent = `${m}:${s}`;
      const wrap = el.closest(".holdbar") || el.closest(".timer") || el.closest(".whead__timer") || el.closest(".payment-sbp__timer");
      if (wrap) wrap.hidden = !active;
    });
    const holdHint = $("#holdHint");
    if (holdHint) holdHint.textContent = active ? "Места в брони на время оформления." : "Можно выбрать до 6 мест. Отсчёт начнётся после выбора первого места.";
    if (active && remaining === 0 && !(state.screen === "payment" && paymentPhase !== "ready")) {
      state.seats = [];
      syncSeats();
      if (state.screen !== "afisha") go("expired");
    }
  }

  /* --- отладка/демо для скриншотов --- */
  window.__demo = {
    go,
    peek(key) {
      const el = document.querySelector(`.seat[data-key="${key}"]`);
      if (el) showTip(el, 0, 0, "peek");
    },
    hint(key) {
      const el = document.querySelector(`.seat[data-key="${key}"]`);
      if (el) showTip(el, 0, 0, "hover");
    },
    select(key) {
      const el = document.querySelector(`.seat[data-key="${key}"]`);
      if (el) selectSeat(el);
    },
    hide: hideTip,
  };

  function addTitleAttrs() {
    // у обрезаемых строк полный текст должен быть доступен в подсказке
    $$(".session__hall, .film__title, .summary__title, .ticket__film, .auth-strip__name, .session__flag, .topbar__title, .topbar__meta").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t) el.setAttribute("title", t);
    });
  }

  // Суммы меняются прокруткой цифр: строка не подменяется рывком
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmtRub = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  function rollSum(el) {
    if (prefersReduced || el._rolling) return;
    const shown = (el.textContent || "").trim();
    const shownDigits = shown.replace(/[^\d]/g, "");
    const inFlight = el._rollTarget;
    if (!shownDigits) return;
    const to = Number(shownDigits);
    const from = Number(el.dataset.rollFrom || shownDigits);
    if (!Number.isFinite(to) || to === from) {
      el.dataset.rollFrom = String(to);
      el._rollTarget = null;
      return;
    }
    const suffix = shown.slice(shown.lastIndexOf(shownDigits) + shownDigits.length);
    const dur = 240;
    const start = performance.now();
    el._rolling = true;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtRub(Math.round(from + (to - from) * eased)) + suffix;
      if (k < 1) requestAnimationFrame(tick);
      else {
        el.textContent = shown;
        el.dataset.rollFrom = String(to);
        el._rolling = false;
        el._rollTarget = null;
      }
    };
    requestAnimationFrame(tick);
  }
  $$('[data-bind="total"], .sticky-cta__value').forEach((el) => {
    el.dataset.rollFrom = (el.textContent || "").replace(/[^\d]/g, "");
    new MutationObserver(() => {
      if (el._rolling) return;
      const next = (el.textContent || "").replace(/[^\d]/g, "");
      if (!next || next === el.dataset.rollFrom) return;
      el._rollTarget = next;
      rollSum(el);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });

  buildHall();
  renderSessionBar();
  addTitleAttrs();
  wire();
  wireAuth();
  wireInterrupt();
  wireSeats();
  syncSeats();
  drawQr($("#qrTicket"), 11);
  $("#qrTicket svg").setAttribute("aria-label", "Демонстрационный QR-код билета");
  setInterval(updateTimer, 1000);
})();



