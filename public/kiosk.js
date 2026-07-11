// KFC self-order kiosk — full customer journey with a live customer-hypothesis
// agent: camera glance at check-in (demo: photo upload), then every interaction
// refines the guess that biases the recommendations.
(() => {
  const KFC = window.KFC;
  const { $, $$, fmtVND, api, postEvent, CAT_META, DAYPART_META } = KFC;

  // ---------- i18n ----------
  const L = {
    vi: {
      attract_sub: "Đặt món ngay tại đây", tap_to_start: "Chạm để bắt đầu",
      attract_ai: "AI gợi ý món hợp khẩu vị riêng bạn",
      camera_title: "Nhìn vào camera nhé!",
      camera_sub: "AI nhìn một thoáng để gợi ý món hợp với bạn hơn — không lưu ảnh, không nhận diện danh tính.",
      camera_hint: "Demo: chạm để tải ảnh lên", skip: "Bỏ qua →",
      camera_scanning: "AI đang nhìn một thoáng…", camera_done: "✓ Xong! Gợi ý đã được cá nhân hóa.",
      where_eat: "Bạn dùng bữa ở đâu?", dine_in: "Ăn tại đây", takeaway: "Mang đi",
      your_order: "Đơn của bạn", add_more: "+ Thêm món", checkout: "Thanh toán",
      apply: "Áp dụng", check: "Kiểm tra", payment: "Thanh toán",
      card: "Thẻ", cash: "Tiền mặt tại quầy", scan_qr: "Quét mã để thanh toán", back: "← Quay lại",
      order_placed: "Đặt món thành công!", order_number_is: "Số đơn của bạn", new_order: "Bắt đầu đơn mới",
      view_cart: "Xem đơn hàng", rec_title: "Gợi ý cho riêng bạn", no_thanks: "Không, cảm ơn",
      added: "Đã thêm vào đơn", subtotal: "Tạm tính", discount: "Giảm giá", total: "Tổng cộng",
      empty_cart: "Chưa có món nào. Chạm “+ Thêm món” nhé!",
      status_received: "Đã nhận", status_preparing: "Đang chuẩn bị", status_ready: "Sẵn sàng", status_completed: "Hoàn tất",
      voucher_ok: (c, d) => `Mã ${c} hợp lệ: giảm ${d}`, voucher_bad: "Mã không áp dụng được lúc này",
      loyalty_ok: (n, p, t) => `Chào ${n}! Bạn có ${p} điểm (hạng ${t}).`, loyalty_bad: "Số này chưa là thành viên",
      thinking: [
        "Đang xem các đơn tương tự tại cửa hàng…",
        "Đang kiểm tra bếp còn món gì…",
        "Đang đoán khẩu vị của bạn…",
        "AI đang viết lời mời riêng cho bạn…",
      ],
      add_to_order: "Thêm vào đơn",
    },
    en: {
      attract_sub: "Order right here", tap_to_start: "Tap to start",
      attract_ai: "AI suggests dishes tailored to you",
      camera_title: "Look at the camera!",
      camera_sub: "The AI takes one quick glance to tailor suggestions — no photo stored, no identity recognition.",
      camera_hint: "Demo: tap to upload a photo", skip: "Skip →",
      camera_scanning: "AI is taking a glance…", camera_done: "✓ Done! Suggestions personalized.",
      where_eat: "Where are you eating?", dine_in: "Dine in", takeaway: "Take away",
      your_order: "Your order", add_more: "+ Add items", checkout: "Checkout",
      apply: "Apply", check: "Check", payment: "Payment",
      card: "Card", cash: "Cash at counter", scan_qr: "Scan to pay", back: "← Back",
      order_placed: "Order placed!", order_number_is: "Your order number", new_order: "Start new order",
      view_cart: "View order", rec_title: "Picked for you", no_thanks: "No, thanks",
      added: "Added to order", subtotal: "Subtotal", discount: "Discount", total: "Total",
      empty_cart: "Nothing here yet. Tap “+ Add items”!",
      status_received: "Received", status_preparing: "Preparing", status_ready: "Ready", status_completed: "Done",
      voucher_ok: (c, d) => `Code ${c} valid: ${d} off`, voucher_bad: "Code doesn't apply right now",
      loyalty_ok: (n, p, t) => `Hi ${n}! You have ${p} points (${t} tier).`, loyalty_bad: "Not a member yet",
      thinking: [
        "Reading similar orders at this store…",
        "Checking what the kitchen has…",
        "Guessing your taste…",
        "AI is writing your personal pitch…",
      ],
      add_to_order: "Add to order",
    },
  };

  // ---------- state ----------
  const S = {
    lang: "vi",
    screen: "attract",
    orderType: null,
    menu: [], byCat: {}, cats: [], activeCat: null,
    daypart: null, promos: [], store: null, festive: false, holiday: null,
    cart: [], // {item, qty, mods:[], fromRec:bool}
    voucher: null, loyalty: null,
    lastOrder: null, statusTimer: null,
    recSheetItems: [],
    thinkTimer: null,
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

  // fire-and-forget behavior signal to the profiler agent
  function observe(observation) {
    postEvent("profile_signal", observation);
    return api("/api/profile/event", { method: "POST", body: { session_id: KFC.sessionId, observation } }).catch(() => null);
  }

  // ---------- navigation ----------
  function show(screen) {
    S.screen = screen;
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $(`#screen-${screen}`).classList.add("active");
    $("#kiosk-header").style.display = ["attract", "camera"].includes(screen) ? "none" : "flex";
    $("#cart-bar").classList.toggle("hidden", !(screen === "menu" && S.cart.length));
    postEvent("screen_change", `kiosk screen → ${screen}`);
    if (screen === "cart") renderCart();
    if (screen === "attract") loadMenu().catch(() => {});
    if (screen === "confirm") launchConfetti();
  }

  // ---------- menu ----------
  async function loadMenu() {
    const data = await api("/api/menu");
    S.menu = data.items;
    S.daypart = data.daypart;
    S.store = data.store;
    S.festive = data.festive;
    S.holiday = data.holiday;
    if (data.store) $("#kh-store").textContent = data.store.name;
    S.byCat = {};
    for (const m of S.menu) (S.byCat[m.category] ??= []).push(m);
    S.cats = ["combo", "chicken", "burger-rice", "snack", "drink", "dessert"].filter((c) => S.byCat[c]?.length);
    if (!S.cats.includes(S.activeCat)) S.activeCat = S.cats[0];
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
    const festiveTxt = S.holiday ? ` · 🎉 ${S.holiday}` : S.festive ? (S.lang === "vi" ? " · 🎉 Cuối tuần" : " · 🎉 Weekend") : "";
    $("#daypart-banner").innerHTML = `${dp.icon ?? ""} <b>${S.lang === "vi" ? dp.vi : dp.en}</b>${festiveTxt}${promoTxt}`;
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
    if (!m.image_url) return `<div class="${phCls}"><span>${icon}</span><small>${itemName(m).split(" ").slice(0, 2).join(" ")}</small></div>`;
    return `<img class="${cls}" src="${m.image_url}" alt="" loading="lazy"
      onerror="this.outerHTML='<div class=&quot;${phCls}&quot;><span>${icon}</span></div>'" />`;
  }

  function renderGrid() {
    const items = S.byCat[S.activeCat] ?? [];
    $("#menu-grid").innerHTML = items.map((m, i) => `
      <button class="menu-card" data-id="${m.id}" style="animation-delay:${Math.min(i * 40, 300)}ms">
        ${imgTag(m, "mc-img", "mc-img-ph")}
        <span class="mc-body">
          <span class="mc-name">${itemName(m)}</span>
          <span class="mc-price-row"><span class="mc-price">${fmtVND(m.price)}</span><span class="mc-add">+</span></span>
        </span>
      </button>`).join("");
  }

  // ---------- camera check-in ----------
  async function handlePhoto(file) {
    const status = $("#camera-status");
    const vf = $("#viewfinder");
    const img = await fileToImage(file);
    // show the shot in the viewfinder + scanline
    $("#vf-content").innerHTML = `<img src="${img.thumb}" class="vf-photo" alt="" />`;
    vf.classList.add("scanning");
    status.textContent = t("camera_scanning");
    postEvent("profile_photo", "camera check-in photo captured");
    try {
      const out = await api("/api/profile/photo", {
        method: "POST",
        body: { session_id: KFC.sessionId, image: img.full, thumb: img.thumb },
      });
      vf.classList.remove("scanning");
      vf.classList.add("done");
      status.textContent = t("camera_done");
      postEvent("profile_ready", `hypothesis: ${(out.profile?.persona ?? "").slice(0, 60)}`);
    } catch (_) {
      status.textContent = t("camera_done");
    }
    setTimeout(() => show("ordertype"), 1100);
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const scale = (max) => {
            const r = Math.min(1, max / Math.max(image.width, image.height));
            const c = document.createElement("canvas");
            c.width = Math.round(image.width * r);
            c.height = Math.round(image.height * r);
            c.getContext("2d").drawImage(image, 0, 0, c.width, c.height);
            return c.toDataURL("image/jpeg", 0.75);
          };
          resolve({ full: scale(512), thumb: scale(120) });
        };
        image.onerror = reject;
        image.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
    $("#im-add").textContent = `${t("add_to_order")} · ${fmtVND(modalUnit() * qty)}`;
  }
  function closeItem() {
    $("#item-backdrop").classList.add("hidden");
    $("#item-modal").classList.add("hidden");
    modalState = null;
  }

  // ---------- micro-interactions ----------
  function flyToCart(sourceEl) {
    try {
      const img = sourceEl?.querySelector?.("img, .im-img-ph, .mc-img-ph") ?? sourceEl;
      if (!img) return;
      const from = img.getBoundingClientRect();
      const to = $("#cart-bar").getBoundingClientRect();
      const kioskBox = $("#kiosk").getBoundingClientRect();
      const clone = img.cloneNode(true);
      clone.className = "fly-clone";
      Object.assign(clone.style, {
        left: `${from.left - kioskBox.left}px`, top: `${from.top - kioskBox.top}px`,
        width: `${from.width}px`, height: `${from.height}px`,
      });
      $("#fly-layer").appendChild(clone);
      requestAnimationFrame(() => {
        Object.assign(clone.style, {
          left: `${(to.left || kioskBox.left + kioskBox.width / 2) - kioskBox.left + 20}px`,
          top: `${(to.top || kioskBox.bottom - 80) - kioskBox.top}px`,
          width: "36px", height: "36px", opacity: ".15", borderRadius: "50%",
        });
      });
      setTimeout(() => clone.remove(), 650);
    } catch (_) { /* decorative only */ }
  }

  function bumpCartBar() {
    const bar = $("#cart-bar");
    bar.classList.remove("bump");
    void bar.offsetWidth;
    bar.classList.add("bump");
  }

  function launchConfetti() {
    const box = $("#confetti");
    box.innerHTML = Array.from({ length: 36 }, (_, i) =>
      `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .6}s;background:${["#E4002B", "#F2A900", "#2FBF71", "#fff"][i % 4]}"></i>`).join("");
    setTimeout(() => { box.innerHTML = ""; }, 3200);
  }

  // ---------- cart ----------
  function addToCart(m, qty = 1, mods = [], fromRec = false, silent = false) {
    const existing = S.cart.find((l) => l.item.id === m.id && JSON.stringify(l.mods) === JSON.stringify(mods));
    if (existing) existing.qty += qty; else S.cart.push({ item: m, qty, mods, fromRec });
    postEvent("add_to_cart", `${fromRec ? "[AI rec] " : ""}${m.name} ×${qty}`, { id: m.id, fromRec });
    if (!silent) toast(`✓ ${t("added")}: ${itemName(m)}`);
    updateCartBar();
    bumpCartBar();
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

  // ---------- recommendations (P2 + persona) ----------
  function startThinking() {
    $("#rec-items").innerHTML = "";
    $("#rec-thinking").classList.remove("hidden");
    const lines = t("thinking");
    let i = 0;
    const el = $("#rec-status");
    el.textContent = lines[0];
    clearInterval(S.thinkTimer);
    S.thinkTimer = setInterval(() => {
      i = (i + 1) % lines.length;
      el.style.opacity = 0;
      setTimeout(() => { el.textContent = lines[i]; el.style.opacity = 1; }, 180);
    }, 850);
  }
  function stopThinking() {
    clearInterval(S.thinkTimer);
    $("#rec-thinking").classList.add("hidden");
  }

  async function showRecSheet(anchorItem, qty) {
    // open instantly with the thinking state — the wait IS part of the show
    $("#rec-backdrop").classList.remove("hidden");
    $("#rec-sheet").classList.remove("hidden");
    startThinking();
    postEvent("rec_request", "kiosk asks rec engine (item added)");

    // 1) tell the profiler what just happened (fast model, sharpens the guess)
    const sharing = (anchorItem?.tags ?? "").includes("sharing");
    await observe(`added ${qty}× ${anchorItem?.name ?? "item"}${sharing ? " (a sharing/group-size item)" : ""}, order type: ${S.orderType ?? "?"}`);

    // 2) then ask the engine — it now sees the refreshed hypothesis
    const cart = S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty }));
    try {
      const data = await api("/api/recommend", { method: "POST", body: { session_id: KFC.sessionId, cart, trigger: "item_added" } });
      const items = (data.items ?? []).slice(0, 3);
      stopThinking();
      if (!items.length && !data.smart_swap) { closeRecSheet(false); return; }
      S.recSheetItems = items;
      S.pendingSwap = data.smart_swap ?? null;
      postEvent("rec_shown", `AI suggests: ${items.map((i) => i.name).join(", ")}${data.smart_swap ? ` + swap→${data.smart_swap.name}` : ""}`);
      $("#rec-items").innerHTML = (data.smart_swap ? swapCardHTML(data.smart_swap) : "") + items.map((r, i) => `
        <div class="rec-item" style="animation-delay:${i * 90}ms">
          ${imgTag(r, "ri-img", "ri-img-ph")}
          <span class="ri-body">
            <span class="ri-name">${S.lang === "en" && r.name_en ? r.name_en : r.name}</span>
            <div class="ri-pitch">${S.lang === "vi" ? r.pitch_vn : r.pitch_en}</div>
            <div class="ri-price">${r.price_display}</div>
          </span>
          <button class="ri-add" data-id="${r.id}">+ ${S.lang === "vi" ? "Thêm" : "Add"}</button>
        </div>`).join("");
    } catch (_) {
      stopThinking();
      closeRecSheet(false);
    }
  }

  function closeRecSheet(dismissed) {
    stopThinking();
    $("#rec-backdrop").classList.add("hidden");
    $("#rec-sheet").classList.add("hidden");
    if (dismissed) {
      api("/api/rec-feedback", { method: "POST", body: { session_id: KFC.sessionId, dismissed: true } });
      observe("dismissed the AI suggestions without adding any");
      postEvent("rec_dismissed", "customer dismissed AI suggestions");
    }
  }

  async function loadCartRecs() {
    const cart = S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty }));
    $("#cart-recs").innerHTML = `<div class="rec-strip-title"><span class="ai-badge">✦ AI</span> <span class="rec-strip-loading">${t("thinking")[0]}</span></div>`;
    try {
      const data = await api("/api/recommend", { method: "POST", body: { session_id: KFC.sessionId, cart, trigger: "cart_review" } });
      const items = (data.items ?? []).slice(0, 3);
      S.pendingSwap = data.smart_swap ?? null;
      if (!items.length && !data.smart_swap) { $("#cart-recs").innerHTML = ""; return; }
      postEvent("rec_shown", `cart review AI strip: ${items.map((i) => i.name).join(", ")}`);
      $("#cart-recs").innerHTML = `
        ${data.smart_swap ? `<div class="swap-banner">
          <span class="swap-tag">💛 ${data.smart_swap.delta < 0 ? (S.lang === "vi" ? "TIẾT KIỆM " + fmtVND(-data.smart_swap.delta) : "SAVE " + fmtVND(-data.smart_swap.delta)) : data.smart_swap.delta_display}</span>
          <span class="swap-msg">${S.lang === "vi" ? data.smart_swap.message_vn : data.smart_swap.message_en}</span>
          <button class="ri-add swap-accept">↻ ${S.lang === "vi" ? "Đổi" : "Swap"}</button>
        </div>` : ""}
        <div class="rec-strip-title"><span class="ai-badge">✦ AI</span> ${t("rec_title")}</div>
        <div class="rec-strip">${items.map((r) => `
          <button class="rs-card" data-id="${r.id}">
            <div class="rs-name">${S.lang === "en" && r.name_en ? r.name_en : r.name}</div>
            <div class="rs-pitch">${S.lang === "vi" ? r.pitch_vn : r.pitch_en}</div>
            <div class="rs-price">+ ${r.price_display}</div>
          </button>`).join("")}</div>`;
      S.recSheetItems = items;
    } catch (_) { $("#cart-recs").innerHTML = ""; }
  }

  // kindness-first: money-saving combo swap card (trust before upsell)
  function swapCardHTML(sw) {
    const msg = S.lang === "vi" ? sw.message_vn : sw.message_en;
    const saveTag = sw.delta < 0
      ? (S.lang === "vi" ? `TIẾT KIỆM ${fmtVND(-sw.delta)}` : `SAVE ${fmtVND(-sw.delta)}`)
      : (S.lang === "vi" ? `THÊM MÓN ${sw.delta_display}` : `MORE FOOD ${sw.delta_display}`);
    return `
      <div class="rec-item swap-item">
        <span class="swap-tag">💛 ${saveTag}</span>
        ${imgTag(sw, "ri-img", "ri-img-ph")}
        <span class="ri-body">
          <span class="ri-name">${S.lang === "en" && sw.name_en ? sw.name_en : sw.name}</span>
          <div class="ri-pitch">${msg}</div>
          <div class="ri-price">${sw.price_display}</div>
        </span>
        <button class="ri-add swap-accept">↻ ${S.lang === "vi" ? "Đổi" : "Swap"}</button>
      </div>`;
  }

  function performSwap() {
    const sw = S.pendingSwap;
    if (!sw) return;
    for (const rep of sw.replaces) {
      const idx = S.cart.findIndex((l) => l.item.id === rep.id);
      if (idx >= 0) {
        if (S.cart[idx].qty > 1) S.cart[idx].qty -= 1;
        else S.cart.splice(idx, 1);
      }
    }
    const combo = S.menu.find((x) => x.id === sw.id);
    if (combo) addToCart(combo, 1, [], true);
    api("/api/rec-feedback", { method: "POST", body: { session_id: KFC.sessionId, accepted_item_id: sw.id } });
    observe(`accepted the money-saving combo swap to ${sw.name} (trusts the assistant)`);
    postEvent("rec_accepted", `kindness-first swap accepted: ${sw.name} (${sw.delta_display})`, { id: sw.id });
    toast(sw.delta < 0 ? `💛 ${S.lang === "vi" ? "Đã tiết kiệm" : "Saved"} ${fmtVND(-sw.delta)}!` : `✓ ${t("added")}: ${sw.name}`);
    S.pendingSwap = null;
    if (S.screen === "cart") renderCart();
  }

  function acceptRec(id) {
    const m = S.menu.find((x) => x.id === id);
    if (!m) return;
    addToCart(m, 1, (m.modifiers ? JSON.parse(m.modifiers) : []).map(() => 0), true);
    api("/api/rec-feedback", { method: "POST", body: { session_id: KFC.sessionId, accepted_item_id: id } });
    observe(`ACCEPTED the AI suggestion: ${m.name} (${m.category})`);
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
        session_id: KFC.sessionId, items, order_type: S.orderType,
        promo_code: S.voucher?.code, loyalty_phone: S.loyalty?.phone, rec_item_ids: recIds,
      },
    });
    if (!out.ok) { toast("⚠ " + (out.error ?? "error")); show("cart"); return; }
    S.lastOrder = out.order;
    renderConfirm();
    show("confirm");
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

  // ---------- events ----------
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.id === "btn-start") {
      KFC.rotateSession();               // new customer, new hypothesis
      S.orderType = null; S.cart = []; S.voucher = null; S.loyalty = null;
      updateCartBar();
      $("#vf-content").innerHTML = `<span class="vf-icon">📷</span><span class="vf-hint">${t("camera_hint")}</span>`;
      $("#viewfinder").classList.remove("scanning", "done");
      $("#camera-status").textContent = "";
      $("#camera-input").value = "";
      postEvent("session_start", "new customer session");
      show("camera");
    }
    else if (btn.id === "btn-camera-skip") { observe("skipped the camera check-in"); show("ordertype"); }
    else if (btn.classList.contains("ordertype-card")) {
      S.orderType = btn.dataset.type;
      postEvent("tap", `order type: ${S.orderType}`);
      observe(`chose order type: ${S.orderType}`);
      show("menu");
    }
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
      flyToCart($("#item-modal"));
      addToCart(m, qty, sel);
      closeItem();
      showRecSheet(m, qty);
    }
    else if (btn.id === "rec-close" || btn.id === "rec-skip") closeRecSheet(true);
    else if (btn.classList.contains("swap-accept")) { performSwap(); closeRecSheet(false); }
    else if (btn.classList.contains("ri-add") || btn.classList.contains("rs-card")) {
      acceptRec(Number(btn.dataset.id));
      if (btn.classList.contains("ri-add")) closeRecSheet(false);
    }
    else if (btn.id === "cart-bar") show("cart");
    else if (btn.id === "btn-back-menu") show("menu");
    else if (btn.id === "btn-checkout") { $("#pay-total").textContent = fmtVND(cartSubtotal() - voucherDiscount(cartSubtotal())); $("#pay-methods").classList.remove("hidden"); $("#pay-qr").classList.add("hidden"); show("payment"); }
    else if (btn.classList.contains("pay-card")) placeOrder(btn.dataset.method);
    else if (btn.id === "btn-back-cart") show("cart");
    else if (btn.id === "btn-new-order") show("attract");
    else if (btn.id === "btn-home") { if (S.screen !== "attract") show(S.cart.length ? "menu" : "attract"); }
    else if (btn.id === "btn-lang") { S.lang = S.lang === "vi" ? "en" : "vi"; applyI18n(); renderCats(); renderGrid(); renderDaypartBanner(); if (S.screen === "cart") renderCart(); postEvent("tap", `language → ${S.lang}`); }
    else if (btn.id === "btn-voucher") applyVoucherUI();
    else if (btn.id === "btn-loyalty") checkLoyaltyUI();
  });

  $("#camera-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handlePhoto(file).catch(() => show("ordertype"));
  });
  $("#item-backdrop").addEventListener("click", closeItem);
  $("#rec-backdrop").addEventListener("click", () => closeRecSheet(true));

  document.addEventListener("click", (ev) => {
    const qbtn = ev.target.closest(".cl-qbtn");
    if (!qbtn) return;
    const line = S.cart[Number(qbtn.dataset.i)];
    if (!line) return;
    line.qty += Number(qbtn.dataset.d);
    if (line.qty <= 0) S.cart.splice(Number(qbtn.dataset.i), 1);
    updateCartBar();
    renderCart();
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
      observe(`identified as loyalty member, tier: ${out.member.tier}`);
    } else {
      S.loyalty = null;
      msg.className = "extra-msg err";
      msg.textContent = "✗ " + t("loyalty_bad");
    }
  }

  // scenario director (desktop view) nudges us to reload context
  window.addEventListener("message", (ev) => {
    if (ev.data?.kfcScenario) { loadMenu().catch(() => {}); if (S.screen === "cart") renderCart(); }
  });

  // ---------- boot ----------
  applyI18n();
  show("attract");
  loadMenu().catch((err) => toast("⚠ menu load failed: " + err));
  postEvent("boot", "kiosk booted");
})();
