// KFC self-order kiosk — full customer journey state machine.
(() => {
  const { $, $$, fmtVND, api, postEvent, CAT_META, DAYPART_META, sessionId } = window.KFC;

  // ---------- i18n ----------
  const L = {
    vi: {
      attract_sub: "Đặt món ngay tại đây", tap_to_start: "Chạm để bắt đầu",
      attract_ai: "Trợ lý AI gợi ý món hợp khẩu vị",
      where_eat: "Bạn dùng bữa ở đâu?", dine_in: "Ăn tại đây", takeaway: "Mang đi",
      your_order: "Đơn của bạn", add_more: "+ Thêm món", checkout: "Thanh toán",
      apply: "Áp dụng", check: "Kiểm tra", payment: "Thanh toán",
      card: "Thẻ", cash: "Tiền mặt tại quầy", scan_qr: "Quét mã để thanh toán", back: "← Quay lại",
      order_placed: "Đặt món thành công!", order_number_is: "Số đơn của bạn", new_order: "Bắt đầu đơn mới",
      view_cart: "Xem đơn hàng", rec_title: "Thường được gọi kèm", no_thanks: "Không, cảm ơn",
      chat_fab: "Trợ lý AI", chat_title: "KFC Trợ Lý — đặt món bằng lời",
      added: "Đã thêm vào đơn", subtotal: "Tạm tính", discount: "Giảm giá", total: "Tổng cộng",
      empty_cart: "Chưa có món nào. Chạm “+ Thêm món” nhé!",
      status_received: "Đã nhận", status_preparing: "Đang chuẩn bị", status_ready: "Sẵn sàng", status_completed: "Hoàn tất",
      voucher_ok: (c, d) => `Mã ${c} hợp lệ: giảm ${d}`, voucher_bad: "Mã không áp dụng được lúc này",
      loyalty_ok: (n, p, t) => `Chào ${n}! Bạn có ${p} điểm (hạng ${t}).`, loyalty_bad: "Số này chưa là thành viên",
      handoff_banner: "👤 Nhân viên đang hỗ trợ bạn trực tiếp",
      chat_suggests: ["Gợi ý combo cho 2 người", "Có khuyến mãi gì không?", "Kiểm tra điểm thành viên", "Món nào cay?"],
      agent_name: "Trợ lý AI", staff_name: "Nhân viên KFC",
    },
    en: {
      attract_sub: "Order right here", tap_to_start: "Tap to start",
      attract_ai: "AI assistant suggests dishes you'll love",
      where_eat: "Where are you eating?", dine_in: "Dine in", takeaway: "Take away",
      your_order: "Your order", add_more: "+ Add items", checkout: "Checkout",
      apply: "Apply", check: "Check", payment: "Payment",
      card: "Card", cash: "Cash at counter", scan_qr: "Scan to pay", back: "← Back",
      order_placed: "Order placed!", order_number_is: "Your order number", new_order: "Start new order",
      view_cart: "View order", rec_title: "Great with your order", no_thanks: "No, thanks",
      chat_fab: "AI Assistant", chat_title: "KFC Assistant — order by chat",
      added: "Added to order", subtotal: "Subtotal", discount: "Discount", total: "Total",
      empty_cart: "Nothing here yet. Tap “+ Add items”!",
      status_received: "Received", status_preparing: "Preparing", status_ready: "Ready", status_completed: "Done",
      voucher_ok: (c, d) => `Code ${c} valid: ${d} off`, voucher_bad: "Code doesn't apply right now",
      loyalty_ok: (n, p, t) => `Hi ${n}! You have ${p} points (${t} tier).`, loyalty_bad: "Not a member yet",
      handoff_banner: "👤 A staff member is helping you directly",
      chat_suggests: ["Suggest a combo for 2", "Any promos now?", "Check my points", "What's spicy?"],
      agent_name: "AI Assistant", staff_name: "KFC Staff",
    },
  };

  // ---------- state ----------
  const S = {
    lang: "vi",
    screen: "attract",
    orderType: null,
    menu: [], byCat: {}, cats: [], activeCat: null,
    daypart: null, promos: [],
    cart: [], // {item, qty, mods:[], fromRec:bool}
    voucher: null, loyalty: null,
    chatHistory: [], chatOpen: false,
    handoff: false, chatPollCursor: 0, chatPollTimer: null,
    lastOrder: null, statusTimer: null,
    recSheetItems: [],
  };

  const t = (k, ...a) => { const v = L[S.lang][k]; return typeof v === "function" ? v(...a) : v; };

  function applyI18n() {
    $$("[data-i18n]").forEach((el) => { const v = L[S.lang][el.dataset.i18n]; if (typeof v === "string") el.textContent = v; });
    $("#btn-lang").textContent = S.lang === "vi" ? "EN" : "VI";
  }

  function itemName(m) { return S.lang === "en" && m.name_en ? m.name_en : m.name; }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // ---------- navigation ----------
  function show(screen) {
    S.screen = screen;
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $(`#screen-${screen}`).classList.add("active");
    document.getElementById("kiosk").classList.toggle("screen-attract-mode", screen === "attract");
    $("#kiosk-header").style.display = screen === "attract" ? "none" : "flex";
    const inFlow = ["menu", "cart"].includes(screen);
    $("#cart-bar").classList.toggle("hidden", !(inFlow && S.cart.length && screen !== "cart"));
    $("#chat-fab").classList.toggle("hidden", !["menu", "cart", "payment"].includes(screen));
    postEvent("screen_change", `kiosk screen → ${screen}`);
    if (screen === "cart") renderCart();
  }

  // ---------- menu ----------
  async function loadMenu() {
    const data = await api("/api/menu");
    S.menu = data.items;
    S.daypart = data.daypart;
    S.byCat = {};
    for (const m of S.menu) (S.byCat[m.category] ??= []).push(m);
    S.cats = ["combo", "chicken", "burger-rice", "snack", "drink", "dessert"].filter((c) => S.byCat[c]?.length);
    S.activeCat ??= S.cats[0];
    const promoData = await api("/api/promotions");
    S.promos = promoData.promotions;
    renderDaypartBanner();
    renderCats();
    renderGrid();
  }

  function renderDaypartBanner() {
    const dp = DAYPART_META[S.daypart] ?? {};
    const now = S.promos.filter((p) => p.applies_now);
    const promoTxt = now.length ? ` · ${now[0].name}` : "";
    $("#daypart-banner").innerHTML = `${dp.icon ?? ""} <b>${S.lang === "vi" ? dp.vi : dp.en}</b>${promoTxt}`;
  }

  function renderCats() {
    $("#cat-rail").innerHTML = S.cats.map((c) => {
      const meta = CAT_META[c];
      return `<button class="cat-btn ${c === S.activeCat ? "active" : ""}" data-cat="${c}">
        <span class="ci">${meta.icon.slice(0, 2)}</span><span>${S.lang === "vi" ? meta.vi : meta.en}</span></button>`;
    }).join("");
  }

  function imgTag(m, cls, phCls) {
    const icon = (CAT_META[m.category]?.icon ?? "🍗").slice(0, 2);
    if (!m.image_url) return `<div class="${phCls}">${icon}</div>`;
    return `<img class="${cls}" src="${m.image_url}" alt="" loading="lazy"
      onerror="this.outerHTML='<div class=&quot;${phCls}&quot;>${icon}</div>'" />`;
  }

  function renderGrid() {
    const items = S.byCat[S.activeCat] ?? [];
    $("#menu-grid").innerHTML = items.map((m) => `
      <button class="menu-card" data-id="${m.id}">
        ${imgTag(m, "mc-img", "mc-img-ph")}
        <span class="mc-body">
          <span class="mc-name">${itemName(m)}</span>
          <span class="mc-price-row"><span class="mc-price">${fmtVND(m.price)}</span><span class="mc-add">+</span></span>
        </span>
      </button>`).join("");
  }

  // ---------- item modal ----------
  let modalState = null;
  function openItem(id) {
    const m = S.menu.find((x) => x.id === id);
    if (!m) return;
    const mods = m.modifiers ? JSON.parse(m.modifiers) : null;
    modalState = { m, qty: 1, sel: (mods ?? []).map(() => 0) };
    postEvent("tap", `view item: ${m.name}`);
    const el = $("#item-modal");
    el.innerHTML = `
      ${imgTag(m, "im-img", "im-img-ph")}
      <button class="im-close" id="im-close">✕</button>
      <div class="im-body">
        <div class="im-name">${itemName(m)}</div>
        <div class="im-desc">${m.description ?? ""}</div>
        <div class="im-price" id="im-price"></div>
        ${mods ? `<div class="im-mods">${mods.map((g, gi) => `
          <div><div class="im-mod-group">${S.lang === "vi" ? g.group : (g.group_en ?? g.group)}</div>
          <div class="im-mod-opts">${g.options.map((o, oi) => `
            <button class="im-mod-opt ${oi === 0 ? "sel" : ""}" data-g="${gi}" data-o="${oi}">
              ${S.lang === "vi" ? o.name : (o.name_en ?? o.name)}${o.delta ? ` +${fmtVND(o.delta)}` : ""}</button>`).join("")}</div></div>`).join("")}</div>` : ""}
        <div class="im-qtyrow">
          <button class="im-qbtn" id="im-minus">−</button>
          <span class="im-qty" id="im-qty">1</span>
          <button class="im-qbtn" id="im-plus">+</button>
        </div>
        <button class="im-add" id="im-add"></button>
      </div>`;
    $("#item-backdrop").classList.remove("hidden");
    el.classList.remove("hidden");
    refreshModalPrice();
  }

  function modalUnit() {
    const { m, sel } = modalState;
    const mods = m.modifiers ? JSON.parse(m.modifiers) : [];
    let price = m.price;
    mods.forEach((g, gi) => { price += g.options[sel[gi]]?.delta ?? 0; });
    return price;
  }
  function refreshModalPrice() {
    const { qty } = modalState;
    $("#im-price").textContent = fmtVND(modalUnit() * qty);
    $("#im-qty").textContent = qty;
    $("#im-add").textContent = `${t("added").replace("Đã thêm vào đơn", "Thêm vào đơn").replace("Added to order", "Add to order")} · ${fmtVND(modalUnit() * qty)}`;
  }
  function closeItem() {
    $("#item-backdrop").classList.add("hidden");
    $("#item-modal").classList.add("hidden");
    modalState = null;
  }

  // ---------- cart ----------
  function addToCart(m, qty = 1, mods = [], fromRec = false, silent = false) {
    const existing = S.cart.find((l) => l.item.id === m.id && JSON.stringify(l.mods) === JSON.stringify(mods));
    if (existing) existing.qty += qty; else S.cart.push({ item: m, qty, mods, fromRec });
    postEvent("add_to_cart", `${fromRec ? "[AI rec] " : ""}${m.name} ×${qty}`, { id: m.id, fromRec });
    if (!silent) toast(`✓ ${t("added")}: ${itemName(m)}`);
    updateCartBar();
  }

  function cartSubtotal() {
    return S.cart.reduce((s, l) => {
      const mods = l.item.modifiers ? JSON.parse(l.item.modifiers) : [];
      let unit = l.item.price;
      l.mods.forEach((sel, gi) => { unit += mods[gi]?.options[sel]?.delta ?? 0; });
      return s + unit * l.qty;
    }, 0);
  }

  function voucherDiscount(subtotal) {
    if (!S.voucher) return 0;
    if (S.voucher.min_order > subtotal) return 0;
    return S.voucher.kind === "percent" ? Math.floor(subtotal * S.voucher.value / 100)
      : S.voucher.kind === "amount" ? S.voucher.value : 0;
  }

  function updateCartBar() {
    const n = S.cart.reduce((s, l) => s + l.qty, 0);
    $("#cb-count").textContent = n;
    $("#cb-total").textContent = fmtVND(cartSubtotal());
    $("#cart-bar").classList.toggle("hidden", !(n && S.screen === "menu"));
  }

  function renderCart() {
    const lines = $("#cart-lines");
    if (!S.cart.length) {
      lines.innerHTML = `<div class="cart-empty">${t("empty_cart")}</div>`;
    } else {
      lines.innerHTML = S.cart.map((l, i) => {
        const mods = l.item.modifiers ? JSON.parse(l.item.modifiers) : [];
        const modTxt = l.mods.map((sel, gi) => mods[gi]?.options[sel]?.name).filter(Boolean).join(", ");
        let unit = l.item.price;
        l.mods.forEach((sel, gi) => { unit += mods[gi]?.options[sel]?.delta ?? 0; });
        return `<div class="cart-line">
          <span class="cl-name">${itemName(l.item)}${l.fromRec ? ` <span class="cl-ai">✦ AI</span>` : ""}${modTxt ? `<small>${modTxt}</small>` : ""}</span>
          <span class="cl-qty">
            <button class="cl-qbtn" data-i="${i}" data-d="-1">−</button>
            <span class="cl-q">${l.qty}</span>
            <button class="cl-qbtn" data-i="${i}" data-d="1">+</button>
          </span>
          <span class="cl-price">${fmtVND(unit * l.qty)}</span>
        </div>`;
      }).join("");
    }
    renderSummary();
    $("#btn-checkout").disabled = !S.cart.length;
    if (S.cart.length) loadCartRecs();
    else $("#cart-recs").innerHTML = "";
  }

  function renderSummary() {
    const sub = cartSubtotal();
    const disc = voucherDiscount(sub);
    $("#cart-summary").innerHTML = `
      <div class="sum-row"><span>${t("subtotal")}</span><span>${fmtVND(sub)}</span></div>
      ${disc ? `<div class="sum-row"><span>${t("discount")} (${S.voucher.code})</span><span class="neg">−${fmtVND(disc)}</span></div>` : ""}
      <div class="sum-row total"><span>${t("total")}</span><span>${fmtVND(sub - disc)}</span></div>`;
  }

  // ---------- recommendations (P2) ----------
  async function showRecSheet() {
    const cart = S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty }));
    postEvent("rec_request", "kiosk asks rec engine (item added)");
    try {
      const data = await api("/api/recommend", { method: "POST", body: { session_id: sessionId, cart, trigger: "item_added" } });
      const items = (data.items ?? []).slice(0, 3);
      if (!items.length) return;
      S.recSheetItems = items;
      postEvent("rec_shown", `AI suggests: ${items.map((i) => i.name).join(", ")}`);
      $("#rec-items").innerHTML = items.map((r) => `
        <div class="rec-item">
          ${imgTag(r, "ri-img", "ri-img-ph")}
          <span class="ri-body">
            <span class="ri-name">${S.lang === "en" && r.name_en ? r.name_en : r.name}</span>
            <div class="ri-pitch">${S.lang === "vi" ? r.pitch_vn : r.pitch_en}</div>
            <div class="ri-price">${r.price_display}</div>
          </span>
          <button class="ri-add" data-id="${r.id}">+ ${S.lang === "vi" ? "Thêm" : "Add"}</button>
        </div>`).join("");
      $("#rec-backdrop").classList.remove("hidden");
      $("#rec-sheet").classList.remove("hidden");
    } catch (_) { /* rec failure never blocks ordering */ }
  }

  function closeRecSheet(dismissed) {
    $("#rec-backdrop").classList.add("hidden");
    $("#rec-sheet").classList.add("hidden");
    if (dismissed) {
      api("/api/rec-feedback", { method: "POST", body: { session_id: sessionId, dismissed: true } });
      postEvent("rec_dismissed", "customer dismissed AI suggestions");
    }
  }

  async function loadCartRecs() {
    const cart = S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty }));
    try {
      const data = await api("/api/recommend", { method: "POST", body: { session_id: sessionId, cart, trigger: "cart_review" } });
      const items = (data.items ?? []).slice(0, 3);
      if (!items.length) { $("#cart-recs").innerHTML = ""; return; }
      postEvent("rec_shown", `cart review AI strip: ${items.map((i) => i.name).join(", ")}`);
      $("#cart-recs").innerHTML = `
        <div class="rec-strip-title"><span class="ai-badge">✦ AI</span> ${t("rec_title")}</div>
        <div class="rec-strip">${items.map((r) => `
          <button class="rs-card" data-id="${r.id}">
            <div class="rs-name">${S.lang === "en" && r.name_en ? r.name_en : r.name}</div>
            <div class="rs-pitch">${S.lang === "vi" ? r.pitch_vn : r.pitch_en}</div>
            <div class="rs-price">+ ${r.price_display}</div>
          </button>`).join("")}</div>`;
      S.recSheetItems = items;
    } catch (_) { /* non-blocking */ }
  }

  function acceptRec(id) {
    const r = S.recSheetItems.find((x) => x.id === id);
    const m = S.menu.find((x) => x.id === id);
    if (!m) return;
    addToCart(m, 1, (m.modifiers ? JSON.parse(m.modifiers) : []).map(() => 0), true);
    api("/api/rec-feedback", { method: "POST", body: { session_id: sessionId, accepted_item_id: id } });
    postEvent("rec_accepted", `customer accepted AI rec: ${m.name}`, { id });
    if (S.screen === "cart") renderCart();
  }

  // ---------- checkout ----------
  async function placeOrder(method) {
    $("#pay-methods").classList.add("hidden");
    $("#pay-qr").classList.toggle("hidden", method === "cash" || method === "card");
    if (!$("#qr-box").children.length) {
      $("#qr-box").innerHTML = Array.from({ length: 169 }, () => (Math.random() > .5 ? "<i></i>" : "<span></span>")).join("");
    }
    postEvent("payment", `payment method: ${method}`);
    await new Promise((r) => setTimeout(r, 2200)); // simulated PSP roundtrip

    const items = S.cart.map((l) => {
      const mods = l.item.modifiers ? JSON.parse(l.item.modifiers) : [];
      return {
        item_id: l.item.id, quantity: l.qty,
        modifiers: l.mods.map((sel, gi) => mods[gi]?.options[sel]?.name).filter(Boolean),
      };
    });
    const recIds = S.cart.filter((l) => l.fromRec).map((l) => l.item.id);
    const out = await api("/api/order", {
      method: "POST",
      body: {
        session_id: sessionId, items, order_type: S.orderType,
        promo_code: S.voucher?.code, loyalty_phone: S.loyalty?.phone, rec_item_ids: recIds,
      },
    });
    if (!out.ok) { toast("⚠ " + (out.error ?? "error")); show("cart"); return; }
    S.lastOrder = out.order;
    renderConfirm();
    show("confirm");
    // reset cart state (keep session)
    S.cart = []; S.voucher = null;
    updateCartBar();
    pollOrderStatus();
  }

  function renderConfirm() {
    const o = S.lastOrder;
    $("#order-number").textContent = o.order_number;
    $("#confirm-summary").textContent =
      `${o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")} — ${o.total_display}` +
      (o.promo_code ? ` (${o.promo_code} −${o.discount_display})` : "");
    renderStatusTrack(o.status);
  }

  function renderStatusTrack(status) {
    const steps = ["received", "preparing", "ready", "completed"];
    const idx = steps.indexOf(status);
    $("#order-status-track").innerHTML = steps.map((s, i) =>
      `<span class="ost-step ${i <= idx ? "on" : ""}">${t("status_" + s)}</span>${i < 3 ? '<span class="ost-sep">→</span>' : ""}`).join("");
  }

  function pollOrderStatus() {
    clearInterval(S.statusTimer);
    S.statusTimer = setInterval(async () => {
      if (!S.lastOrder || S.screen !== "confirm") { clearInterval(S.statusTimer); return; }
      const o = await api(`/api/order/${S.lastOrder.order_id}`);
      if (o.status) {
        renderStatusTrack(o.status);
        if (o.status === "completed") clearInterval(S.statusTimer);
      }
    }, 3000);
  }

  // ---------- chat (P4) ----------
  function openChat() {
    S.chatOpen = true;
    $("#chat-panel").classList.remove("hidden");
    $("#chat-fab").classList.add("hidden");
    renderChatSuggests();
    if (!S.chatHistory.length) {
      pushMsg("agent", S.lang === "vi"
        ? "Xin chào! Mình là trợ lý AI của KFC. Bạn muốn ăn gì hôm nay? 🍗"
        : "Hi! I'm KFC's AI assistant. What are you craving today? 🍗", false);
    }
    postEvent("tap", "opened AI chat assistant");
  }
  function closeChat() {
    S.chatOpen = false;
    $("#chat-panel").classList.add("hidden");
    if (["menu", "cart", "payment"].includes(S.screen)) $("#chat-fab").classList.remove("hidden");
  }

  function renderChatSuggests() {
    $("#chat-suggest").innerHTML = t("chat_suggests").map((s) => `<button class="cs-chip">${s}</button>`).join("");
  }

  function pushMsg(role, content, record = true) {
    const who = role === "agent" ? `<span class="who">✦ ${t("agent_name")}</span>` : role === "staff" ? `<span class="who">👤 ${t("staff_name")}</span>` : "";
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    const safe = content.replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")   // the model loves bold — render it
      .replace(/^#+\s*/gm, "");
    div.innerHTML = who + safe;
    $("#chat-msgs").appendChild(div);
    $("#chat-msgs").scrollTop = 1e9;
    if (record && (role === "user" || role === "agent")) S.chatHistory.push({ role: role === "agent" ? "assistant" : "user", content });
  }

  async function sendChat(text) {
    if (!text.trim()) return;
    pushMsg("user", text);
    const typing = document.createElement("div");
    typing.className = "msg typing";
    typing.textContent = "…";
    $("#chat-msgs").appendChild(typing);
    $("#chat-msgs").scrollTop = 1e9;

    const cart = S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty, name: l.item.name }));
    try {
      const out = await api("/api/chat", {
        method: "POST",
        body: { session_id: sessionId, messages: S.chatHistory.slice(-10), cart },
      });
      typing.remove();
      if (out.handoff) { enterHandoffMode(); return; }
      if (out.reply) pushMsg("agent", out.reply);
      for (const e of out.effects ?? []) applyEffect(e);
    } catch (err) {
      typing.remove();
      pushMsg("agent", S.lang === "vi" ? "Xin lỗi, có lỗi nhỏ. Bạn thử lại nhé!" : "Sorry, something hiccuped. Try again!");
    }
  }

  function applyEffect(e) {
    if (e.type === "add_to_cart") {
      const m = S.menu.find((x) => x.id === e.payload.item.id);
      if (m) { addToCart(m, e.payload.quantity ?? 1, (m.modifiers ? JSON.parse(m.modifiers) : []).map(() => 0), false, true); toast(`✓ ${t("added")}: ${itemName(m)}`); }
      if (S.screen === "cart") renderCart();
    } else if (e.type === "order_confirmed") {
      S.lastOrder = e.payload;
      S.cart = []; S.voucher = null;
      updateCartBar();
      closeChat();
      renderConfirm();
      show("confirm");
      pollOrderStatus();
    } else if (e.type === "voucher_applied") {
      const p = S.promos.find((x) => x.code === e.payload.code);
      if (p) { S.voucher = p; if (S.screen === "cart") renderSummary(); }
      toast(`🎟 ${e.payload.code} −${e.payload.discount_display}`);
    } else if (e.type === "handoff") {
      enterHandoffMode(e.payload?.staff?.name);
    }
  }

  // ---------- human-in-the-loop ----------
  function enterHandoffMode(staffName) {
    if (S.handoff) return;
    S.handoff = true;
    $("#chat-handoff").classList.remove("hidden");
    $("#chat-handoff").textContent = t("handoff_banner") + (staffName ? ` — ${staffName}` : "");
    postEvent("handoff", `session routed to human staff${staffName ? `: ${staffName}` : ""}`);
    startChatPoll();
  }
  function exitHandoffMode() {
    S.handoff = false;
    $("#chat-handoff").classList.add("hidden");
    clearInterval(S.chatPollTimer);
  }
  function startChatPoll() {
    clearInterval(S.chatPollTimer);
    S.chatPollTimer = setInterval(async () => {
      try {
        const out = await api(`/api/chat/poll?session_id=${sessionId}&after=${S.chatPollCursor}`);
        for (const m of out.messages ?? []) {
          S.chatPollCursor = Math.max(S.chatPollCursor, m.id);
          if (m.role === "staff") { pushMsg("staff", m.content, false); postEvent("staff_reply", "staff replied to customer"); }
        }
        if (out.handoff && out.handoff.status === "resolved") {
          exitHandoffMode();
          pushMsg("agent", S.lang === "vi" ? "Mình là trợ lý AI, tiếp tục hỗ trợ bạn nhé!" : "AI assistant back with you!", false);
        }
      } catch (_) { /* keep polling */ }
    }, 2500);
  }

  // prime the poll cursor so old messages don't replay
  api(`/api/chat/poll?session_id=${sessionId}&after=0`).then((out) => {
    for (const m of out.messages ?? []) S.chatPollCursor = Math.max(S.chatPollCursor, m.id);
    if (out.handoff && ["pending", "active"].includes(out.handoff.status)) enterHandoffMode();
  }).catch(() => {});

  // ---------- events ----------
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.id === "btn-start") { S.orderType = null; show("ordertype"); }
    else if (btn.classList.contains("ordertype-card")) { S.orderType = btn.dataset.type; postEvent("tap", `order type: ${S.orderType}`); show("menu"); }
    else if (btn.classList.contains("cat-btn")) { S.activeCat = btn.dataset.cat; renderCats(); renderGrid(); postEvent("tap", `category: ${btn.dataset.cat}`); }
    else if (btn.classList.contains("menu-card")) openItem(Number(btn.dataset.id));
    else if (btn.id === "im-close") closeItem();
    else if (btn.id === "im-minus") { modalState.qty = Math.max(1, modalState.qty - 1); refreshModalPrice(); }
    else if (btn.id === "im-plus") { modalState.qty += 1; refreshModalPrice(); }
    else if (btn.classList.contains("im-mod-opt")) {
      modalState.sel[Number(btn.dataset.g)] = Number(btn.dataset.o);
      $$(`.im-mod-opt[data-g="${btn.dataset.g}"]`).forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
      refreshModalPrice();
    }
    else if (btn.id === "im-add") {
      const { m, qty, sel } = modalState;
      addToCart(m, qty, sel);
      closeItem();
      showRecSheet();
    }
    else if (btn.id === "rec-close" || btn.id === "rec-skip") closeRecSheet(true);
    else if (btn.classList.contains("ri-add") || btn.classList.contains("rs-card")) {
      acceptRec(Number(btn.dataset.id));
      if (btn.classList.contains("ri-add")) closeRecSheet(false);
    }
    else if (btn.id === "cart-bar") show("cart");
    else if (btn.id === "btn-back-menu") show("menu");
    else if (btn.id === "btn-checkout") { $("#pay-total").textContent = fmtVND(cartSubtotal() - voucherDiscount(cartSubtotal())); $("#pay-methods").classList.remove("hidden"); $("#pay-qr").classList.add("hidden"); show("payment"); }
    else if (btn.classList.contains("pay-card")) placeOrder(btn.dataset.method);
    else if (btn.id === "btn-back-cart") show("cart");
    else if (btn.id === "btn-new-order") { show("attract"); }
    else if (btn.id === "btn-home") { if (S.screen !== "attract") show(S.cart.length ? "menu" : "attract"); }
    else if (btn.id === "btn-lang") { S.lang = S.lang === "vi" ? "en" : "vi"; applyI18n(); renderCats(); renderGrid(); renderDaypartBanner(); renderChatSuggests(); if (S.screen === "cart") renderCart(); postEvent("tap", `language → ${S.lang}`); }
    else if (btn.id === "chat-fab") openChat();
    else if (btn.id === "chat-close") closeChat();
    else if (btn.classList.contains("cs-chip")) { sendChat(btn.textContent); }
    else if (btn.id === "btn-voucher") applyVoucherUI();
    else if (btn.id === "btn-loyalty") checkLoyaltyUI();
  });

  $("#item-backdrop").addEventListener("click", closeItem);
  $("#rec-backdrop").addEventListener("click", () => closeRecSheet(true));
  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chat-input");
    sendChat(input.value);
    input.value = "";
  });

  async function applyVoucherUI() {
    const code = $("#voucher-input").value.trim().toUpperCase();
    const msg = $("#voucher-msg");
    if (!code) return;
    const sub = cartSubtotal();
    const p = S.promos.find((x) => x.code.toUpperCase() === code);
    if (p && p.applies_now && p.min_order <= sub && ["percent", "amount"].includes(p.kind)) {
      S.voucher = p;
      const d = voucherDiscount(sub);
      msg.className = "extra-msg ok";
      msg.textContent = "✓ " + t("voucher_ok", p.code, fmtVND(d));
      postEvent("voucher", `voucher ${p.code} applied (−${fmtVND(d)})`);
    } else {
      S.voucher = null;
      msg.className = "extra-msg err";
      msg.textContent = "✗ " + t("voucher_bad");
      postEvent("voucher", `voucher ${code} rejected`);
    }
    renderSummary();
  }

  async function checkLoyaltyUI() {
    const phone = $("#loyalty-input").value.trim();
    const msg = $("#loyalty-msg");
    if (!phone) return;
    const out = await api(`/api/loyalty?phone=${encodeURIComponent(phone)}`);
    if (out.found) {
      S.loyalty = out.member;
      msg.className = "extra-msg ok";
      msg.textContent = "✓ " + t("loyalty_ok", out.member.name, out.member.points, out.member.tier);
    } else {
      S.loyalty = null;
      msg.className = "extra-msg err";
      msg.textContent = "✗ " + t("loyalty_bad");
    }
  }

  // ---------- boot ----------
  applyI18n();
  show("attract");
  loadMenu().catch((err) => toast("⚠ menu load failed: " + err));
  postEvent("boot", "kiosk booted");
})();
