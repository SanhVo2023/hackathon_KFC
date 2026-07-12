// Desktop live view: renders the system diagram SVG and animates it from
// two sources — (1) D1 telemetry polled every 900ms, (2) instant postMessage
// events from the kiosk iframe. The cascade (UI edge first, backend edges a
// beat later) reads as causality.
(() => {
  const { $, api } = window.KFC;
  const SVG = "http://www.w3.org/2000/svg";
  const svg = $("#diagram");

  // ---------- node map — the real runtime architecture, in 4 lanes ----------
  const NODES = {
    kiosk:    { x: 60,   y: 170, w: 230, h: 84, icon: "🖥️", name: "Kiosk UI",     sub: "self-order · khách chạm" },
    admin:    { x: 60,   y: 350, w: 230, h: 84, icon: "🛠️", name: "Admin / Ops",  sub: "scenario · tồn kho · HITL" },
    worker:   { x: 450,  y: 258, w: 240, h: 84, icon: "⚡", name: "Worker API",   sub: "Cloudflare edge · TypeScript" },
    profiler: { x: 840,  y: 104, w: 250, h: 84, icon: "👁", name: "Profiler",     sub: "giả thuyết khách · confidence" },
    rec:      { x: 840,  y: 258, w: 250, h: 84, icon: "✦",  name: "Rec Engine",   sub: "8 tín hiệu + buyer psychology" },
    agent:    { x: 840,  y: 412, w: 250, h: 84, icon: "🤖", name: "Agent Loop",   sub: "P4 chat · 9 D1 tools" },
    llm:      { x: 1300, y: 130, w: 240, h: 84, icon: "🧠", name: "Workers AI",   sub: "vision · 8B-fast · gpt-oss" },
    d1:       { x: 1300, y: 284, w: 240, h: 84, icon: "🗄️", name: "D1 Database",  sub: "menu · POS · tồn kho · đơn" },
    staff:    { x: 1300, y: 438, w: 240, h: 74, icon: "👤", name: "CS / Sales",   sub: "human-in-the-loop" },
  };

  const LANES = [
    [175, "STOREFRONT"], [570, "EDGE RUNTIME"], [965, "AGENT BRAIN"], [1420, "MODELS + DATA"],
  ];

  // the agent's working cycle — pills light up as matching events fire
  const LOOP = [
    { id: "observe",     label: "👁 OBSERVE" },
    { id: "hypothesize", label: "🧠 HYPOTHESIZE" },
    { id: "decide",      label: "✦ DECIDE" },
    { id: "act",         label: "⚡ ACT" },
    { id: "verify",      label: "✓ VERIFY" },
  ];

  // static edges drawn up-front (grey rails the pulses ride on); 3rd item = flow label
  const EDGES = [
    ["kiosk", "worker", "taps · giỏ hàng"],
    ["admin", "worker"],
    ["kiosk", "profiler", "hành vi + camera"],
    ["profiler", "llm", "vision · refine"],
    ["profiler", "rec", "hypothesis"],
    ["worker", "rec"],
    ["rec", "d1", "POS · tồn kho"],
    ["rec", "llm", "pitch ≤1.2s"],
    ["rec", "kiosk", "top-3 + strategy"],
    ["worker", "d1"],
    ["worker", "agent"],
    ["agent", "llm", "tool-use"],
    ["agent", "d1"],
    ["agent", "staff", "handoff"],
    ["staff", "kiosk"],
    ["admin", "d1"],
  ];

  const center = (n) => ({ cx: n.x + n.w / 2, cy: n.y + n.h / 2 });

  function edgePath(a, b) {
    const A = center(NODES[a]), B = center(NODES[b]);
    const mx = (A.cx + B.cx) / 2;
    // gentle horizontal-ish curve
    return `M ${A.cx} ${A.cy} C ${mx} ${A.cy}, ${mx} ${B.cy}, ${B.cx} ${B.cy}`;
  }

  const edgeEls = {};
  function edgeKey(a, b) { return `${a}->${b}`; }

  function drawStatic() {
    // agent loop ribbon across the top — the Goal→Act→Verify frame
    const lg = document.createElementNS(SVG, "g");
    lg.innerHTML = `<text class="dg-lane" x="60" y="38">AGENT LOOP</text>` + LOOP.map((s, i) => {
      const x = 340 + i * 250;
      return `
        ${i ? `<text class="dg-loop-arrow" x="${x - 24}" y="39">›</text>` : ""}
        <g class="loop-step" id="loop-${s.id}">
          <rect x="${x}" y="12" width="210" height="40" rx="20"></rect>
          <text x="${x + 105}" y="38" text-anchor="middle">${s.label}</text>
        </g>`;
    }).join("");
    svg.appendChild(lg);

    for (const [x, name] of LANES) {
      const t = document.createElementNS(SVG, "text");
      t.setAttribute("class", "dg-lane");
      t.setAttribute("x", x); t.setAttribute("y", 86);
      t.setAttribute("text-anchor", "middle");
      t.textContent = name;
      svg.appendChild(t);
    }

    for (const [a, b, label] of EDGES) {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", edgePath(a, b));
      p.setAttribute("class", "dg-edge");
      svg.appendChild(p);
      edgeEls[edgeKey(a, b)] = p;
      edgeEls[edgeKey(b, a)] = p;
      if (label) {
        const pt = p.getPointAtLength(p.getTotalLength() / 2);
        const t = document.createElementNS(SVG, "text");
        t.setAttribute("class", "dg-edge-label");
        t.setAttribute("x", pt.x); t.setAttribute("y", pt.y - 7);
        t.setAttribute("text-anchor", "middle");
        t.textContent = label;
        svg.appendChild(t);
      }
    }
    for (const [id, n] of Object.entries(NODES)) {
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", "dg-node");
      g.setAttribute("id", `node-${id}`);
      g.innerHTML = `
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14"></rect>
        <text class="dg-ic" x="${n.x + 18}" y="${n.y + n.h / 2 + 9}">${n.icon}</text>
        <text x="${n.x + 56}" y="${n.y + n.h / 2 - 4}">${n.name}</text>
        <text class="dg-sub" x="${n.x + 56}" y="${n.y + n.h / 2 + 18}">${n.sub}</text>`;
      svg.appendChild(g);
    }
  }

  // which loop pill does this event light up?
  function loopStepFor(e) {
    const t = e.type ?? "";
    if (/^(rec_accepted|rec_dismissed|llm_timeout|order_status|handoff_status)$/.test(t)) return "verify";
    if (t === "profile_updated" || e.node_from === "profiler" || e.node_to === "profiler") return "hypothesize";
    if (/^(rec_request|rec_scored|strategy|smart_swap|tool_call)$/.test(t)) return "decide";
    if (/^(rec_response|llm_call|llm_result|order_placed|handoff|staff_reply|tool_result)$/.test(t)) return "act";
    if (e.node_from === "kiosk" || e.source === "kiosk") return "observe";
    return null;
  }
  function lightLoop(id) {
    const g = $(`#loop-${id}`);
    if (!g) return;
    g.classList.add("on");
    clearTimeout(g._t);
    g._t = setTimeout(() => g.classList.remove("on"), 1400);
  }

  function pulse(a, b, color = "") {
    if (!NODES[a] || !NODES[b]) return;
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", edgePath(a, b));
    p.setAttribute("class", `dg-pulse ${color}`);
    svg.appendChild(p);
    setTimeout(() => p.remove(), 1200);
    glow(a, color); glow(b, color);
  }

  function glow(id, color = "") {
    const g = $(`#node-${id}`);
    if (!g) return;
    const cls = color === "red" ? "glow-red" : "glow";
    g.classList.add(cls);
    clearTimeout(g._t);
    g._t = setTimeout(() => g.classList.remove("glow", "glow-red"), 1300);
  }

  // ---------- log ----------
  const logEl = $("#log-scroll");
  let logCount = 0, agentCount = 0, logFilter = "all";

  // agent events = the agent's own working: profiling, scoring, strategy
  // decisions, LLM calls, tool use, handoffs — not request/config plumbing
  function isAgentEvent(e) {
    if (/^(rec_|llm_|tool_|strategy|smart_|profile_|chat_|handoff)/.test(e.type ?? "")) return true;
    const agentNodes = ["rec", "profiler", "agent"];
    return agentNodes.includes(e.node_from) || agentNodes.includes(e.node_to);
  }
  function updateLogCount() {
    $("#log-count").textContent = logFilter === "agent"
      ? `${agentCount} agent events` : `${logCount} events`;
  }
  $("#log-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".lf-btn");
    if (!btn) return;
    logFilter = btn.dataset.f;
    document.querySelectorAll(".lf-btn").forEach((b) => b.classList.toggle("on", b === btn));
    logEl.classList.toggle("filter-agent", logFilter === "agent");
    updateLogCount();
    logEl.scrollTop = logEl.scrollHeight;
  });

  function addLog(src, label, ms, time, agent = false) {
    logCount++;
    if (agent) agentCount++;
    updateLogCount();
    const row = document.createElement("div");
    row.className = "log-row" + (agent ? " agent-ev" : "");
    // D1 created_at is UTC "YYYY-MM-DD HH:MM:SS" — render in local time
    const t = time
      ? new Date(time.replace(" ", "T") + "Z").toTimeString().slice(0, 8)
      : new Date().toTimeString().slice(0, 8);
    row.innerHTML = `
      <span class="lr-time">${t}</span>
      <span class="lr-src ${src}">${src}</span>
      <span class="lr-label"></span>
      <span class="lr-ms ${ms > 1000 ? "slow" : ""}">${ms != null ? ms + "ms" : ""}</span>`;
    row.querySelector(".lr-label").textContent = label;
    const stick = logEl.scrollTop + logEl.clientHeight > logEl.scrollHeight - 40;
    logEl.appendChild(row);
    while (logEl.children.length > 250) logEl.firstChild.remove();
    if (stick) logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- event → animation mapping ----------
  function colorFor(e) {
    if (e.source === "kiosk" && !e.type.startsWith("rec") && !e.type.startsWith("llm")) return "red";
    if (e.node_to === "staff" || e.node_from === "staff") return "green";
    return ""; // gold
  }

  function handleTelemetry(e) {
    if (e.node_from && e.node_to) pulse(e.node_from, e.node_to, colorFor(e));
    else if (e.node_from) glow(e.node_from);
    const step = loopStepFor(e);
    if (step) lightLoop(step);
    if (e.type === "profile_updated") { renderProfile(e); queueOpsRecs(); }
    costTrack(e);
    addLog(e.source, e.label ?? e.type, e.duration_ms, e.created_at, isAgentEvent(e));
  }

  // ---------- infra cost meter — the ROI slide of the pitch ----------
  // Cloudflare LIST prices (USD):
  //   developers.cloudflare.com/workers-ai/platform/pricing  (per-token, per model)
  //   developers.cloudflare.com/workers/platform/pricing     (requests / CPU / D1)
  const USD = {
    req: 0.30 / 1e6, cpuMs: 0.02 / 1e6, d1Read: 0.001 / 1e6, d1Write: 1.00 / 1e6,
    model: {
      gptoss: { inTok: 0.350 / 1e6, outTok: 0.750 / 1e6 },  // @cf/openai/gpt-oss-120b
      fast8b: { inTok: 0.045 / 1e6, outTok: 0.384 / 1e6 },  // @cf/meta/llama-3.1-8b-fp8-fast
      vision: { inTok: 0.049 / 1e6, outTok: 0.676 / 1e6 },  // @cf/meta/llama-3.2-11b-vision
    },
  };
  // average tokens per call type (sized from our actual prompts, rounded up)
  const TOK = {
    pitch: ["gptoss", 520, 150], agent: ["gptoss", 1300, 220],
    refine: ["fast8b", 620, 150], vision: ["vision", 900, 260],
  };
  const VND_RATE = 25500;
  const cost = { ai: 0, d1: 0, worker: 0, events: 0 };
  let aovUpliftVnd = 0; // stashed by refreshStats
  function costTrack(e) {
    cost.events++;
    cost.d1 += USD.d1Write; // every telemetry row is one D1 write
    if (e.type === "llm_call") {
      const l = (e.label ?? "").toLowerCase();
      const [m, ti, to] = l.includes("vision") || l.includes("llava") ? TOK.vision
        : l.includes("8b") || l.includes("refine") ? TOK.refine
        : l.includes("pitch") ? TOK.pitch : TOK.agent;
      cost.ai += USD.model[m].inTok * ti + USD.model[m].outTok * to;
    } else if (e.type === "d1_query") {
      cost.d1 += USD.d1Read * 180;   // ≈ rows touched by one batched query
    } else if (e.type === "api_call") {
      cost.worker += USD.req + USD.cpuMs * 6;
    }
    renderCost();
  }
  function costReset() { cost.ai = 0; cost.d1 = 0; cost.worker = 0; cost.events = 0; renderCost(); }
  function renderCost() {
    const total = cost.ai + cost.d1 + cost.worker;
    const box = $("#cost-body");
    if (!box) return;
    if (!total) { box.innerHTML = `<p class="profile-empty">Chưa có phiên.</p>`; return; }
    const vnd = total * VND_RATE;
    const row = (label, v) => `
      <div class="cost-row"><span>${label}</span>
        <div class="cost-meter"><i style="width:${Math.max(3, Math.round((v / total) * 100))}%"></i></div>
        <em>$${v.toFixed(5)}</em></div>`;
    const roi = aovUpliftVnd > 0 && vnd > 0 ? Math.round(aovUpliftVnd / vnd) : null;
    box.innerHTML = `
      <div class="cost-hero"><b>≈ ${vnd < 100 ? vnd.toFixed(1) : Math.round(vnd).toLocaleString("vi-VN")}₫</b>
        <span>$${total.toFixed(4)} · phiên hiện tại · ${cost.events} events</span></div>
      <div class="cost-rows">
        ${row("Workers AI (LLM)", cost.ai)}
        ${row("D1 (đọc + ghi)", cost.d1)}
        ${row("Worker requests", cost.worker)}
      </div>
      ${roi ? `<div class="cost-roi">↗ AI nâng AOV +${Math.round(aovUpliftVnd / 1000)}k₫/đơn — gấp ~${roi.toLocaleString("vi-VN")}× chi phí cả phiên</div>` : ""}
      <div class="cost-note">Giá niêm yết Cloudflare: gpt-oss $0.35/$0.75 · 8B-fast $0.045/$0.384 · vision $0.049/$0.676 mỗi 1M token · D1 $0.001/M rows đọc, $1/M ghi · $0.30/M requests. Token &amp; rows = ước tính trung bình mỗi lượt gọi.</div>`;
  }

  // ---------- live customer hypothesis panel ----------
  const CAT_VI = { combo: "Combo", chicken: "Gà", "burger-rice": "Burger/Cơm", snack: "Snack", drink: "Nước", dessert: "Tráng miệng" };
  function renderProfile(e) {
    let p;
    try { p = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (_) { return; }
    if (!p) return;
    const v = p.visual ?? {};
    const chips = [v.age_band, v.attire, v.group, v.context_notes].filter((x) => x && x !== "unclear")
      .map((x) => `<span class="pf-chip">${String(x)}</span>`).join("");
    const bias = p.category_bias ?? {};
    const bars = Object.entries(CAT_VI).map(([k, label]) => {
      const val = Number(bias[k] ?? 0);
      return `<div class="pf-bias"><span>${label}</span><div class="pf-meter"><i style="width:${Math.round(val * 100)}%"></i></div></div>`;
    }).join("");
    const conf = Math.round((p.confidence ?? 0) * 100);
    $("#profile-body").innerHTML = `
      <div class="pf-photo">${p.photo_thumb ? `<img src="${p.photo_thumb}" alt="" />` : `<span>👤</span>`}
        <div class="pf-conf"><i style="width:${conf}%"></i></div><small>${conf}% tin cậy</small>
      </div>
      <div class="pf-main">
        <div class="pf-persona">“${String(p.persona ?? "")}”</div>
        <div class="pf-wants">→ ${String(p.wants ?? "")}</div>
        <div class="pf-chips">${chips}</div>
        <div class="pf-evidence">${(p.evidence ?? []).slice(-3).map((ev) => `<div>${String(ev)}</div>`).join("")}</div>
      </div>
      <div class="pf-biases"><div class="pf-bias-title">thiên hướng gợi ý</div>${bars}</div>`;
  }

  // ---------- live "what the AI would recommend right now" strip ----------
  // The actual dishes the engine would serve THIS customer at THIS moment,
  // re-probed on every hypothesis update and cart change. Ops-only: the
  // strategy label explains the psychology play behind each slot.
  const STRATEGY_VI = {
    cross_subsidy: ["🥤", "Bù chéo lợi nhuận"], persona_match: ["👁", "Khớp chân dung"],
    cooccurrence: ["🧺", "Hay mua cùng"], promo: ["🏷️", "Khuyến mãi"],
    inventory_push: ["📦", "Đẩy tồn kho"], daypart_fit: ["🕐", "Hợp khung giờ"],
    margin_play: ["💰", "Biên LN cao"], affinity: ["🔗", "Món hợp vị"], popular: ["⭐", "Bán chạy"],
  };
  let opsRecTimer = null;
  function queueOpsRecs() { clearTimeout(opsRecTimer); opsRecTimer = setTimeout(refreshOpsRecs, 800); }
  async function refreshOpsRecs() {
    let sessionId = null, cart = [];
    try {
      const w = $("#kiosk-frame").contentWindow;
      sessionId = w.KFC.sessionId;
      cart = w.KFC.cartLines ? w.KFC.cartLines() : [];
    } catch (_) { return; } // kiosk not embedded
    if (!sessionId) return;
    try {
      const out = await api("/api/recommend", { method: "POST", body: { session_id: sessionId, cart, trigger: "ops_panel" } });
      const items = (out.items ?? []).slice(0, 3);
      const box = $("#pf-recs");
      if (!items.length) { box.hidden = true; return; }
      box.hidden = false;
      pulse("profiler", "rec", "");
      $("#pf-recs-row").innerHTML = items.map((r) => {
        const [ic, lbl] = STRATEGY_VI[r.strategy] ?? ["✨", r.strategy ?? ""];
        return `<div class="pfr-card">
          ${r.image_url ? `<img src="${r.image_url}" alt="" loading="lazy" />` : `<div class="pfr-ph">🍗</div>`}
          <div class="pfr-body">
            <b>${r.name}</b>
            <span class="pfr-price">${r.price_display}</span>
            <small class="pfr-pitch"></small>
          </div>
          <span class="pfr-chip" data-s="${r.strategy}">${ic} ${lbl}</span>
        </div>`;
      }).join("");
      $$("#pf-recs-row .pfr-pitch").forEach((el, i) => { el.textContent = items[i].pitch_vn ?? ""; });
    } catch (_) { /* strip is best-effort */ }
  }
  setTimeout(refreshOpsRecs, 2500);   // first probe once the kiosk booted

  // ---------- polling ----------
  let cursor = 0;
  let firstPoll = true;
  async function poll() {
    try {
      const out = await api(`/api/telemetry?after=${cursor}`);
      $("#dt-conn").classList.remove("down");
      const events = out.events ?? [];
      cursor = out.cursor ?? cursor;
      if (firstPoll) {
        // don't replay history: show last 12 as context, no pulses
        for (const e of events.slice(-12)) addLog(e.source, e.label ?? e.type, e.duration_ms, e.created_at, isAgentEvent(e));
        firstPoll = false;
        return;
      }
      // stagger pulses so bursts read as sequence
      events.forEach((e, i) => setTimeout(() => handleTelemetry(e), i * 160));
    } catch (_) {
      $("#dt-conn").classList.add("down");
    }
  }
  // catch-up: jump cursor to latest before first real poll
  (async () => {
    // burn through backlog quickly (cursor only)
    let guard = 0;
    while (guard++ < 50) {
      const out = await api(`/api/telemetry?after=${cursor}`);
      if (!out.events?.length) break;
      cursor = out.cursor;
      if (out.events.length < 120) { // last page: render tail as context
        for (const e of out.events.slice(-12)) addLog(e.source, e.label ?? e.type, e.duration_ms, e.created_at, isAgentEvent(e));
        break;
      }
    }
    firstPoll = false;
    setInterval(poll, 900);
  })();

  // ---------- instant kiosk UI events via postMessage ----------
  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (!m || !m.kfcTelemetry) return;
    glow("kiosk", "red");
    lightLoop("observe");
    if (["add_to_cart", "rec_request", "voucher", "payment"].includes(m.type)) pulse("kiosk", "worker", "red");
    if (m.type === "rec_accepted") pulse("kiosk", "rec", "");
    if (m.type === "handoff") pulse("agent", "staff", "green");
    // cart or session changed → re-probe what the AI would suggest now
    if (["add_to_cart", "rec_accepted", "session_start", "payment"].includes(m.type)) queueOpsRecs();
    if (m.type === "session_start") {
      // fresh customer: zero the meter, blank the hypothesis
      costReset();
      $("#profile-body").innerHTML = `<p class="profile-empty">Khách mới — đang quan sát thao tác…</p>`;
      $("#pf-recs").hidden = true;
    }
    addLog("ui", m.label ?? m.type, null);
  });

  // ---------- background metrics poll — only feeds the cost panel's ROI line ----------
  async function refreshStats() {
    try {
      const m = await api("/api/admin/metrics");
      aovUpliftVnd = Math.max(0, (m.aov_with_rec_vnd ?? 0) - (m.aov_without_rec_vnd ?? 0));
    } catch (_) { /* best-effort */ }
  }
  refreshStats();
  setInterval(refreshStats, 5000);

  // ---------- camera frame injection (demo stand-in for the store camera) ----------
  // In production a ceiling camera snaps a frame when a session starts; here the
  // operator injects one. The kiosk never shows anything — profiling is invisible.
  $("#pf-file").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const toDataUrl = (img, max) => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", .75);
    };
    const img = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = reader.result; };
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    // the kiosk iframe is same-origin: read the live customer session directly
    let sessionId = null;
    try { sessionId = $("#kiosk-frame").contentWindow.KFC.sessionId; } catch (_) { /* standalone */ }
    if (!sessionId) return;
    glow("profiler"); pulse("kiosk", "profiler", "");
    await api("/api/profile/photo", {
      method: "POST",
      body: { session_id: sessionId, image: toDataUrl(img, 512), thumb: toDataUrl(img, 120) },
    }).catch(() => null);
    ev.target.value = "";
  });

  // ---------- scenario director — 3 iconic situations, one tap each ----------
  const PRESETS = [
    { key: "office-lunch", icon: "🏢", title: "Trưa văn phòng", sub: "Landmark 81 · Thứ 3 · 12:00 — dân công sở cần nhanh",
      scenario: { label: "Trưa văn phòng", store_id: 3, daypart: "lunch", dow: 2, holiday: null } },
    { key: "mall-weekend", icon: "🛍️", title: "Tối cuối tuần ở TTTM", sub: "Vincom · Thứ 7 · 19:00 — gia đình đông, Zinger hết hàng",
      scenario: { label: "Tối T7 TTTM", store_id: 2, daypart: "dinner", dow: 6, holiday: null }, inventory: "zinger_out" },
    { key: "xmas-eve", icon: "🎄", title: "Đêm Giáng Sinh", sub: "Khu dân cư · 24/12 · tối — combo Noel, dư tráng miệng",
      scenario: { label: "Đêm Giáng Sinh 🎄", store_id: 1, daypart: "dinner", dow: 4, holiday: "Đêm Giáng Sinh" },
      inventory: "dessert_over", promo_code: "NOEL" },
  ];

  const drawer = $("#scenario-drawer");
  $("#scenario-btn").addEventListener("click", () => { drawer.hidden = !drawer.hidden; });
  $("#scenario-close").addEventListener("click", () => { drawer.hidden = true; });

  $("#sd-presets").innerHTML = PRESETS.map((p) => `
    <button class="sd-preset" data-key="${p.key}">
      <span class="sdp-icon">${p.icon}</span>
      <span class="sdp-body"><b>${p.title}</b><small>${p.sub}</small></span>
    </button>`).join("");

  (async () => {
    try {
      const settings = await api("/api/admin/settings");
      if (settings.scenario?.label) $("#scenario-label").textContent = settings.scenario.label;
    } catch (_) { /* label stays default until reachable */ }
  })();

  async function applyScenario(scenario, inventoryPreset, promoCode) {
    await api("/api/admin/scenario", {
      method: "POST",
      body: {
        scenario,
        ...(inventoryPreset ? { inventory_preset: inventoryPreset, store_id: scenario?.store_id } : {}),
        promo_code: promoCode ?? null,   // null on clear → scenario promos deactivate
      },
    });
    $("#scenario-label").textContent = scenario?.label ?? "Thời gian thực";
    document.querySelector(".dt-header").classList.toggle("scenario-on", !!scenario);
    // the kiosk picks the new context up on its next attract-screen menu load;
    // nudge it now if it's embedded
    const frame = $("#kiosk-frame");
    if (frame) frame.contentWindow.postMessage({ kfcScenario: true }, "*");
    drawer.hidden = true;
    queueOpsRecs();
  }

  $("#sd-presets").addEventListener("click", (e) => {
    const btn = e.target.closest(".sd-preset");
    if (!btn) return;
    const p = PRESETS.find((x) => x.key === btn.dataset.key);
    applyScenario(p.scenario, p.inventory, p.promo_code);
  });
  $("#sd-clear").addEventListener("click", () => applyScenario(null));

  drawStatic();
})();
