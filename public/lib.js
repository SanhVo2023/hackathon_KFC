// Tiny shared helpers — no framework, no build step.
window.KFC = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const fmtVND = (n) => (n ?? 0).toLocaleString("vi-VN") + "₫";

  let sessionId = (() => {
    let id = localStorage.getItem("kfc_session");
    if (!id) { id = "s-" + Math.random().toString(36).slice(2, 12); localStorage.setItem("kfc_session", id); }
    return id;
  })();

  // each customer journey gets its own session (profiles are per-customer)
  function rotateSession() {
    sessionId = "s-" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem("kfc_session", sessionId);
    return sessionId;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { "content-type": "application/json", "x-session-id": sessionId, ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return res.json();
  }

  // kiosk -> parent desktop view: instant UI-side edges on the live diagram
  function postEvent(type, label, data) {
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ kfcTelemetry: true, type, label, data, ts: Date.now() }, "*");
      }
    } catch (_) { /* standalone mode */ }
  }

  const CAT_META = {
    "combo": { vi: "Combo", en: "Combos", icon: "🍗🍟" },
    "chicken": { vi: "Gà Rán - Gà Quay", en: "Chicken", icon: "🍗" },
    "burger-rice": { vi: "Burger - Cơm - Mì", en: "Burgers & Rice", icon: "🍔" },
    "snack": { vi: "Thức Ăn Nhẹ", en: "Snacks & Sides", icon: "🍟" },
    "drink": { vi: "Thức Uống", en: "Drinks", icon: "🥤" },
    "dessert": { vi: "Tráng Miệng", en: "Desserts", icon: "🍦" },
  };

  const DAYPART_META = {
    breakfast: { vi: "Bữa sáng", en: "Breakfast", icon: "🌅" },
    lunch: { vi: "Giờ trưa", en: "Lunchtime", icon: "☀️" },
    tea: { vi: "Giờ xế", en: "Tea break", icon: "🕒" },
    dinner: { vi: "Giờ tối", en: "Dinnertime", icon: "🌆" },
    late: { vi: "Đêm muộn", en: "Late night", icon: "🌙" },
  };

  return { $, $$, fmtVND, get sessionId() { return sessionId; }, rotateSession, api, postEvent, CAT_META, DAYPART_META };
})();
