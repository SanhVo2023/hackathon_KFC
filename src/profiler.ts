// Customer hypothesis agent: guesses (never assumes) who the customer might be
// and what they probably want — from a coarse camera glance at check-in plus
// every kiosk interaction after it. The output is an 8th signal for the rec
// engine (category_bias) and a live ops-view panel. Privacy-conscious by
// construction: only coarse bands (age band, attire, group), no identity.

import { Telemetry, getContext, getSettings } from "./telemetry";

export interface Profile {
  session_id: string;
  photo_thumb: string | null;
  visual: Record<string, unknown> | null;
  persona: string;
  wants: string;
  category_bias: Record<string, number>;
  evidence: string[];
  confidence: number;
}

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const FAST_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast"; // refinement must feel instant

const CATS = ["combo", "chicken", "burger-rice", "snack", "drink", "dessert"];

function extractJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>; // some WA models return parsed JSON directly
  const match = String(raw ?? "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function cleanBias(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const c of CATS) {
      const v = Number((raw as Record<string, unknown>)[c]);
      if (!Number.isNaN(v)) out[c] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}

export async function getProfile(env: Env, sessionId: string): Promise<Profile | null> {
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE session_id=?").bind(sessionId).first<{
    session_id: string; photo_thumb: string | null; visual: string | null; persona: string;
    wants: string; category_bias: string; evidence: string; confidence: number;
  }>();
  if (!row) return null;
  const parse = (s: string | null, fb: unknown) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
  return {
    session_id: row.session_id, photo_thumb: row.photo_thumb,
    visual: parse(row.visual, null) as Record<string, unknown> | null,
    persona: row.persona ?? "", wants: row.wants ?? "",
    category_bias: cleanBias(parse(row.category_bias, {})),
    evidence: parse(row.evidence, []) as string[],
    confidence: row.confidence ?? 0.3,
  };
}

