// Desktop live view: renders the system diagram SVG and animates it from
// two sources — (1) D1 telemetry polled every 900ms, (2) instant postMessage
// events from the kiosk iframe. The cascade (UI edge first, backend edges a
// beat later) reads as causality.
(() => {
  const { $, api } = window.KFC;
  const SVG = "http://www.w3.org/2000/svg";
  const svg = $("#diagram");

  // ---------- node map ----------
  const NODES = {
    profiler: { x: 95,  y: 95,  w: 190, h: 84, icon: "👁", name: "Profiler",       sub: "customer hypothesis" },
    kiosk:    { x: 95,  y: 300, w: 190, h: 84, icon: "🖥️", name: "Kiosk UI",      sub: "self-order · 4K touch" },
    admin:    { x: 95,  y: 505, w: 190, h: 84, icon: "🛠️", name: "Admin",          sub: "control + scenario" },
    worker:   { x: 400, y: 300, w: 210, h: 84, icon: "⚡", name: "Worker API",     sub: "Cloudflare edge" },
    rec:      { x: 720, y: 130, w: 220, h: 84, icon: "✦",  name: "Rec Engine",     sub: "P2 · 8-signal scorer" },
    agent:    { x: 720, y: 395, w: 220, h: 84, icon: "🤖", name: "Agent Loop",     sub: "P4 · 9 tools" },
    d1:       { x: 1035, y: 240, w: 190, h: 84, icon: "🗄️", name: "D1 Database",   sub: "menu · POS · orders" },
    llm:      { x: 1035, y: 445, w: 190, h: 84, icon: "🧠", name: "Workers AI",    sub: "vision + gpt-oss + 8b" },
    staff:    { x: 400, y: 540, w: 210, h: 74, icon: "👤", name: "CS / Sales",     sub: "human-in-the-loop" },
    langfuse: { x: 720, y: 560, w: 220, h: 64, icon: "📊", name: "Langfuse",       sub: "tracing-ready", dim: true },
    tinyfish: { x: 400, y: 70,  w: 210, h: 74, icon: "🐟", name: "TinyFish",       sub: "menu crawl (seed)", dim: true },
  };

  // static edges drawn up-front (grey rails the pulses ride on)
  const EDGES = [
    ["kiosk", "worker"], ["admin", "worker"], ["worker", "rec"], ["worker", "agent"],
    ["worker", "d1"], ["rec", "d1"], ["rec", "llm"], ["agent", "d1"], ["agent", "llm"],
    ["agent", "staff"], ["staff", "kiosk"], ["agent", "langfuse"], ["admin", "d1"],
    ["tinyfish", "d1", true], ["rec", "kiosk"],
    ["kiosk", "profiler"], ["profiler", "llm"], ["profiler", "rec"],
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
    for (const [a, b, dashed] of EDGES) {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", edgePath(a, b));
      p.setAttribute("class", "dg-edge" + (dashed ? " dashed" : ""));
      svg.appendChild(p);
      edgeEls[edgeKey(a, b)] = p;
      edgeEls[edgeKey(b, a)] = p;
    }
    for (const [id, n] of Object.entries(NODES)) {
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", "dg-node" + (n.dim ? " dim" : ""));
      g.setAttribute("id", `node-${id}`);
      g.innerHTML = `
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14"></rect>
        <text class="dg-ic" x="${n.x + 18}" y="${n.y + n.h / 2 + 9}">${n.icon}</text>
        <text x="${n.x + 56}" y="${n.y + n.h / 2 - 4}">${n.name}</text>
        <text class="dg-sub" x="${n.x + 56}" y="${n.y + n.h / 2 + 18}">${n.sub}</text>`;
      svg.appendChild(g);
    }
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
  let logCount = 0;
  function addLog(src, label, ms, time) {
    logCount++;
    $("#log-count").textContent = `${logCount} events`;
    const row = document.createElement("div");
    row.className = "log-row";
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
    if (e.type === "profile_updated") renderProfile(e);
    addLog(e.source, e.label ?? e.type, e.duration_ms, e.created_at);
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
        for (const e of events.slice(-12)) addLog(e.source, e.label ?? e.type, e.duration_ms, e.created_at);
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
        for (const e of out.events.slice(-12)) addLog(e.source, e.label ?? e.type, e.duration_ms, e.created_at);
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
    if (["add_to_cart", "rec_request", "voucher", "payment"].includes(m.type)) pulse("kiosk", "worker", "red");
    if (m.type === "rec_accepted") pulse("kiosk", "rec", "");
    if (m.type === "handoff") pulse("agent", "staff", "green");
    addLog("ui", m.label ?? m.type, null);
  });

  // ---------- header stats ----------
  async function refreshStats() {
    try {
      const m = await api("/api/admin/metrics");
      const uplift = m.aov_without_rec_vnd > 0 && m.aov_with_rec_vnd > 0
        ? Math.round(((m.aov_with_rec_vnd - m.aov_without_rec_vnd) / m.aov_without_rec_vnd) * 100) : null;
      $("#dt-stats").innerHTML = `
        <div class="stat"><b>${m.orders}</b><span>orders</span></div>
        <div class="stat"><b>${(m.revenue_vnd / 1000).toFixed(0)}k₫</b><span>revenue</span></div>
        <div class="stat gold"><b>${m.rec_acceptance_pct}%</b><span>rec accept</span></div>
        <div class="stat gold"><b>${uplift != null ? (uplift >= 0 ? "+" : "") + uplift + "%" : "—"}</b><span>AOV uplift (AI)</span></div>
        <div class="stat"><b>${m.chat_turns}</b><span>chat turns</span></div>
        <div class="stat"><b>${m.handoffs}</b><span>handoffs</span></div>`;
    } catch (_) { /* header stats are best-effort */ }
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

  // ---------- scenario director ----------
  const PRESETS = [
    { key: "office-lunch", icon: "🏢", title: "Trưa văn phòng", sub: "Landmark 81 · T3 · 12:00",
      scenario: { label: "Trưa văn phòng", store_id: 3, daypart: "lunch", dow: 2, holiday: null } },
    { key: "mall-weekend", icon: "🛍️", title: "Tối T7 ở TTTM", sub: "Vincom · T7 · 19:00 · Zinger hết",
      scenario: { label: "Tối T7 TTTM", store_id: 2, daypart: "dinner", dow: 6, holiday: null }, inventory: "zinger_out" },
    { key: "tourist-late", icon: "🌙", title: "Đêm phố Tây", sub: "Bùi Viện · T6 · 22:30",
      scenario: { label: "Đêm phố Tây", store_id: 4, daypart: "late", dow: 5, holiday: null } },
    { key: "holiday-res", icon: "🎉", title: "Lễ 2/9 khu dân cư", sub: "Ng. Văn Trỗi · lễ · tối · dư kem",
      scenario: { label: "Lễ Quốc khánh 2/9", store_id: 1, daypart: "dinner", dow: 3, holiday: "Quốc khánh 2/9" }, inventory: "dessert_over" },
  ];
  const DAYPARTS = { breakfast: "Sáng", lunch: "Trưa", tea: "Xế", dinner: "Tối", late: "Đêm muộn" };

  const drawer = $("#scenario-drawer");
  $("#scenario-btn").addEventListener("click", () => { drawer.hidden = !drawer.hidden; });
  $("#scenario-close").addEventListener("click", () => { drawer.hidden = true; });

  $("#sd-presets").innerHTML = PRESETS.map((p) => `
    <button class="sd-preset" data-key="${p.key}">
      <span class="sdp-icon">${p.icon}</span>
      <span class="sdp-body"><b>${p.title}</b><small>${p.sub}</small></span>
    </button>`).join("");
  $("#sd-daypart").innerHTML = Object.entries(DAYPARTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");

  async function initScenarioControls() {
    try {
      const r = await api("/api/admin/stores");
      $("#sd-store").innerHTML = (r.stores ?? []).map((s) => `<option value="${s.id}">${s.name} (${s.cluster})</option>`).join("");
      const settings = await api("/api/admin/settings");
      if (settings.scenario?.label) $("#scenario-label").textContent = settings.scenario.label;
    } catch (_) { /* controls stay empty until reachable */ }
  }
  initScenarioControls();

  async function applyScenario(scenario, inventoryPreset) {
    await api("/api/admin/scenario", {
      method: "POST",
      body: { scenario, ...(inventoryPreset ? { inventory_preset: inventoryPreset, store_id: scenario?.store_id } : {}) },
    });
    $("#scenario-label").textContent = scenario?.label ?? "Thời gian thực";
    document.querySelector(".dt-header").classList.toggle("scenario-on", !!scenario);
    // the kiosk picks the new context up on its next attract-screen menu load;
    // nudge it now if it's embedded
    const frame = $("#kiosk-frame");
    if (frame) frame.contentWindow.postMessage({ kfcScenario: true }, "*");
    drawer.hidden = true;
  }

  $("#sd-presets").addEventListener("click", (e) => {
    const btn = e.target.closest(".sd-preset");
    if (!btn) return;
    const p = PRESETS.find((x) => x.key === btn.dataset.key);
    applyScenario(p.scenario, p.inventory);
  });
  $("#sd-apply").addEventListener("click", () => {
    applyScenario({
      label: "Kịch bản tùy chỉnh",
      store_id: Number($("#sd-store").value),
      daypart: $("#sd-daypart").value,
      dow: Number($("#sd-dow").value),
      holiday: $("#sd-holiday").checked ? "Ngày lễ (demo)" : null,
    });
  });
  $("#sd-clear").addEventListener("click", () => applyScenario(null));
  drawer.addEventListener("click", (e) => {
    const inv = e.target.closest("[data-inv]");
    if (inv) api("/api/admin/scenario", { method: "POST", body: { inventory_preset: inv.dataset.inv, store_id: Number($("#sd-store").value) || 1 } });
  });

  drawStatic();
})();
