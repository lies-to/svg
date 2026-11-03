
/* Achroma Christmas Update
 * Frontend Christmas event module
 * Load after achroma.js
 */
(() => {
  "use strict";

  if (window.__ACHROMA_CHRISTMAS__) return;
  window.__ACHROMA_CHRISTMAS__ = true;

  const API = "/api/christmas";
  const DAYS = 25;
  const CANES = [
    [8,18],[91,27],[5,52],[94,62],[22,82],
    [77,84],[50,9],[51,91],[15,35],[83,44],
    [35,17],[67,20],[30,70],[70,68],[8,76],
    [92,12],[44,34],[59,52],[18,58],[80,73],
    [39,88],[62,11],[3,31],[97,48],[50,75]
  ];

  const state = {
    tab: "calendar",
    opened: new Set(),
    skipped: new Set(),
    found: new Set(),
    cosmetics: new Map(),
    modal: null
  };

  const $ = (s, root = document) => root.querySelector(s);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function today() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric"
    }).formatToParts(new Date());

    const result = {};
    parts.forEach(p => {
      if (p.type !== "literal") result[p.type] = Number(p.value);
    });
    return result;
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set("Content-Type", "application/json");

    const response = await fetch(API + path, {
      credentials: "same-origin",
      ...options,
      headers
    });

    let data = {};
    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
  }

  function addCSS() {
    if ($("#achroma-christmas-css")) return;

    const link = element("link");
    link.id = "achroma-christmas-css";
    link.rel = "stylesheet";
    link.href = "/assets/christmas.css";
    document.head.appendChild(link);
  }

  function addSnow() {
    if ($("#achroma-christmas-snow")) return;

    const snow = element("div");
    snow.id = "achroma-christmas-snow";
    snow.setAttribute("aria-hidden", "true");

    for (let i = 0; i < 30; i++) {
      const flake = element("span", "achroma-xmas-flake", "❄");
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.animationDelay = `${Math.random() * 15}s`;
      flake.style.animationDuration = `${12 + Math.random() * 15}s`;
      snow.appendChild(flake);
    }

    document.body.appendChild(snow);
  }

  function createLauncher() {
    if ($("#achroma-christmas-launcher")) return;

    const button = element(
      "button",
      "achroma-xmas-launcher",
      "Christmas"
    );

    button.id = "achroma-christmas-launcher";
    button.type = "button";
    button.addEventListener("click", open);

    document.body.appendChild(button);
  }

  function createModal() {
    if (state.modal) return state.modal;

    const overlay = element("div", "achroma-xmas-overlay");
    overlay.id = "achroma-christmas-modal";

    const panel = element("section", "achroma-xmas-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");

    const header = element("header", "achroma-xmas-header");
    const heading = element("div");

    heading.appendChild(
      element("div", "achroma-xmas-eyebrow", "THE SEASON OF GIVING")
    );

    heading.appendChild(
      element("h2", "", "Christmas at Achroma")
    );

    heading.appendChild(
      element("p", "achroma-xmas-subtitle", "A little festive magic, every day.")
    );

    const close = element("button", "achroma-xmas-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", closeModal);

    header.append(heading, close);

    const tabs = element("nav", "achroma-xmas-tabs");

    const calendarTab = element("button", "active", "Advent calendar");
    calendarTab.type = "button";
    calendarTab.dataset.tab = "calendar";

    const huntTab = element("button", "", "Candy cane hunt");
    huntTab.type = "button";
    huntTab.dataset.tab = "hunt";

    [calendarTab, huntTab].forEach(button => {
      button.addEventListener("click", () => switchTab(button.dataset.tab));
      tabs.appendChild(button);
    });

    const content = element("main", "achroma-xmas-content");
    content.id = "achroma-xmas-content";

    const footer = element(
      "footer",
      "achroma-xmas-footer",
      "December 1–25 · One gift per day · Missed days are skipped"
    );

    panel.append(header, tabs, content, footer);
    overlay.appendChild(panel);

    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeModal();
    });

    document.body.appendChild(overlay);
    state.modal = overlay;

    return overlay;
  }

  function open() {
    createModal();
    state.modal.classList.add("visible");
    switchTab(state.tab);
  }

  function closeModal() {
    if (state.modal) state.modal.classList.remove("visible");
    removeCandyMarkers();
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
  });

  function switchTab(tab) {
    state.tab = tab === "hunt" ? "hunt" : "calendar";

    state.modal.querySelectorAll("[data-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === state.tab);
    });

    removeCandyMarkers();

    if (state.tab === "hunt") {
      renderHunt();
    } else {
      renderCalendar();
    }
  }

  function setContent(node) {
    const content = $("#achroma-xmas-content");
    if (content) content.replaceChildren(node);
  }

  function loading() {
    setContent(element("div", "achroma-xmas-loading", "Loading Christmas..."));
  }

  function error(message) {
    setContent(
      element("div", "achroma-xmas-error", message || "Something went wrong.")
    );
  }

  async function renderCalendar() {
    loading();

    try {
      const data = await request("/calendar");

      state.opened = new Set((data.openedDays || []).map(Number));
      state.skipped = new Set((data.skippedDays || []).map(Number));

      const date = today();
      const december = date.month === 12;
      const currentDay = december ? date.day : 0;
      const wrapper = element("div", "achroma-xmas-calendar");

      const intro = element("div", "achroma-xmas-intro");
      intro.appendChild(element("h3", "", "Your countdown to Christmas"));

      let description = "The first gift unlocks December 1.";

      if (december && currentDay >= 1 && currentDay <= DAYS) {
        description = `Today is December ${currentDay}. Open today's gift!`;
      } else if (december && currentDay > DAYS) {
        description = "This year's calendar has closed. Merry Christmas!";
      }

      intro.appendChild(element("p", "achroma-xmas-muted", description));
      wrapper.appendChild(intro);

      const grid = element("div", "achroma-xmas-grid");

      for (let day = 1; day <= DAYS; day++) {
        let status = "locked";

        if (state.opened.has(day)) {
          status = "opened";
        } else if (state.skipped.has(day) ||
          (december && day < currentDay)) {
          status = "missed";
        } else if (december && day === currentDay &&
          currentDay <= DAYS) {
          status = "today";
        }

        const gift = element("button", `achroma-xmas-gift ${status}`);
        gift.type = "button";
        gift.disabled = status !== "today";

        gift.appendChild(element("span", "achroma-xmas-gift-day", day));
        gift.appendChild(element(
          "span",
          "achroma-xmas-gift-symbol",
          status === "opened" ? "✓" :
          status === "missed" ? "—" : "✦"
        ));
        gift.appendChild(element(
          "span",
          "achroma-xmas-gift-status",
          status === "opened" ? "Opened" :
          status === "missed" ? "Missed" :
          status === "today" ? "Open today" : "Gift"
        ));

        if (status === "today") {
          gift.addEventListener("click", () => claimGift(day, gift));
        }

        grid.appendChild(gift);
      }

      wrapper.appendChild(grid);

      wrapper.appendChild(element(
        "p",
        "achroma-xmas-note",
        "Each gift contains 1–5 coins. Day 25 also unlocks the exclusive Christmas name color and profile badge."
      ));

      setContent(wrapper);

    } catch (err) {
      error(err.message);
    }
  }

  async function claimGift(day, button) {
    button.disabled = true;

    try {
      const result = await request("/calendar/open", {
        method: "POST",
        body: JSON.stringify({ day })
      });

      await renderCalendar();

      const reward = element("div", "achroma-xmas-reward");

      let message = `You received ${result.coins} coins. Merry Christmas!`;

      if (result.special) {
        message = `You received ${result.coins} coins, plus the Christmas name color and badge!`;

        window.dispatchEvent(new CustomEvent(
          "achroma:christmas-cosmetics",
          {
            detail: result.cosmetics || {
              nameColor: "#e34b55",
              badge: "christmas"
            }
          }
        ));
      }

      reward.appendChild(element("span", "", "✦"));
      reward.appendChild(element("strong", "", message));

      const content = $("#achroma-xmas-content");
      if (content) content.prepend(reward);

    } catch (err) {
      button.disabled = false;
      error(err.message);
    }
  }

  async function renderHunt() {
    loading();

    try {
      const data = await request("/hunt");

      state.found = new Set((data.found || []).map(String));

      const wrapper = element("div", "achroma-xmas-hunt");

      wrapper.appendChild(element(
        "h3",
        "",
        "Find the hidden candy canes"
      ));

      wrapper.appendChild(element(
        "p",
        "achroma-xmas-muted",
        "Candy canes are hidden around the site. Find them to collect coins. Each location can only be collected once."
      ));

      wrapper.appendChild(element(
        "div",
        "achroma-xmas-hunt-count",
        `${data.collected || 0} / ${data.total || CANES.length} found`
      ));

      const meter = element("div", "achroma-xmas-meter");
      const fill = element("span");
      fill.id = "achroma-xmas-hunt-progress";
      fill.style.width =
        `${Math.min(100, (data.collected || 0) / (data.total || CANES.length) * 100)}%`;

      meter.appendChild(fill);
      wrapper.appendChild(meter);

      wrapper.appendChild(element(
        "p",
        "achroma-xmas-muted",
        "Tap a candy cane marker anywhere on the page to collect it."
      ));

      setContent(wrapper);
      placeCandyMarkers();

    } catch (err) {
      error(err.message);
    }
  }

  function removeCandyMarkers() {
    document.querySelectorAll(".achroma-xmas-cane-marker")
      .forEach(node => node.remove());
  }

  function placeCandyMarkers() {
    removeCandyMarkers();

    CANES.forEach((position, index) => {
      const id = String(index);
      if (state.found.has(id)) return;

      const marker = element(
        "button",
        "achroma-xmas-cane-marker",
        "🍬"
      );

      marker.type = "button";
      marker.title = "Collect candy cane";
      marker.setAttribute("aria-label", "Collect candy cane");
      marker.style.left = `${position[0]}%`;
      marker.style.top = `${position[1]}%`;

      marker.addEventListener("click", () => collectCane(id, marker));

      document.body.appendChild(marker);
    });
  }

  async function collectCane(id, marker) {
    marker.disabled = true;

    try {
      const result = await request("/hunt/collect", {
        method: "POST",
        body: JSON.stringify({ caneId: id })
      });

      state.found.add(id);
      marker.remove();

      const count = $(".achroma-xmas-hunt-count");
      if (count) {
        count.textContent = `${result.collected} / ${result.total} found`;
      }

      const progress = $("#achroma-xmas-hunt-progress");
      if (progress) {
        progress.style.width =
          `${Math.min(100, result.collected / result.total * 100)}%`;
      }

    } catch (err) {
      marker.disabled = false;
      error(err.message);
    }
  }

  function addBadge(node, cosmetic) {
    if (node.querySelector(".achroma-xmas-name-badge")) return;

    node.classList.add("achroma-xmas-name");
    node.style.setProperty(
      "--achroma-xmas-name-color",
      cosmetic.nameColor || "#e34b55"
    );

    const badge = element(
      "span",
      "achroma-xmas-name-badge",
      "✦"
    );

    badge.title = "Christmas badge";
    node.appendChild(badge);
  }

  async function decorateUsername(node) {
    const id = node.getAttribute("data-user-id");
    if (!id || node.dataset.xmasChecked === "1") return;

    node.dataset.xmasChecked = "1";

    if (state.cosmetics.has(id)) {
      const cached = state.cosmetics.get(id);
      if (cached.christmas) addBadge(node, cached);
      return;
    }

    try {
      const cosmetic = await request(
        `/cosmetics/${encodeURIComponent(id)}`
      );

      state.cosmetics.set(id, cosmetic);

      if (cosmetic.christmas) {
        addBadge(node, cosmetic);
      }

    } catch (_) {
      delete node.dataset.xmasChecked;
    }
  }

  function scanUsernames() {
    document.querySelectorAll("[data-user-id]").forEach(decorateUsername);
  }

  function watchUsernames() {
    const observer = new MutationObserver(() => {
      scanUsernames();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    scanUsernames();
  }

  function initialize() {
    addCSS();
    addSnow();
    createLauncher();
    watchUsernames();

    window.AchromaChristmas = {
      open,
      close: closeModal,
      refresh: () => state.tab === "hunt"
        ? renderHunt()
        : renderCalendar(),
      decorateUsername
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