async function saveProfile(env: Env, p: Profile): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO profiles (session_id, photo_thumb, visual, persona, wants, category_bias, evidence, confidence, updated_at)
     VALUES (?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(session_id) DO UPDATE SET photo_thumb=COALESCE(excluded.photo_thumb, photo_thumb),
       visual=COALESCE(excluded.visual, visual), persona=excluded.persona, wants=excluded.wants,
       category_bias=excluded.category_bias, evidence=excluded.evidence,
       confidence=excluded.confidence, updated_at=datetime('now')`,
  ).bind(
    p.session_id, p.photo_thumb, p.visual ? JSON.stringify(p.visual) : null, p.persona, p.wants,
    JSON.stringify(p.category_bias), JSON.stringify(p.evidence.slice(-10)), p.confidence,
  ).run();
}

function emitProfile(tel: Telemetry, p: Profile, label: string): void {
  tel.emit("profile_updated", "profiler", "rec", label, {
    persona: p.persona, wants: p.wants, category_bias: p.category_bias,
    evidence: p.evidence.slice(-6), confidence: p.confidence,
    visual: p.visual, photo_thumb: p.photo_thumb,
  });
}

// ---------- check-in: one coarse glance from the camera (demo: uploaded) ----------
export async function profileFromPhoto(
  env: Env, tel: Telemetry, sessionId: string, imageDataUrl: string, thumbDataUrl: string | null,
): Promise<Profile> {
  const ctx = await getContext(env);
  const t0 = Date.now();
  tel.emit("llm_call", "profiler", "llm", "vision glance: who might this customer be? (llama-3.2-11b-vision)");

  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const prompt = `You are a privacy-conscious retail assistant at a KFC self-order kiosk in Vietnam. Time context: ${ctx.daypart}${ctx.festive ? ", weekend/holiday" : ", weekday"}.
Look at the customer photo and describe ONLY coarse, non-identifying attributes you can actually see. Never guess identity. If unsure of a field, use "unclear".
Then HYPOTHESIZE (clearly a guess, not a fact) what this person might want at KFC right now.
Return ONLY JSON:
{"age_band":"child|teen|20s|30s|40s|50+|unclear","presentation":"male|female|unclear","attire":"casual|business|sporty|uniform|other","group":"alone|couple|family|friends|unclear","context_notes":"short, e.g. motorbike helmet, shopping bags, with children","persona":"one short hypothesis sentence, e.g. 'Office worker on a quick lunch break'","wants":"one short sentence on what they likely want","category_bias":{"combo":0.0,"chicken":0.0,"burger-rice":0.0,"snack":0.0,"drink":0.0,"dessert":0.0},"confidence":0.0}`;

  let parsed: Record<string, unknown> | null = null;
  const callVision = async (model: string) => (await env.AI.run(model as never, {
    prompt,
    image: [...bytes],
    max_tokens: 400,
  } as never)) as { response?: unknown; description?: unknown };
  try {
    let result;
    try {
      result = await callVision(VISION_MODEL);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("5016")) {
        // Meta license gate: submit the one-time agreement, then retry
        await env.AI.run(VISION_MODEL as never, { prompt: "agree" } as never).catch(() => null);
        tel.emit("llm_call", "profiler", "llm", "vision model license accepted, retrying");
        result = await callVision(VISION_MODEL);
      } else {
        // schema/model hiccup → llava fallback (slower but battle-tested)
        tel.emit("llm_call", "profiler", "llm", "vision fallback: llava-1.5-7b");
        result = await callVision("@cf/llava-hf/llava-1.5-7b-hf");
      }
    }
    parsed = extractJson(result.response ?? result.description);
  } catch (err) {
    tel.emit("llm_error", "llm", "profiler", `vision failed: ${String(err).slice(0, 80)}`);
  }

  const p: Profile = {
    session_id: sessionId,
    photo_thumb: thumbDataUrl,
    visual: parsed ? {
      age_band: parsed.age_band, presentation: parsed.presentation, attire: parsed.attire,
      group: parsed.group, context_notes: parsed.context_notes,
    } : null,
    persona: String(parsed?.persona ?? "Khách mới — chưa đủ dữ kiện, đang quan sát thao tác."),
    wants: String(parsed?.wants ?? "Chưa rõ — sẽ suy đoán từ các lựa chọn trên kiosk."),
    category_bias: cleanBias(parsed?.category_bias),
    evidence: [parsed ? `📷 Ảnh check-in: ${parsed.age_band ?? "?"}, ${parsed.attire ?? "?"}, ${parsed.group ?? "?"}${parsed.context_notes ? ` (${parsed.context_notes})` : ""}` : "📷 Ảnh check-in: không phân tích được"],
    confidence: Math.max(0.2, Math.min(0.7, Number(parsed?.confidence ?? 0.35))),
  };
  await saveProfile(env, p);
  tel.emit("llm_result", "llm", "profiler", `vision glance done → "${p.persona.slice(0, 60)}"`, undefined, Date.now() - t0);
  emitProfile(tel, p, `check-in hypothesis: ${p.persona.slice(0, 70)}`);
  return p;
}

// ---------- refinement: every meaningful kiosk interaction sharpens the guess ----------
export async function refineProfile(
  env: Env, tel: Telemetry, sessionId: string, observation: string,
): Promise<Profile> {
  const ctx = await getContext(env);
  const existing = await getProfile(env, sessionId) ?? {
    session_id: sessionId, photo_thumb: null, visual: null,
    persona: "Khách mới — chưa có ảnh, suy đoán từ thao tác.", wants: "",
    category_bias: {}, evidence: [], confidence: 0.25,
  };
  existing.evidence.push(`🖐 ${observation}`);

  const t0 = Date.now();
  tel.emit("llm_call", "profiler", "llm", `refine hypothesis ← "${observation.slice(0, 60)}" (llama-3.1-8b-fast)`);
  const prompt = `You infer a KFC kiosk customer's likely profile from behavior. Time: ${ctx.daypart}${ctx.festive ? ", weekend/holiday" : ", weekday"}.
Current hypothesis: ${JSON.stringify({ visual: existing.visual, persona: existing.persona, category_bias: existing.category_bias, confidence: existing.confidence })}
Observations so far (newest last): ${JSON.stringify(existing.evidence.slice(-6))}
Rules: a 4+ portion / sharing / bucket order suggests a group or family → desserts and large drinks appeal. A single fast combo at lunch on a weekday suggests a worker in a hurry → drinks, quick add-ons. Late night singles → snacks. Update the hypothesis; RAISE confidence only when evidence agrees. It is a guess — phrase persona as a hypothesis.
CART-AWARENESS (critical): observations may include "cart already holds: ...". category_bias means WHAT TO SUGGEST NEXT, not who they are. Never bias toward what the cart already covers — if it already holds a bucket/combo or a big order, set combo bias near 0 and shift "wants" to what would COMPLETE the meal (dessert to close it, a missing drink, a small side). A full-looking cart may want nothing more — say so.
Return ONLY JSON: {"persona":"one short sentence","wants":"one short sentence","category_bias":{"combo":0.0,"chicken":0.0,"burger-rice":0.0,"snack":0.0,"drink":0.0,"dessert":0.0},"confidence":0.0,"reasoning":"one short sentence"}`;

  let parsed: Record<string, unknown> | null = null;
  try {
    const result = (await env.AI.run(FAST_MODEL as never, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.2,
    } as never)) as { response?: unknown };
    parsed = extractJson(result.response);
  } catch (err) {
    tel.emit("llm_error", "llm", "profiler", `refine failed: ${String(err).slice(0, 80)}`);
  }

  if (parsed) {
    existing.persona = String(parsed.persona ?? existing.persona);
    existing.wants = String(parsed.wants ?? existing.wants);
    const bias = cleanBias(parsed.category_bias);
    if (Object.keys(bias).length) existing.category_bias = bias;
    existing.confidence = Math.max(0.2, Math.min(0.95, Number(parsed.confidence ?? existing.confidence)));
    if (parsed.reasoning) existing.evidence.push(`🧠 ${String(parsed.reasoning).slice(0, 90)}`);
  }
  await saveProfile(env, existing);
  tel.emit("llm_result", "llm", "profiler", `hypothesis → "${existing.persona.slice(0, 60)}" (conf ${(existing.confidence * 100).toFixed(0)}%)`, undefined, Date.now() - t0);
  emitProfile(tel, existing, `refined: ${existing.persona.slice(0, 70)}`);
  return existing;
}
