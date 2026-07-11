// KFC Admin Control Center — vanilla JS, no build step.
(() => {
  const { $, $$, api, fmtVND, CAT_META, DAYPART_META } = window.KFC;

  /* ================= utilities ================= */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const toasts = $("#toasts");
  function toast(msg, type = "ok") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 260); }, 2600);
  }

  let lastErrToast = 0;
  function setOnline(ok) {
    const badge = $("#connBadge");
    badge.classList.toggle("ok", ok);
    badge.classList.toggle("err", !ok);
    $("#connLabel").textContent = ok ? "Trực tuyến" : "Mất kết nối";
  }
  async function call(path, opts) {
    try {
      const r = await api(path, opts);
      setOnline(true);
      return r;
    } catch (e) {
      setOnline(false);
      if (Date.now() - lastErrToast > 6000) {
        lastErrToast = Date.now();
        toast("Không kết nối được máy chủ — sẽ tự thử lại", "err");
      }
      throw e;
    }
  }

  function parseTime(t) {
    if (t == null) return null;
    if (typeof t === "number") return new Date(t < 2e10 ? t * 1000 : t);
    let s = String(t);
    if (!/Z$|[+-]\d\d:?\d\d$/.test(s)) s = s.replace(" ", "T") + "Z"; // assume UTC (SQLite/D1)
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function timeAgo(t) {
    const d = parseTime(t);
    if (!d) return "";
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 45) return "vừa xong";
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    return d.toLocaleDateString("vi-VN");
  }
  function fmtHMS(t) {
    const d = parseTime(t);
    return d ? d.toLocaleTimeString("vi-VN", { hour12: false }) : "";
  }
  const fmtNum = (n) => (Number(n) || 0).toLocaleString("vi-VN");
  const pct = (n, dec = 1) => `${(Number(n) || 0).toFixed(dec)}%`;

  // in-flight guard so a slow request never stacks on itself
  const guard = (fn) => {
    let busy = false;
    return async (...a) => {
      if (busy) return;
      busy = true;
      try { await fn(...a); } catch (_) { /* toast already shown */ } finally { busy = false; }
    };
  };

  const cache = {}; // last-rendered payload strings, to skip useless re-renders

  /* ================= clock ================= */

  function tickClock() {
    const d = new Date();
    $("#clockTime").textContent = d.toLocaleTimeString("vi-VN", { hour12: false });
    $("#clockDate").textContent = d.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" });
  }
  setInterval(tickClock, 1000);
  tickClock();

  /* ================= tabs & polling ================= */

  const pollers = []; // { tab: "name"|"*", ms, fn, timer }
  function addPoller(tab, ms, fn) { pollers.push({ tab, ms, fn: guard(fn), timer: null }); }

  let activeTab = "overview";
  function setTab(name) {
    activeTab = name;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + name));
    pollers.forEach((p) => {
      const should = p.tab === "*" || p.tab === name;
      if (should && !p.timer) { p.fn(); p.timer = setInterval(p.fn, p.ms); }
      else if (!should && p.timer) { clearInterval(p.timer); p.timer = null; }
    });
  }
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

  /* ================= 1 · overview ================= */

  const loadMetrics = async () => {
    const m = await call("/api/admin/metrics");
    const key = JSON.stringify(m);
    if (key === cache.metrics) return;
    cache.metrics = key;
    renderOverview(m || {});
  };

  function renderOverview(m) {
    const withRec = Number(m.aov_with_rec_vnd) || 0;
    const without = Number(m.aov_without_rec_vnd) || 0;
    const uplift = without > 0 ? ((withRec - without) / without) * 100 : 0;
    const upClass = uplift >= 0 ? "up" : "down";
    const upSign = uplift >= 0 ? "+" : "";
    const maxAov = Math.max(withRec, without, 1);
    const impressions = Number(m.rec_impressions) || 0;
    const accepted = Number(m.rec_accepted) || 0;
    const accPct = m.rec_acceptance_pct != null
      ? Number(m.rec_acceptance_pct)
      : (impressions ? (accepted / impressions) * 100 : 0);

    $("#ovHero").innerHTML = `
      <div class="panel hero-card ai">
        <div class="hero-label">✨ Uplift từ AI gợi ý <span class="en">AI recommendation uplift on AOV</span></div>
        <div class="hero-value ${upClass}">${upSign}${uplift.toFixed(1)}%</div>
        <div class="hero-sub">Đơn có món do AI gợi ý có giá trị trung bình ${uplift >= 0 ? "cao hơn" : "thấp hơn"} đơn thường.</div>
        <div class="hero-bars">
          <div class="hbar">
            <span class="hb-label">Có gợi ý AI</span>
            <div class="meter gold"><i style="width:${(withRec / maxAov) * 100}%"></i></div>
            <span class="hb-val">${fmtVND(withRec)}</span>
          </div>
          <div class="hbar">
            <span class="hb-label">Không gợi ý</span>
            <div class="meter dim"><i style="width:${(without / maxAov) * 100}%"></i></div>
            <span class="hb-val">${fmtVND(without)}</span>
          </div>
        </div>
      </div>
      <div class="panel hero-card">
        <div class="hero-label" style="color:var(--ai-gold)">✨ Tỷ lệ khách nhận gợi ý <span class="en">Acceptance rate</span></div>
        <div class="hero-value">${pct(accPct)}</div>
        <div class="hero-sub"><span class="mono">${fmtNum(accepted)} / ${fmtNum(impressions)}</span> lượt gợi ý được khách đồng ý thêm vào giỏ.</div>
        <div class="hero-bars">
          <div class="hbar">
            <span class="hb-label">Chấp nhận</span>
            <div class="meter gold"><i style="width:${Math.min(100, accPct)}%"></i></div>
            <span class="hb-val">${pct(accPct)}</span>
          </div>
        </div>
      </div>`;

    const tiles = [
      { l: "Tổng đơn hàng", en: "Orders", v: fmtNum(m.orders) },
      { l: "Doanh thu", en: "Revenue", v: fmtVND(m.revenue_vnd) },
      { l: "Giá trị TB / đơn", en: "AOV", v: fmtVND(m.aov_vnd) },
      { l: "Lượt chat với AI", en: "Chat turns", v: fmtNum(m.chat_turns) },
      { l: "Chuyển nhân viên", en: "Handoffs", v: fmtNum(m.handoffs) },
    ];
    $("#ovTiles").innerHTML = tiles.map((t) => `
      <div class="panel tile">
        <div class="tile-label">${esc(t.l)} <span class="en">${esc(t.en)}</span></div>
        <div class="tile-value">${t.v}</div>
      </div>`).join("");

    // by-channel — tolerant of array or object payloads
    const chans = normChannels(m.by_channel);
    const maxOrders = Math.max(...chans.map((c) => c.orders), 1);
    $("#ovChannels").innerHTML = chans.length ? chans.map((c) => `
      <div class="brow">
        <span class="chip ${c.channel === "kiosk" ? "ch-kiosk" : c.channel === "chat" ? "ch-chat" : ""}">${esc(channelName(c.channel))}</span>
        <div class="meter ${c.channel === "chat" ? "gold" : ""}"><i style="width:${(c.orders / maxOrders) * 100}%"></i></div>
        <span class="br-val">${fmtNum(c.orders)} đơn${c.revenue != null ? ` <small>· ${fmtVND(c.revenue)}</small>` : ""}</span>
      </div>`).join("") : `<p class="empty">Chưa có dữ liệu kênh bán.</p>`;

    const recs = normTopRecs(m.top_accepted_recs);
    const maxRec = Math.max(...recs.map((r) => r.count), 1);
    $("#ovTopRecs").innerHTML = recs.length ? recs.slice(0, 8).map((r, i) => `
      <div class="rec-row">
        <span class="rec-rank">${i + 1}</span>
        <span class="rec-name">${esc(r.name)}</span>
        <div class="meter gold rec-meter"><i style="width:${(r.count / maxRec) * 100}%"></i></div>
        <span class="rec-count">${fmtNum(r.count)} lần</span>
      </div>`).join("") : `<p class="empty">Chưa có gợi ý nào được chấp nhận.</p>`;
  }

  function channelName(c) { return c === "kiosk" ? "Kiosk" : c === "chat" ? "Chat AI" : (c || "Khác"); }

  function normChannels(bc) {
    if (!bc) return [];
    if (Array.isArray(bc)) {
      return bc.map((e) => ({
        channel: e.channel ?? e.name ?? "?",
        orders: Number(e.orders ?? e.count ?? e.n ?? 0),
        revenue: e.revenue_vnd ?? e.revenue ?? null,
      }));
    }
    return Object.entries(bc).map(([k, v]) => (typeof v === "object" && v !== null)
      ? { channel: k, orders: Number(v.orders ?? v.count ?? 0), revenue: v.revenue_vnd ?? v.revenue ?? null }
      : { channel: k, orders: Number(v) || 0, revenue: null });
  }
  function normTopRecs(list) {
    if (!Array.isArray(list)) return [];
    return list.map((r) => ({
      name: r.name ?? r.item_name ?? r.item ?? r.label ?? "?",
      count: Number(r.count ?? r.accepted ?? r.times ?? r.n ?? 0),
    }));
  }

  /* ================= 2 · orders board ================= */

  const ORDER_FLOW = ["received", "preparing", "ready", "completed"];
  const ORDER_META = {
    received:  { vi: "Mới nhận",      en: "Received",  btn: "→ Bắt đầu làm" },
    preparing: { vi: "Đang chuẩn bị", en: "Preparing", btn: "→ Xong, sẵn sàng" },
    ready:     { vi: "Sẵn sàng",      en: "Ready",     btn: "→ Đã giao" },
    completed: { vi: "Hoàn tất",      en: "Completed", btn: null },
  };

  const loadOrders = async () => {
    const r = await call("/api/admin/orders");
    const orders = Array.isArray(r) ? r : (r.orders || []);
    const key = JSON.stringify(orders);
    if (key === cache.orders) return;
    cache.orders = key;
    renderKanban(orders);
  };

  function itemsSummary(raw) {
    try {
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(arr)) {
        return arr.map((it) => `${it.qty ?? it.quantity ?? it.q ?? 1}× ${it.name ?? it.item ?? it.n ?? "?"}`).join(", ");
      }
    } catch (_) { /* fall through */ }
    return String(raw ?? "").slice(0, 80);
  }

  function renderKanban(orders) {
    const ts = (o) => { const d = parseTime(o.created_at); return d ? d.getTime() : 0; };
    $("#kanban").innerHTML = ORDER_FLOW.map((st) => {
      const meta = ORDER_META[st];
      let list = orders.filter((o) => o.status === st);
      list.sort((a, b) => st === "completed" ? ts(b) - ts(a) : ts(a) - ts(b));
      if (st === "completed") list = list.slice(0, 12);
      const cards = list.map((o) => {
        const rec = Number(o.rec_attributed) || 0;
        return `
        <article class="order-card">
          <div class="oc-top">
            <span class="oc-id">#${esc(o.id)}</span>
            <span class="chip ${o.channel === "chat" ? "ch-chat" : "ch-kiosk"}">${esc(channelName(o.channel))}</span>
            <span class="oc-time">${timeAgo(o.created_at)}</span>
          </div>
          <div class="oc-items">${esc(itemsSummary(o.items))}</div>
          <div class="oc-foot">
            <span class="oc-total">${fmtVND(o.total)}</span>
            ${o.promo_code ? `<span class="chip">🎟️ ${esc(o.promo_code)}</span>` : ""}
            ${rec > 0 ? `<span class="chip ai-chip">✨ AI +${fmtVND(rec)}</span>` : ""}
          </div>
          ${meta.btn ? `<button class="oc-advance" data-id="${esc(o.id)}" data-status="${st}">${meta.btn}</button>` : ""}
        </article>`;
      }).join("");
      return `
      <div class="kcol st-${st}">
        <div class="kcol-head">${esc(meta.vi)} <span class="en">${esc(meta.en)}</span><span class="kcol-count">${list.length}</span></div>
        <div class="kcol-body">${cards || `<p class="empty">Trống</p>`}</div>
      </div>`;
    }).join("");
  }

  $("#kanban").addEventListener("click", async (e) => {
    const btn = e.target.closest(".oc-advance");
    if (!btn) return;
    const next = ORDER_FLOW[ORDER_FLOW.indexOf(btn.dataset.status) + 1];
    if (!next) return;
    btn.disabled = true;
    btn.textContent = "Đang chuyển…";
    try {
      await call(`/api/admin/order/${btn.dataset.id}`, { method: "PUT", body: { status: next } });
      cache.orders = null;
      await guard(loadOrders)();
    } catch (_) {
      btn.disabled = false;
      btn.textContent = ORDER_META[btn.dataset.status].btn;
    }
  });

  /* ================= 3 · support / HITL ================= */

  const support = { handoffs: [], staff: [], activeId: null };

  const HO_STATUS = {
    pending:  { vi: "Chờ xử lý",  cls: "warn" },
    active:   { vi: "Đang hỗ trợ", cls: "ok" },
    resolved: { vi: "Đã xong",    cls: "dim" },
  };
  const hoStatus = (s) => HO_STATUS[s] || { vi: s || "?", cls: "dim" };

  // handoffs poll globally: powers the sidebar alert badge from any tab
  const loadHandoffs = async () => {
    const r = await call("/api/admin/handoffs");
    const list = Array.isArray(r) ? r : (r.handoffs || []);
    support.handoffs = list;
    const pending = list.filter((h) => h.status === "pending").length;
    const badge = $("#supportBadge");
    badge.hidden = pending === 0;
    badge.textContent = pending;
    if (activeTab !== "support") return;
    const key = JSON.stringify(list) + "|" + support.activeId;
    if (key === cache.handoffs) return;
    cache.handoffs = key;
    renderHandoffs();
  };

  function renderHandoffs() {
    const list = support.handoffs;
    $("#handoffList").innerHTML = list.length ? list.map((h) => {
      const st = hoStatus(h.status);
      return `
      <button class="ho-item ${h.id === support.activeId ? "sel" : ""}" data-id="${esc(h.id)}">
        <div class="ho-top">
          <span class="ho-session">${esc(String(h.session_id || "").slice(0, 12))}</span>
          <span class="badge ${st.cls}"><span class="b-dot"></span>${esc(st.vi)}</span>
        </div>
        <div class="ho-reason">${esc(h.reason || "Khách cần hỗ trợ")}</div>
        <div class="ho-meta">
          <span>${timeAgo(h.created_at)}</span>
          ${h.staff_name ? `<span>👤 ${esc(h.staff_name)}</span>` : `<span>Chưa gán nhân viên</span>`}
        </div>
      </button>`;
    }).join("") : `<p class="empty">Không có yêu cầu hỗ trợ nào 🎉</p>`;
  }

  $("#handoffList").addEventListener("click", (e) => {
    const item = e.target.closest(".ho-item");
    if (!item) return;
    openHandoff(Number(item.dataset.id) || item.dataset.id);
  });

  function openHandoff(id) {
    support.activeId = id;
    cache.handoffs = null;
    cache.messages = null;
    renderHandoffs();
    renderConvoHead();
    $("#convoReply").hidden = false;
    $("#convoMsgs").innerHTML = `<p class="empty">Đang tải hội thoại…</p>`;
    guard(loadMessages)();
  }

  function renderConvoHead() {
    const h = support.handoffs.find((x) => x.id === support.activeId);
    if (!h) return;
    const st = hoStatus(h.status);
    $("#convoHead").innerHTML = `
      <h3>Hội thoại <span class="ho-session">${esc(String(h.session_id || "").slice(0, 14))}</span>
        <span class="badge ${st.cls}"><span class="b-dot"></span>${esc(st.vi)}</span></h3>
      <div class="convo-head-actions">
        ${h.status !== "resolved" ? `<button class="btn btn-ok" id="resolveBtn">✓ Đã giải quyết</button>` : `<span class="badge dim">Đã đóng</span>`}
      </div>`;
    const rb = $("#resolveBtn");
    if (rb) rb.addEventListener("click", async () => {
      rb.disabled = true;
      try {
        await call(`/api/admin/handoff/${h.id}`, { method: "PUT", body: { status: "resolved" } });
        toast("Đã đánh dấu giải quyết xong");
        cache.handoffs = null;
        await guard(loadHandoffs)();
        renderConvoHead();
      } catch (_) { rb.disabled = false; }
    });
  }

  const loadMessages = async () => {
    if (activeTab !== "support" || support.activeId == null) return;
    const id = support.activeId;
    const r = await call(`/api/admin/handoff/${id}/messages`);
    if (support.activeId !== id) return; // switched while loading
    const msgs = Array.isArray(r) ? r : (r.messages || []);
    const key = id + "|" + JSON.stringify(msgs);
    if (key === cache.messages) return;
    cache.messages = key;
    const box = $("#convoMsgs");
    const ROLE = { user: ["m-user", "Khách"], agent: ["m-agent", "✨ AI Agent"], staff: ["m-staff", "Nhân viên"] };
    box.innerHTML = msgs.length ? msgs.map((msg) => {
      const [cls, label] = ROLE[msg.role] || ["m-agent", msg.role || "?"];
      return `
      <div class="msg ${cls}">
        <span class="msg-role">${esc(msg.role === "staff" && msg.staff_name ? msg.staff_name : label)}</span>
        <div class="msg-bubble">${esc(msg.content ?? msg.text ?? msg.message ?? "")}</div>
        <span class="msg-time">${fmtHMS(msg.created_at)}</span>
      </div>`;
    }).join("") : `<p class="empty">Chưa có tin nhắn trong phiên này.</p>`;
    box.scrollTop = box.scrollHeight;
  };

  async function sendReply() {
    const input = $("#replyInput");
    const content = input.value.trim();
    if (!content || support.activeId == null) return;
    const btn = $("#replyBtn");
    btn.disabled = true;
    try {
      await call(`/api/admin/handoff/${support.activeId}/reply`, { method: "POST", body: { content } });
      input.value = "";
      cache.messages = null;
      await guard(loadMessages)();
    } catch (_) { /* toast shown */ }
    btn.disabled = false;
    input.focus();
  }
  $("#replyBtn").addEventListener("click", sendReply);
  $("#replyInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReply(); }
  });

  const loadStaff = async () => {
    if (activeTab !== "support") return;
    const r = await call("/api/admin/staff");
    const staff = Array.isArray(r) ? r : (r.staff || []);
    support.staff = staff;
    const key = JSON.stringify(staff);
    if (key === cache.staff) return;
    cache.staff = key;
    renderStaff();
  };

  function renderStaff() {
    $("#staffList").innerHTML = support.staff.length ? support.staff.map((s) => {
      const on = !!Number(s.available);
      const initials = String(s.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase();
      return `
      <div class="staff-row ${on ? "avail" : ""}">
        <span class="staff-ava">${esc(initials)}</span>
        <div class="staff-info">
          <div class="staff-name">${esc(s.name)}</div>
          <div class="staff-role">${esc(s.role || "")}</div>
        </div>
        <span class="staff-state">${on ? "Đang trực" : "Nghỉ"}</span>
        <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-staff="${esc(s.id)}" aria-label="Trạng thái trực của ${esc(s.name)}"></button>
      </div>`;
    }).join("") : `<p class="empty">Chưa có nhân viên nào.</p>`;
  }

  $("#staffList").addEventListener("click", async (e) => {
    const sw = e.target.closest(".switch[data-staff]");
    if (!sw) return;
    const s = support.staff.find((x) => String(x.id) === sw.dataset.staff);
    if (!s) return;
    const next = !Number(s.available);
    s.available = next ? 1 : 0;      // optimistic
    renderStaff();
    try {
      await call(`/api/admin/staff/${s.id}`, { method: "PUT", body: { available: next } });
      toast(next ? `${s.name} bắt đầu trực` : `${s.name} tạm nghỉ`);
      cache.staff = null;
    } catch (_) {
      s.available = next ? 0 : 1;    // revert
      renderStaff();
    }
  });

  /* ================= 4 · AI settings ================= */

  const SIGNAL_META = {
    cooccurrence: { vi: "Lịch sử mua kèm (POS)", en: "Co-occurrence", desc: "Gợi ý món mà các khách khác thường mua chung, dựa trên hoá đơn thật của cửa hàng." },
    affinity:     { vi: "Luật món hợp nhau",     en: "Affinity rules", desc: "Cặp món hợp vị do đội ngũ định sẵn — ví dụ gà rán luôn đi cùng nước ngọt." },
    daypart:      { vi: "Khung giờ trong ngày",  en: "Daypart", desc: "Ưu tiên món phù hợp với buổi sáng, trưa, xế hay tối." },
    promo:        { vi: "Khuyến mãi đang chạy",  en: "Promotions", desc: "Ưu tiên gợi ý các món đang có chương trình giảm giá." },
    margin:       { vi: "Biên lợi nhuận",        en: "Margin", desc: "Ưu tiên nhẹ những món mang lại lợi nhuận tốt hơn cho cửa hàng." },
    popularity:   { vi: "Độ phổ biến",           en: "Popularity", desc: "Ưu tiên những món bán chạy nhất tại cửa hàng." },
  };

  let settings = null;

  const loadSettings = async () => {
    const r = await call("/api/admin/settings");
    const s = r && r.settings ? r.settings : r;
    const key = JSON.stringify(s);
    if (key === cache.settings) return;
    cache.settings = key;
    settings = s || {};
    renderSettings();
  };

  function renderSettings() {
    const signals = settings.signals || {};
    $("#aiSignals").innerHTML = Object.keys(SIGNAL_META).map((k) => {
      const meta = SIGNAL_META[k];
      const on = !!signals[k];
      return `
      <div class="sig-row ${on ? "" : "off"}">
        <div class="sig-info">
          <div class="sig-name">${esc(meta.vi)} <span class="en">${esc(meta.en)}</span></div>
          <div class="sig-desc">${esc(meta.desc)}</div>
        </div>
        <button class="switch gold ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-signal="${k}" aria-label="${esc(meta.vi)}"></button>
      </div>`;
    }).join("");

    const pitchOn = !!settings.llm_pitch;
    const slots = Math.min(4, Math.max(1, Number(settings.rec_slots) || 2));
    $("#aiPresent").innerHTML = `
      <div class="sig-row ${pitchOn ? "" : "off"}">
        <div class="sig-info">
          <div class="sig-name">Lời chào AI viết <span class="en">AI-written pitch</span></div>
          <div class="sig-desc">AI tự viết một câu mời ngắn cho từng gợi ý — ví dụ: “Thêm Pepsi mát lạnh chỉ 15.000₫?”.</div>
        </div>
        <button class="switch gold ${pitchOn ? "on" : ""}" role="switch" aria-checked="${pitchOn}" data-pitch aria-label="Lời chào AI viết"></button>
      </div>
      <div class="sig-row" style="border-top:1px solid var(--ops-line)">
        <div class="sig-info">
          <div class="sig-name">Số gợi ý hiển thị <span class="en">Recommendation slots</span></div>
          <div class="sig-desc">Số món AI gợi ý cùng lúc trên màn hình kiosk.</div>
          <div class="slots-seg">
            ${[1, 2, 3, 4].map((n) => `<button data-slots="${n}" class="${n === slots ? "sel" : ""}">${n}</button>`).join("")}
          </div>
        </div>
      </div>`;

    const weights = settings.weights || {};
    const entries = Object.keys(SIGNAL_META).filter((k) => weights[k] != null)
      .concat(Object.keys(weights).filter((k) => !SIGNAL_META[k]));
    const maxW = Math.max(...entries.map((k) => Number(weights[k]) || 0), 0.0001);
    $("#aiWeights").innerHTML = entries.length ? entries.map((k) => {
      const w = Number(weights[k]) || 0;
      return `
      <div class="w-row">
        <span class="w-name">${esc(SIGNAL_META[k] ? SIGNAL_META[k].vi : k)}</span>
        <div class="meter gold"><i style="width:${(w / maxW) * 100}%"></i></div>
        <span class="w-val">${w.toFixed(2)}</span>
      </div>`;
    }).join("") : `<p class="empty">Chưa có trọng số.</p>`;
  }

  async function putSettings(patch, revert) {
    try {
      await call("/api/admin/settings", { method: "PUT", body: patch });
      toast("Đã lưu cài đặt AI");
      cache.settings = null;
    } catch (_) {
      revert();
      renderSettings();
    }
  }

  $("#tab-ai").addEventListener("click", (e) => {
    const sig = e.target.closest(".switch[data-signal]");
    if (sig) {
      const k = sig.dataset.signal;
      const signals = { ...(settings.signals || {}) };
      Object.keys(SIGNAL_META).forEach((s) => { signals[s] = !!signals[s]; });
      const prev = signals[k];
      signals[k] = !prev;
      settings.signals = signals;
      renderSettings();
      putSettings({ signals }, () => { settings.signals[k] = prev; });
      return;
    }
    const pitch = e.target.closest(".switch[data-pitch]");
    if (pitch) {
      const prev = !!settings.llm_pitch;
      settings.llm_pitch = !prev;
      renderSettings();
      putSettings({ llm_pitch: !prev }, () => { settings.llm_pitch = prev; });
      return;
    }
    const slot = e.target.closest("[data-slots]");
    if (slot) {
      const prev = settings.rec_slots;
      const n = Number(slot.dataset.slots);
      if (n === prev) return;
      settings.rec_slots = n;
      renderSettings();
      putSettings({ rec_slots: n }, () => { settings.rec_slots = prev; });
    }
  });

  /* ================= 5 · menu ================= */

  let menuItems = [];
  const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g"); // combining marks
  const stripVn = (s) => String(s || "").toLowerCase().normalize("NFD").replace(DIACRITICS, "").replace(/đ/g, "d");

  const loadMenu = async () => {
    const r = await call("/api/admin/menu");
    const items = Array.isArray(r) ? r : (r.menu || r.items || []);
    const key = JSON.stringify(items);
    if (key === cache.menu) return;
    cache.menu = key;
    menuItems = items;
    renderMenu();
  };

  function renderMenu() {
    const q = stripVn($("#menuSearch").value.trim());
    const filtered = q
      ? menuItems.filter((it) => stripVn(it.name).includes(q) || stripVn(it.name_en).includes(q))
      : menuItems;

    const catOrder = Object.keys(CAT_META);
    const groups = new Map();
    filtered.forEach((it) => {
      const c = it.category || "khac";
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(it);
    });
    const cats = [...groups.keys()].sort((a, b) => {
      const ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    $("#menuGroups").innerHTML = cats.length ? cats.map((c) => {
      const meta = CAT_META[c] || { vi: c, en: "", icon: "🍽️" };
      const rows = groups.get(c).map((it) => {
        const on = !!Number(it.available);
        const rawPop = Number(it.popularity) || 0;
        const pop = Math.min(100, rawPop <= 1 ? rawPop * 100 : rawPop);
        return `
        <div class="m-row ${on ? "" : "soldout"}">
          <div class="m-name">${esc(it.name)}${it.name_en ? `<small>${esc(it.name_en)}</small>` : ""}</div>
          <div class="m-price">${fmtVND(it.price)}</div>
          <div class="m-pop"><div class="meter ${on ? "ok" : "dim"}"><i style="width:${pop}%"></i></div><span>${Math.round(pop)}</span></div>
          <div class="m-avail">
            <span class="m-state ${on ? "on" : "off"}">${on ? "Còn hàng" : "Hết hàng"}</span>
            <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-menu="${esc(it.id)}" aria-label="Tình trạng ${esc(it.name)}"></button>
          </div>
        </div>`;
      }).join("");
      return `
      <div class="menu-group">
        <div class="mg-head">${meta.icon || ""} ${esc(meta.vi)} <span class="en">${esc(meta.en)}</span><span class="mg-count">${groups.get(c).length} món</span></div>
        <div class="panel menu-table">${rows}</div>
      </div>`;
    }).join("") : `<p class="empty">Không tìm thấy món nào khớp “${esc($("#menuSearch").value)}”.</p>`;
  }

  $("#menuSearch").addEventListener("input", renderMenu);

  $("#menuGroups").addEventListener("click", async (e) => {
    const sw = e.target.closest(".switch[data-menu]");
    if (!sw) return;
    const it = menuItems.find((x) => String(x.id) === sw.dataset.menu);
    if (!it) return;
    const next = !Number(it.available);
    it.available = next ? 1 : 0;     // optimistic, instant
    renderMenu();
    try {
      await call(`/api/admin/menu/${it.id}`, { method: "PUT", body: { available: next } });
      toast(next ? `“${it.name}” bán trở lại` : `“${it.name}” đánh dấu hết hàng`, next ? "ok" : "err");
      cache.menu = null;
    } catch (_) {
      it.available = next ? 0 : 1;   // revert
      renderMenu();
    }
  });

  /* ================= 6 · promotions ================= */

  let promos = [];
  const DAY_LABEL = { mon: "T2", tue: "T3", wed: "T4", thu: "T5", fri: "T6", sat: "T7", sun: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN", 0: "CN" };
  function fmtDays(v) {
    if (!v) return "";
    return String(v).split(/[,;\s]+/).filter(Boolean)
      .map((t) => DAY_LABEL[t.toLowerCase()] || t.toUpperCase()).join(", ");
  }

  const loadPromos = async () => {
    const r = await call("/api/admin/promos");
    const list = Array.isArray(r) ? r : (r.promos || []);
    const key = JSON.stringify(list);
    if (key === cache.promos) return;
    cache.promos = key;
    promos = list;
    renderPromos();
  };

  function renderPromos() {
    $("#promoGrid").innerHTML = promos.length ? promos.map((p) => {
      const on = !!Number(p.active);
      const dp = p.daypart && DAYPART_META[p.daypart];
      const chips = [];
      if (p.kind === "percent" && p.value != null) chips.push(`<span class="chip ch-green">Giảm ${esc(p.value)}%</span>`);
      else if (p.value != null && p.value > 0) chips.push(`<span class="chip ch-green">Giảm ${fmtVND(p.value)}</span>`);
      if (p.scope_category && CAT_META[p.scope_category]) chips.push(`<span class="chip">${CAT_META[p.scope_category].icon} ${esc(CAT_META[p.scope_category].vi)}</span>`);
      if (dp) chips.push(`<span class="chip">${dp.icon} ${esc(dp.vi)}</span>`);
      else if (p.daypart) chips.push(`<span class="chip">🕒 ${esc(p.daypart)}</span>`);
      if (p.days_of_week) chips.push(`<span class="chip">📅 ${esc(fmtDays(p.days_of_week))}</span>`);
      if (p.min_order) chips.push(`<span class="chip">Đơn từ ${fmtVND(p.min_order)}</span>`);
      return `
      <div class="panel promo-card ${on ? "" : "off"}">
        <div class="promo-top">
          <span class="promo-code">${esc(p.code)}</span>
          <button class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-promo="${esc(p.id)}" aria-label="Khuyến mãi ${esc(p.code)}"></button>
        </div>
        <div class="promo-name">${esc(p.name)}</div>
        <div class="promo-desc">${esc(p.description || "")}</div>
        <div class="promo-chips">${chips.join("")}</div>
        <div class="promo-state">${on ? "● Đang chạy — AI sẽ nhắc khách" : "○ Tạm tắt"}</div>
      </div>`;
    }).join("") : `<p class="empty">Chưa có chương trình khuyến mãi nào.</p>`;
  }

  $("#promoGrid").addEventListener("click", async (e) => {
    const sw = e.target.closest(".switch[data-promo]");
    if (!sw) return;
    const p = promos.find((x) => String(x.id) === sw.dataset.promo);
    if (!p) return;
    const next = !Number(p.active);
    p.active = next ? 1 : 0;         // optimistic
    renderPromos();
    try {
      await call(`/api/admin/promo/${p.id}`, { method: "PUT", body: { active: next } });
      toast(next ? `Đã bật khuyến mãi ${p.code}` : `Đã tắt khuyến mãi ${p.code}`);
      cache.promos = null;
    } catch (_) {
      p.active = next ? 0 : 1;       // revert
      renderPromos();
    }
  });

  /* ================= 7 · live log ================= */

  let logCursor = 0;
  let logStick = true;
  const LOG_MAX = 200;
  const SRC_CLS = { kiosk: "ch-kiosk", agent: "ch-chat", rec: "ch-chat", admin: "ch-blue", staff: "ch-green" };

  const logScroll = $("#logScroll");
  logScroll.addEventListener("scroll", () => {
    logStick = logScroll.scrollTop + logScroll.clientHeight >= logScroll.scrollHeight - 40;
    $("#logJump").hidden = logStick;
  });
  $("#logJump").addEventListener("click", () => {
    logStick = true;
    $("#logJump").hidden = true;
    logScroll.scrollTop = logScroll.scrollHeight;
  });

  const loadLog = async () => {
    const r = await call(`/api/telemetry?after=${encodeURIComponent(logCursor)}`);
    const events = (r && r.events) || [];
    if (r && r.cursor != null) logCursor = r.cursor;
    else if (events.length) logCursor = events[events.length - 1].id;
    if (!events.length) return;
    const empty = $("#logEmpty");
    if (empty) empty.remove();
    const frag = document.createDocumentFragment();
    events.forEach((ev) => {
      const row = document.createElement("div");
      row.className = "log-row";
      const src = String(ev.source || "?");
      const hop = ev.node_from && ev.node_to ? ` <small>· ${esc(ev.node_from)} → ${esc(ev.node_to)}</small>` : "";
      row.innerHTML = `
        <span class="log-time">${fmtHMS(ev.created_at)}</span>
        <span class="chip ${SRC_CLS[src] || ""}">${esc(src)}</span>
        <span class="log-label">${esc(ev.label || ev.type || "")}${hop}</span>
        <span class="log-ms">${ev.duration_ms != null ? fmtNum(ev.duration_ms) + " ms" : ""}</span>`;
      frag.appendChild(row);
    });
    logScroll.appendChild(frag);
    while (logScroll.children.length > LOG_MAX) logScroll.removeChild(logScroll.firstChild);
    if (logStick) logScroll.scrollTop = logScroll.scrollHeight;
  };

  /* ================= boot ================= */

  addPoller("overview", 5000, loadMetrics);
  addPoller("orders", 3000, loadOrders);
  addPoller("*", 3000, loadHandoffs);      // global → sidebar alert badge
  addPoller("support", 3000, loadStaff);
  addPoller("support", 3000, loadMessages);
  addPoller("ai", 15000, loadSettings);
  addPoller("menu", 10000, loadMenu);
  addPoller("promos", 10000, loadPromos);
  addPoller("log", 2000, loadLog);

  setTab("overview");
})();
