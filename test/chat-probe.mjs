// Quick agent reliability probe: N chat turns, measure tool use, language, latency.
const BASE = process.argv[2] || "http://127.0.0.1:8787";
const CASES = [
  "Cho mình 1 combo gà rán và 1 pepsi, thêm vào giỏ luôn nhé",
  "Có khuyến mãi gì tối nay không?",
  "What's good for 2 people under 200k?",
  "Kiểm tra điểm giúp mình, sđt 0901234567",
];
async function latestCursor() {
  let cursor = 0;
  for (let i = 0; i < 60; i++) {
    const out = await (await fetch(`${BASE}/api/telemetry?after=${cursor}`)).json();
    if (!out.events?.length) break;
    cursor = out.cursor;
  }
  return cursor;
}

for (const msg of CASES) {
  const session = "probe-" + Math.random().toString(36).slice(2, 8);
  const cursor = await latestCursor();
  const t0 = Date.now();
  const res = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-id": session },
    body: JSON.stringify({ session_id: session, messages: [{ role: "user", content: msg }], cart: [] }),
  });
  const out = await res.json();
  const ms = Date.now() - t0;
  const tel = await (await fetch(`${BASE}/api/telemetry?after=${cursor}`)).json();
  const tools = tel.events.filter((e) => e.type === "tool_call" && e.session_id === session).map((e) => (e.label ?? "").split("(")[0]);
  console.log(`\n[${ms}ms] "${msg}"`);
  console.log(`  tools: ${tools.join(", ") || "NONE"}`);
  console.log(`  effects: ${(out.effects ?? []).map((e) => e.type).join(", ") || "-"}`);
  console.log(`  reply: ${(out.reply ?? "").slice(0, 160).replace(/\n/g, " ")}`);
}
