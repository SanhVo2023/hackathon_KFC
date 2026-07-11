// KFC self-order kiosk v3 — the exact journey customers already know
// (menu → meal size → customize → add on → review → added), with the AI
// working invisibly: background profiling, preemptive rec prefetch, and
// suggestions living INSIDE the native steps. No new concepts to learn.
(() => {
  const KFC = window.KFC;
  const { $, $$, fmtVND, api, postEvent, CAT_META, DAYPART_META } = KFC;

  // ---------- i18n ----------
  const L = {
    vi: {
      attract_sub: "Đặt món ngay tại đây", tap_to_start: "Chạm để bắt đầu",
      where_eat: "Bạn dùng bữa ở đâu?", dine_in: "Ăn tại đây", takeaway: "Mang đi",
      back: "QUAY LẠI", continue: "TIẾP TỤC",
      home: "TRANG CHỦ", step_size: "KÍCH CỠ PHẦN ĂN", step_customize: "TÙY CHỌN", step_addon: "THÊM MÓN", step_review: "XEM LẠI",
      size_title: "CHỌN COMBO HOẶC MÓN LẺ", combo_meal: "PHẦN COMBO", item_only: "MÓN LẺ",
      save_flag: (d) => `TIẾT KIỆM ${d}`, popular_flag: "ĐƯỢC CHỌN NHIỀU",
      customize_title: "TÙY CHỌN", addon_title: "THÊM CHÚT GÌ NHÉ!",
      addon_note: "Gợi ý riêng cho đơn của bạn — đổi mỗi ngày theo cửa hàng",
      review_title: "XEM LẠI", customizations: "Tùy chọn của bạn",
      added_title: "Đã thêm vào giỏ!", added_sub: "Tổng đơn của bạn đã được cập nhật.",
      continue_ordering: "TIẾP TỤC CHỌN MÓN", complete_order: "HOÀN TẤT ĐƠN HÀNG",
      cancel_order: "HỦY ĐƠN HÀNG", basket: "GIỎ HÀNG", pay: "THANH TOÁN",
      your_order: "ĐƠN CỦA BẠN", add_more: "+ THÊM MÓN", checkout: "THANH TOÁN",
      apply: "ÁP DỤNG", check: "KIỂM TRA", payment: "THANH TOÁN",
      card: "Thẻ", cash: "Tiền mặt tại quầy", scan_qr: "Quét mã để thanh toán",
      order_placed: "Đặt món thành công!", order_number_is: "Số đơn của bạn", new_order: "BẮT ĐẦU ĐƠN MỚI",
      rec_title: "GỢI Ý CHO BẠN", added: "Đã thêm vào giỏ",
      subtotal: "Tạm tính", discount: "Giảm giá", total: "Tổng cộng",
      empty_cart: "Chưa có món nào trong giỏ.",
      status_received: "Đã nhận", status_preparing: "Đang chuẩn bị", status_ready: "Sẵn sàng", status_completed: "Hoàn tất",
      voucher_ok: (c, d) => `Mã ${c} hợp lệ: giảm ${d}`, voucher_bad: "Mã không áp dụng được lúc này",
      loyalty_ok: (n, p, t) => `Chào ${n}! Bạn có ${p} điểm (hạng ${t}).`, loyalty_bad: "Số này chưa là thành viên",
      thinking: ["Đang xem các đơn tương tự…", "Đang kiểm tra bếp…", "Đang chọn món hợp với bạn…"],
      swap_save: (d) => `TIẾT KIỆM ${d}`, swap_more: (d) => `THÊM MÓN ${d}`, swap_btn: "ĐỔI",
    },
    en: {
      attract_sub: "Order right here", tap_to_start: "Tap to start",
      where_eat: "Where are you eating?", dine_in: "Dine in", takeaway: "Take away",
      back: "BACK", continue: "CONTINUE",
      home: "HOME", step_size: "MEAL SIZE", step_customize: "CUSTOMIZE", step_addon: "ADD ON", step_review: "REVIEW",
      size_title: "CHOOSE YOUR MEAL SIZE", combo_meal: "COMBO MEAL", item_only: "ITEM ONLY",
      save_flag: (d) => `SAVE ${d}`, popular_flag: "MOST PICKED",
      customize_title: "CUSTOMIZE", addon_title: "LET'S TOP IT UP!",
      addon_note: "Picked for your order — changes with store and time of day",
      review_title: "REVIEW", customizations: "Customizations",
      added_title: "Item added to basket!", added_sub: "Your total has been updated.",
      continue_ordering: "CONTINUE ORDERING", complete_order: "COMPLETE ORDER",
      cancel_order: "CANCEL ORDER", basket: "BASKET", pay: "PAY",
      your_order: "YOUR ORDER", add_more: "+ ADD ITEMS", checkout: "CHECKOUT",
      apply: "APPLY", check: "CHECK", payment: "PAYMENT",
      card: "Card", cash: "Cash at counter", scan_qr: "Scan to pay",
      order_placed: "Order placed!", order_number_is: "Your order number", new_order: "START NEW ORDER",
      rec_title: "PICKED FOR YOU", added: "Added to basket",
      subtotal: "Subtotal", discount: "Discount", total: "Total",
      empty_cart: "Your basket is empty.",
      status_received: "Received", status_preparing: "Preparing", status_ready: "Ready", status_completed: "Done",
      voucher_ok: (c, d) => `Code ${c} valid: ${d} off`, voucher_bad: "Code doesn't apply right now",
      loyalty_ok: (n, p, t) => `Hi ${n}! You have ${p} points (${t} tier).`, loyalty_bad: "Not a member yet",
      thinking: ["Reading similar orders…", "Checking the kitchen…", "Picking what fits you…"],
      swap_save: (d) => `SAVE ${d}`, swap_more: (d) => `MORE FOOD ${d}`, swap_btn: "SWAP",
    },
  };

  // ---------- state ----------
  const S = {
    lang: "vi", screen: "attract", orderType: null,
    menu: [], byCat: {}, cats: [], activeCat: null,
    daypart: null, promos: [], store: null, festive: false, holiday: null,
    cart: [], voucher: null, loyalty: null,
    lastOrder: null, statusTimer: null,
    pendingSwap: null,
  };
  let W = null; // wizard state

  // same-origin ops view reads the live cart to probe "what would the AI
  // recommend this customer right now" (never shown on the kiosk itself)
  KFC.cartLines = () => S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty }));

  const t = (k, ...a) => { const v = L[S.lang][k]; return typeof v === "function" ? v(...a) : v; };
  const itemName = (m) => (S.lang === "en" && m.name_en ? m.name_en : m.name);
  const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

  function applyI18n() {
    $$("[data-i18n]").forEach((el) => { const v = L[S.lang][el.dataset.i18n]; if (typeof v === "string") el.textContent = v; });
    $("#btn-lang").textContent = S.lang === "vi" ? "EN" : "VI";
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // background behavior signal to the profiler — never awaited, never blocking
  function observe(observation) {
    postEvent("profile_signal", observation);
    api("/api/profile/event", { method: "POST", body: { session_id: KFC.sessionId, observation } }).catch(() => null);
  }

  // ---------- navigation ----------
  function show(screen) {
    S.screen = screen;
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $(`#screen-${screen}`).classList.add("active");
    $("#kiosk-header").style.display = screen === "attract" ? "none" : "flex";
    postEvent("screen_change", `kiosk screen → ${screen}`);
    if (screen === "cart") renderCart();
    if (screen === "attract") loadMenu().catch(() => {});
    if (screen === "confirm") launchConfetti();
  }

  // ---------- data ----------
  async function loadMenu() {
    const data = await api("/api/menu");
    S.menu = data.items;
    S.daypart = data.daypart;
    S.store = data.store;
    S.festive = data.festive;
    S.holiday = data.holiday;
    // seasonal skin — same journey, festive dress (like real stores in December)
    document.body.classList.toggle("xmas", /giáng sinh|noel|christmas/i.test(S.holiday ?? ""));
    if (data.store) $("#kh-store").textContent = data.store.name;
    S.byCat = {};
    for (const m of S.menu) (S.byCat[m.category] ??= []).push(m);
    S.cats = ["combo", "chicken", "burger-rice", "snack", "drink", "dessert"].filter((c) => S.byCat[c]?.length);
    if (!S.cats.includes(S.activeCat)) S.activeCat = S.cats[0];
    const promoData = await api("/api/promotions");
    S.promos = promoData.promotions;
    renderContextStrip();
    renderAttractTicker();
    renderMenuRail();
    renderGrid();
    renderBottomBar();
  }

  // rotating promo line on the idle screen (real kiosks tease hot deals)
  let tickerTimer = null;
  function renderAttractTicker() {
    const el = $("#attract-ticker");
    if (!el) return;
    clearInterval(tickerTimer);
    const lines = S.promos.map((p) => `🔥 ${p.name} — ${p.description}`);
    if (S.holiday) lines.unshift(`🎄 ${S.holiday}: ${S.lang === "vi" ? "combo Noel đang chờ bạn!" : "Christmas combos are here!"}`);
    if (!lines.length) { el.innerHTML = ""; return; }
    let i = 0;
    const showLine = () => { el.innerHTML = `<span>${lines[i % lines.length]}</span>`; i++; };
    showLine();
    tickerTimer = setInterval(showLine, 3800);
  }

  function renderContextStrip() {
    const dp = DAYPART_META[S.daypart] ?? {};
    const now = S.promos.filter((p) => p.applies_now);
    const festiveTxt = S.holiday ? ` · 🎉 ${S.holiday}` : S.festive ? (S.lang === "vi" ? " · Cuối tuần" : " · Weekend") : "";
    $("#daypart-banner").textContent =
      `${dp.icon ?? ""} ${S.lang === "vi" ? dp.vi : dp.en}${festiveTxt}${now.length ? ` · ${now[0].name}` : ""}`;
  }

  // ---------- browse: rail + grid ----------
  function renderMenuRail() {
    $("#side-rail").innerHTML =
      `<button class="rail-btn" data-home>${t("home")}</button>` +
      S.cats.map((c) => {
        const meta = CAT_META[c];
        return `<button class="rail-btn ${c === S.activeCat ? "active" : ""}" data-cat="${c}">${S.lang === "vi" ? meta.vi : meta.en}</button>`;
      }).join("");
    const meta = CAT_META[S.activeCat];
    $("#menu-title").textContent = meta ? (S.lang === "vi" ? meta.vi : meta.en) : "MENU";
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
      <button class="menu-card" data-id="${m.id}" style="animation-delay:${Math.min(i * 35, 280)}ms">
        ${imgTag(m, "mc-img", "mc-img-ph")}
        <span class="mc-name">${itemName(m)}</span>
        <span class="mc-price">${fmtVND(m.price)}</span>
      </button>`).join("");
  }

  function renderBottomBar() {
    const n = S.cart.reduce((s, l) => s + l.qty, 0);
    $("#menu-bottom-bar").innerHTML = n
      ? `<button class="bb-cart" id="bb-cart"><span class="n">${n}</span> ${t("basket")} · ${fmtVND(cartSubtotal())}</button>
         <button class="bb-pay" id="bb-pay">${t("pay")}</button>`
      : `<button class="bb-cancel" id="bb-cancel">${t("cancel_order")}</button>`;
  }

  // ---------- wizard ----------
  const SYNTH_COMBO_GROUPS = () => [
    { key: "soda", name: "CHỌN VỊ NƯỚC", name_en: "CHOOSE SODA FLAVOR", options: [
      { name: "Pepsi", name_en: "Pepsi", delta: 0 }, { name: "7Up", name_en: "7Up", delta: 0 },
      { name: "Mirinda Cam", name_en: "Mirinda Orange", delta: 0 }, { name: "Pepsi Không Đường", name_en: "Pepsi Zero", delta: 0 }] },
    { key: "extra", name: "THÊM GÌ ĐÓ?", name_en: "ADD SOMETHING EXTRA?", options: [
      { name: "Không, cảm ơn", name_en: "No, thanks", delta: 0 },
      { name: "Thêm Phô Mai", name_en: "Extra Cheese", delta: 10000 },
      { name: "Sốt Colonel", name_en: "Colonel Sauce", delta: 10000 }] },
    // 3 tiers, decoy in the middle: Lớn exists to make Đại (+2k more for a lot
    // more food) feel like the obviously smart choice — asymmetric dominance.
    { key: "upsize", name: "UPSIZE KHOAI TÂY", name_en: "UPSIZE CHIPS", options: [
      { name: "Khoai Vừa", name_en: "Regular chips", delta: 0 },
      { name: "Khoai Lớn", name_en: "Large chips", delta: 10000, decoy: true },
      { name: "Khoai Đại", name_en: "Jumbo chips", delta: 12000, target: true }] },
  ];

  function modGroups(item) {
    if (item.modifiers) { try { return JSON.parse(item.modifiers); } catch { /* fall through */ } }
    if (item.is_combo) return SYNTH_COMBO_GROUPS();
    return [];
  }

  // best combo counterpart for a single item — the native "meal size" upsell
  function findComboFor(base) {
    if (base.is_combo || !["chicken", "burger-rice"].includes(base.category)) return null;
    const baseTokens = fold(base.name).split(/\s+/).filter((w) => w.length > 2);
    let best = null;
    for (const c of S.byCat.combo ?? []) {
      let contents = [];
      try { contents = c.combo_contents ? JSON.parse(c.combo_contents) : []; } catch { /* skip */ }
      if (!contents.includes(base.category)) continue;
      const cTokens = fold(c.name);
      const overlap = baseTokens.filter((w) => cTokens.includes(w)).length;
      const score = overlap * 10 + (c.popularity ?? 0);
      if (!best || score > best.score) best = { combo: c, score, contents };
    }
    if (!best) return null;
    // value vs buying the pieces separately
    const extras = best.contents.filter((cat) => cat !== base.category);
    let separately = base.price;
    for (const cat of extras) {
      const cheapest = (S.byCat[cat] ?? []).reduce((m, i) => (i.price < m ? i.price : m), Infinity);
      if (cheapest < Infinity) separately += cheapest;
    }
    const delta = best.combo.price - separately;
    return { combo: best.combo, extras, delta };
  }

  function startWizard(base) {
    const comboOpt = findComboFor(base);
    W = {
      base, comboOpt,
      chosen: base,
      sizeChoice: comboOpt ? (comboOpt.delta <= 0 ? "combo" : "combo") : "single", // AI preselects the combo — the familiar default
      steps: [], stepIdx: 0,
      mods: {}, qty: 1,
      addons: new Map(),
      recs: null, recsPromise: null,
    };
    if (comboOpt && W.sizeChoice === "combo") W.chosen = comboOpt.combo;
    W.steps = buildSteps();
    // PREEMPTIVE: profiler + rec engine start the moment the item is opened —
    // by the time the customer reaches ADD ON, suggestions are already there.
    observe(`viewing ${base.name} (${base.category})${comboOpt ? ", offered combo option" : ""}`);
    prefetchRecs();
    postEvent("tap", `opened meal builder: ${base.name}`);
    show("wizard");
    renderWizard();
  }

  function buildSteps() {
    const steps = [];
    if (W.comboOpt) steps.push("size");
    if (modGroups(W.chosen).length) steps.push("customize");
    steps.push("addon", "review");
    return steps;
  }

  function prefetchRecs() {
    const cart = [...S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty })), { item_id: W.chosen.id, qty: W.qty }];
    const p = api("/api/recommend", { method: "POST", body: { session_id: KFC.sessionId, cart, trigger: "item_added" } })
      .then((data) => { if (W) { W.recs = data.items ?? []; } return data; })
      .catch(() => ({ items: [] }));
    W.recsPromise = p;
    postEvent("rec_request", "preemptive: engine warming up while customer customizes");
  }

  function currentStep() { return W.steps[W.stepIdx]; }

  function renderWizardRail() {
    const stepLabel = { size: t("step_size"), customize: t("step_customize"), addon: t("step_addon"), review: t("step_review") };
    $("#wizard-rail").innerHTML =
      `<button class="rail-btn" data-wz-home>${t("home")}</button>` +
      W.steps.map((s, i) => `
        <button class="rail-btn ${i === W.stepIdx ? "active" : i < W.stepIdx ? "done" : ""}"
          data-wz-step="${i}" ${i > W.stepIdx ? "disabled" : ""}>${stepLabel[s]}</button>`).join("");
  }

  function buildPrice() {
    const groups = modGroups(W.chosen);
    let unit = W.chosen.price;
    groups.forEach((g, gi) => { unit += g.options[W.mods[gi] ?? 0]?.delta ?? 0; });
    let total = unit * W.qty;
    for (const [, a] of W.addons) total += a.item.price * a.qty;
    return { unit, total };
  }

  function renderWizard() {
    renderWizardRail();
    const step = currentStep();
    const box = $("#wizard-content");
    $("#wz-back").textContent = t("back");
    $("#wz-continue").textContent = t("continue");
    $("#wz-continue").disabled = false;

    if (step === "size") {
      const co = W.comboOpt;
      const flag = co.delta <= 0
        ? `<span class="sc-flag">${t("save_flag", fmtVND(-co.delta))}</span>`
        : `<span class="sc-flag pop">✦ ${t("popular_flag")}</span>`;
      box.innerHTML = `
        <h2 class="section-title">${t("size_title")}</h2>
        <p class="section-sub">${itemName(W.base)}</p>
        <div class="size-cards">
          <button class="size-card ${W.sizeChoice === "combo" ? "sel" : ""}" data-size="combo">
            ${flag}<span class="sc-check"></span>
            ${imgTag(co.combo, "mc-img", "mc-img-ph")}
            <span class="sc-label">${t("combo_meal")}</span>
            <span class="sc-desc">${co.combo.description ?? ""}</span>
            <span class="sc-price">${fmtVND(co.combo.price)}</span>
          </button>
          <button class="size-card ${W.sizeChoice === "single" ? "sel" : ""}" data-size="single">
            <span class="sc-check"></span>
            ${imgTag(W.base, "mc-img", "mc-img-ph")}
            <span class="sc-label">${t("item_only")}</span>
            <span class="sc-desc">${W.base.description ?? ""}</span>
            <span class="sc-price">${fmtVND(W.base.price)}</span>
          </button>
        </div>`;
    }

    if (step === "customize") {
      const groups = modGroups(W.chosen);
      box.innerHTML = `
        <h2 class="section-title">${t("customize_title")}</h2>
        <p class="section-sub">${itemName(W.chosen)}</p>
        ${groups.map((g, gi) => `
          <div class="cz-group">
            <div class="cz-title">${S.lang === "vi" ? g.name : (g.name_en ?? g.name)}</div>
            ${g.options.map((o, oi) => `
              <button class="cz-opt ${(W.mods[gi] ?? 0) === oi ? "sel" : ""}" data-g="${gi}" data-o="${oi}">
                <span class="cz-box"></span>
                ${S.lang === "vi" ? o.name : (o.name_en ?? o.name)}
                <span class="cz-price">${o.delta ? "+" + fmtVND(o.delta) : ""}</span>
              </button>`).join("")}
          </div>`).join("")}`;
    }

    if (step === "addon") {
      box.innerHTML = `
        <h2 class="section-title">${t("addon_title")}</h2>
        <div class="ao-note"><span class="ai-badge">✦ AI</span> ${t("addon_note")}</div>
        <div class="addon-grid" id="addon-grid"></div>`;
      renderAddons();
    }

    if (step === "review") {
      const { unit, total } = buildPrice();
      const groups = modGroups(W.chosen);
      const custom = groups.map((g, gi) => {
        const o = g.options[W.mods[gi] ?? 0];
        return o ? `${S.lang === "vi" ? o.name : (o.name_en ?? o.name)}${o.delta ? ` +${fmtVND(o.delta)}` : ""}` : null;
      }).filter(Boolean);
      const addonLines = [...W.addons.values()].map((a) => `${a.qty}× ${itemName(a.item)} +${fmtVND(a.item.price * a.qty)}`);
      box.innerHTML = `
        <div class="rv-head">
          <h2 class="section-title">${t("review_title")}<br /><span style="font-size:2cqw">${itemName(W.chosen)}</span></h2>
          <span class="rv-price">${fmtVND(total)}</span>
        </div>
        ${imgTag(W.chosen, "rv-img", "mc-img-ph rv-img")}
        <div class="rv-qtyrow">
          <button id="rv-minus">−</button><span class="qv">${W.qty}</span><button id="rv-plus">+</button>
        </div>
        <div class="rv-custom-title">${t("customizations")}</div>
        <div class="rv-custom">
          ${custom.length ? custom.join("<br />") : "—"}
          ${addonLines.length ? "<br />" + addonLines.join("<br />") : ""}
        </div>`;
    }
  }

  async function renderAddons() {
    const grid = $("#addon-grid");
    if (!W.recs) {
      // rare: engine still working — show the skeleton + storytelling line
      grid.innerHTML = Array.from({ length: 3 }, () => `<div class="addon-skel"><i></i><b></b><b style="width:55%"></b></div>`).join("") +
        `<div class="ao-status" id="ao-status">${t("thinking")[0]}</div>`;
      let i = 0;
      const timer = setInterval(() => {
        const el = $("#ao-status");
        if (!el) { clearInterval(timer); return; }
        i = (i + 1) % t("thinking").length;
        el.textContent = t("thinking")[i];
      }, 900);
      await W.recsPromise;
      clearInterval(timer);
      if (!W || currentStep() !== "addon") return;
    }
    const recs = (W.recs ?? []).slice(0, 3);
    postEvent("rec_shown", `add-on step: ${recs.map((r) => r.name).join(", ")}`);
    grid.innerHTML = recs.map((r, i) => {
      const a = W.addons.get(r.id);
      return `
      <div class="addon-card ${a ? "picked" : ""}" data-addon="${r.id}" style="animation-delay:${i * 80}ms">
        ${imgTag(r, "mc-img", "mc-img-ph")}
        <span class="ao-name">${S.lang === "en" && r.name_en ? r.name_en : r.name}</span>
        <span class="ao-pitch">${S.lang === "vi" ? r.pitch_vn : r.pitch_en}</span>
        <span class="ao-price">${r.price_display}</span>
        <span class="stepper">
          <button data-step="-1">−</button><span class="qv">${a?.qty ?? 0}</span><button data-step="1">+</button>
        </span>
      </div>`;
    }).join("") || `<div class="ao-status">—</div>`;
  }

  function wizardContinue() {
    const step = currentStep();
    if (step === "size") {
      const chosen = W.sizeChoice === "combo" ? W.comboOpt.combo : W.base;
      if (chosen.id !== W.chosen.id) {
        W.chosen = chosen;
        W.mods = {};
        W.steps = buildSteps();
        prefetchRecs(); // candidate changed — re-warm the engine
      }
      observe(`meal size: chose ${W.sizeChoice === "combo" ? `the combo (${W.chosen.name})` : `item only (${W.base.name})`}`);
    }
    if (step === "review") { commitWizard(); return; }
    W.stepIdx += 1;
    renderWizard();
  }

  function commitWizard() {
    const groups = modGroups(W.chosen);
    const modNames = groups.map((g, gi) => {
      const o = g.options[W.mods[gi] ?? 0];
      return o && (o.delta || (W.mods[gi] ?? 0) > 0) ? o.name : null;
    }).filter(Boolean);
    const { unit } = buildPrice();
    S.cart.push({ item: W.chosen, qty: W.qty, mods: modNames, unit, fromRec: false });
    const accepted = [];
    for (const [, a] of W.addons) {
      S.cart.push({ item: a.item, qty: a.qty, mods: [], unit: a.item.price, fromRec: true });
      accepted.push(a.item);
      api("/api/rec-feedback", { method: "POST", body: { session_id: KFC.sessionId, accepted_item_id: a.item.id } });
    }
    if (!accepted.length && W.recs?.length) {
      api("/api/rec-feedback", { method: "POST", body: { session_id: KFC.sessionId, dismissed: true } });
    }
    postEvent("add_to_cart", `${W.chosen.name} ×${W.qty}${accepted.length ? ` + AI add-ons: ${accepted.map((i) => i.name).join(", ")}` : ""}`);
    observe(`added ${W.qty}× ${W.chosen.name}${(W.chosen.tags ?? "").includes("sharing") ? " (a sharing/group-size item)" : ""}${accepted.length ? `, ACCEPTED AI add-ons: ${accepted.map((i) => i.name).join(", ")}` : ", no add-ons taken"}, order type: ${S.orderType}`);
    W = null;
    renderBottomBar();
    $("#added-total").textContent = fmtVND(cartSubtotal());
    show("added");
  }

  // ---------- cart ----------
  function cartSubtotal() {
    return S.cart.reduce((s, l) => s + (l.unit ?? l.item.price) * l.qty, 0);
  }

  function voucherDiscount(subtotal) {
    if (!S.voucher) return 0;
    if (S.voucher.min_order > subtotal) return 0;
    return S.voucher.kind === "percent" ? Math.floor(subtotal * S.voucher.value / 100)
      : S.voucher.kind === "amount" ? S.voucher.value : 0;
  }

  function renderCart() {
    const lines = $("#cart-lines");
    if (!S.cart.length) {
      lines.innerHTML = `<div class="cart-empty">${t("empty_cart")}</div>`;
    } else {
      lines.innerHTML = S.cart.map((l, i) => `
        <div class="cart-line">
          <span class="cl-name">${itemName(l.item)}${l.fromRec ? ` <span class="cl-ai">✦ AI</span>` : ""}${l.mods.length ? `<small>${l.mods.join(", ")}</small>` : ""}</span>
          <span class="cl-qty">
            <button class="cl-qbtn" data-i="${i}" data-d="-1">−</button>
            <span class="cl-q">${l.qty}</span>
            <button class="cl-qbtn" data-i="${i}" data-d="1">+</button>
          </span>
          <span class="cl-price">${fmtVND((l.unit ?? l.item.price) * l.qty)}</span>
        </div>`).join("");
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

  async function loadCartRecs() {
    const cart = S.cart.map((l) => ({ item_id: l.item.id, qty: l.qty }));
    try {
      const data = await api("/api/recommend", { method: "POST", body: { session_id: KFC.sessionId, cart, trigger: "cart_review" } });
      const items = (data.items ?? []).slice(0, 3);
      S.pendingSwap = data.smart_swap ?? null;
      if (!items.length && !data.smart_swap) { $("#cart-recs").innerHTML = ""; return; }
      postEvent("rec_shown", `cart review: ${items.map((i) => i.name).join(", ")}${data.smart_swap ? ` + swap→${data.smart_swap.name}` : ""}`);
      $("#cart-recs").innerHTML = `
        ${data.smart_swap ? `<div class="swap-banner">
          <span class="swap-tag">💚 ${data.smart_swap.delta < 0 ? t("swap_save", fmtVND(-data.smart_swap.delta)) : t("swap_more", data.smart_swap.delta_display)}</span>
          <span class="swap-msg">${S.lang === "vi" ? data.smart_swap.message_vn : data.smart_swap.message_en}</span>
          <button class="swap-accept">↻ ${t("swap_btn")}</button>
        </div>` : ""}
        ${items.length ? `<div class="rec-strip-title"><span class="ai-badge">✦ AI</span> ${t("rec_title")}</div>
        <div class="rec-strip">${items.map((r) => `
          <button class="rs-card" data-id="${r.id}">
            <div class="rs-name">${S.lang === "en" && r.name_en ? r.name_en : r.name}</div>
            <div class="rs-pitch">${S.lang === "vi" ? r.pitch_vn : r.pitch_en}</div>
            <div class="rs-price">+ ${r.price_display}</div>
          </button>`).join("")}</div>` : ""}`;
    } catch (_) { $("#cart-recs").innerHTML = ""; }
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
    if (combo) S.cart.push({ item: combo, qty: 1, mods: [], unit: combo.price, fromRec: true });
    api("/api/rec-feedback", { method: "POST", body: { session_id: KFC.sessionId, accepted_item_id: sw.id } });
    observe(`accepted the money-saving combo swap to ${sw.name} (trusts the assistant)`);
    postEvent("rec_accepted", `kindness-first swap accepted: ${sw.name} (${sw.delta_display})`, { id: sw.id });
    toast(sw.delta < 0 ? `💚 ${S.lang === "vi" ? "Đã tiết kiệm" : "Saved"} ${fmtVND(-sw.delta)}!` : `✓ ${t("added")}: ${sw.name}`);
    S.pendingSwap = null;
    renderBottomBar();
    renderCart();
  }

  function acceptStripRec(id) {
    const m = S.menu.find((x) => x.id === id);
    if (!m) return;
    S.cart.push({ item: m, qty: 1, mods: [], unit: m.price, fromRec: true });
    api("/api/rec-feedback", { method: "POST", body: { session_id: KFC.sessionId, accepted_item_id: id } });
    observe(`ACCEPTED the AI suggestion: ${m.name} (${m.category})`);
    postEvent("rec_accepted", `customer accepted AI rec: ${m.name}`, { id });
    toast(`✓ ${t("added")}: ${itemName(m)}`);
    renderBottomBar();
    renderCart();
  }

  // ---------- checkout ----------
  async function placeOrder(method) {
    $("#pay-methods").classList.add("hidden");
    $("#pay-qr").classList.toggle("hidden", method === "cash" || method === "card");
    if (!$("#qr-box").children.length) {
      $("#qr-box").innerHTML = Array.from({ length: 169 }, () => (Math.random() > .5 ? "<i></i>" : "<span></span>")).join("");
    }
    postEvent("payment", `payment method: ${method}`);
    await new Promise((r) => setTimeout(r, 2200));

    const items = S.cart.map((l) => ({ item_id: l.item.id, quantity: l.qty, modifiers: l.mods }));
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
    renderBottomBar();
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

  function launchConfetti() {
    const box = $("#confetti");
    box.innerHTML = Array.from({ length: 32 }, (_, i) =>
      `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .6}s;background:${["#E4002B", "#F2A900", "#21A038", "#1F1F1F"][i % 4]}"></i>`).join("");
    setTimeout(() => { box.innerHTML = ""; }, 3200);
  }

  // ---------- events ----------
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;

    if (btn.id === "btn-start") {
      KFC.rotateSession();  // new customer, fresh (background) hypothesis
      S.orderType = null; S.cart = []; S.voucher = null; S.loyalty = null; W = null;
      postEvent("session_start", "new customer session (background profiling active)");
      renderBottomBar();
      show("ordertype");
    }
    else if (btn.classList.contains("ordertype-card")) {
      S.orderType = btn.dataset.type;
      postEvent("tap", `order type: ${S.orderType}`);
      observe(`chose order type: ${S.orderType}`);
      show("menu");
    }
    else if (btn.dataset.cat) { S.activeCat = btn.dataset.cat; renderMenuRail(); renderGrid(); postEvent("tap", `category: ${btn.dataset.cat}`); }
    else if (btn.hasAttribute("data-home") || btn.id === "btn-home") {
      if (S.screen !== "attract") { W = null; show(S.screen === "menu" ? "attract" : "menu"); }
    }
    else if (btn.classList.contains("menu-card")) {
      const m = S.menu.find((x) => x.id === Number(btn.dataset.id));
      if (m) startWizard(m);
    }
    // wizard
    else if (btn.hasAttribute("data-wz-home")) { W = null; show("menu"); }
    else if (btn.dataset.wzStep !== undefined) {
      const i = Number(btn.dataset.wzStep);
      if (i <= W.stepIdx) { W.stepIdx = i; renderWizard(); }
    }
    else if (btn.dataset.size) {
      W.sizeChoice = btn.dataset.size;
      renderWizard();
    }
    else if (btn.dataset.g !== undefined && S.screen === "wizard") {
      const gi = Number(btn.dataset.g), oi = Number(btn.dataset.o);
      W.mods[gi] = oi;
      const opt = modGroups(W.chosen)[gi]?.options?.[oi];
      if (opt?.target) {
        postEvent("strategy", `decoy landed: ${opt.name} chosen (+${fmtVND(opt.delta)}) — asymmetric dominance`);
        observe(`upsized to ${opt.name} (jumbo tier over the decoy middle)`);
      } else if (opt?.decoy) {
        postEvent("tap", `decoy tier picked (${opt.name}) — rare, the middle exists to sell Đại`);
      }
      renderWizard();
    }
    else if (btn.dataset.step && btn.closest(".addon-card")) {
      const card = btn.closest(".addon-card");
      const id = Number(card.dataset.addon);
      const rec = (W.recs ?? []).find((r) => r.id === id);
      const item = S.menu.find((x) => x.id === id);
      if (!item) return;
      const cur = W.addons.get(id)?.qty ?? 0;
      const next = Math.max(0, cur + Number(btn.dataset.step));
      if (next === 0) W.addons.delete(id);
      else W.addons.set(id, { item, qty: next, pitch: rec?.pitch_vn });
      renderWizard();
    }
    else if (btn.id === "wz-back") {
      if (W.stepIdx === 0) { W = null; show("menu"); }
      else { W.stepIdx -= 1; renderWizard(); }
    }
    else if (btn.id === "wz-continue") wizardContinue();
    else if (btn.id === "rv-minus") { W.qty = Math.max(1, W.qty - 1); renderWizard(); }
    else if (btn.id === "rv-plus") { W.qty += 1; renderWizard(); }
    // added interstitial
    else if (btn.id === "btn-continue-ordering") show("menu");
    else if (btn.id === "btn-complete-order") show("cart");
    // menu bottom bar
    else if (btn.id === "bb-cancel") { S.cart = []; renderBottomBar(); show("attract"); }
    else if (btn.id === "bb-cart") show("cart");
    else if (btn.id === "bb-pay") show("cart");
    // basket
    else if (btn.classList.contains("swap-accept")) performSwap();
    else if (btn.classList.contains("rs-card")) acceptStripRec(Number(btn.dataset.id));
    else if (btn.id === "btn-back-menu") show("menu");
    else if (btn.id === "btn-checkout") {
      $("#pay-total").textContent = fmtVND(cartSubtotal() - voucherDiscount(cartSubtotal()));
      $("#pay-methods").classList.remove("hidden");
      $("#pay-qr").classList.add("hidden");
      show("payment");
    }
    else if (btn.classList.contains("pay-card")) placeOrder(btn.dataset.method);
    else if (btn.id === "btn-back-cart") show("cart");
    else if (btn.id === "btn-new-order") show("attract");
    else if (btn.id === "btn-lang") {
      S.lang = S.lang === "vi" ? "en" : "vi";
      applyI18n(); renderContextStrip(); renderMenuRail(); renderGrid(); renderBottomBar();
      if (S.screen === "wizard" && W) renderWizard();
      if (S.screen === "cart") renderCart();
      postEvent("tap", `language → ${S.lang}`);
    }
    else if (btn.id === "btn-voucher") applyVoucherUI();
    else if (btn.id === "btn-loyalty") checkLoyaltyUI();
    else if (btn.classList.contains("cl-qbtn")) {
      const line = S.cart[Number(btn.dataset.i)];
      if (!line) return;
      line.qty += Number(btn.dataset.d);
      if (line.qty <= 0) S.cart.splice(Number(btn.dataset.i), 1);
      renderBottomBar();
      renderCart();
    }
  });

  async function applyVoucherUI() {
    const code = $("#voucher-input").value.trim().toUpperCase();
    const msg = $("#voucher-msg");
    if (!code) return;
    const sub = cartSubtotal();
    const p = S.promos.find((x) => x.code.toUpperCase() === code);
    if (p && p.applies_now && p.min_order <= sub && ["percent", "amount"].includes(p.kind)) {
      S.voucher = p;
      msg.className = "extra-msg ok";
      msg.textContent = "✓ " + t("voucher_ok", p.code, fmtVND(voucherDiscount(sub)));
      postEvent("voucher", `voucher ${p.code} applied`);
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

  // scenario director / camera-frame injection nudge from the ops view
  window.addEventListener("message", (ev) => {
    if (ev.data?.kfcScenario) { loadMenu().catch(() => {}); if (S.screen === "cart") renderCart(); }
  });

  // ---------- boot ----------
  applyI18n();
  show("attract");
  loadMenu().catch((err) => toast("⚠ menu: " + err));
  postEvent("boot", "kiosk booted (v3 native journey)");
})();
