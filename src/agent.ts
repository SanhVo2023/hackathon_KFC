// Conversational ordering agent (P4): the model decides which tools to chain;
// every reply is grounded in D1 tool results. Workers AI (@cf/openai/gpt-oss-120b)
// by default; OpenAI Chat Completions if OPENAI_API_KEY is set.

import { toolDefinitions, executeTool, type UiEffect } from "./tools";
import { type CartLine } from "./recs";
import { Telemetry, vnNow } from "./telemetry";
import { trace } from "./langfuse";

const SYSTEM_PROMPT = `You are "KFC Trợ Lý", the AI ordering assistant on a KFC Vietnam self-service kiosk.

Rules:
- Answer ONLY from tool results. Never invent menu items, prices, or promotions. If a tool returns nothing, say so and offer alternatives.
- When the customer names ANY food or drink, your FIRST action is always search_menu with those keywords. NEVER ask the customer to "provide more details" — search first, then ask at most one short clarifying question if needed.
- Reply in the language of the customer's LAST message (Vietnamese or English). Prices in VND format like "89.000₫".
- Be warm, concise, appetite-driven: 1-3 short sentences plus picks. Never dump raw data.
- PLAIN TEXT ONLY: this renders in a small kiosk chat bubble. No markdown, no tables, no ** or #. Use simple lines and "•" bullets.
- Menu questions → search_menu, present at most 3 best fits.
- ALWAYS attempt exactly ONE upsell after a main item lands in the cart: call recommend_upsell and offer the top pick with its data-driven reason.
- Vouchers → apply_voucher. Loyalty points → check_loyalty (ask for the phone number).
- Confirm before add_to_cart. Only place_order after an explicit "yes, order it" style confirmation. Summarize the order with the order number after placing.
- Complaints, allergies, refunds, anything out of scope → handoff_to_human.
- The current cart is in the first user message metadata; current time-of-day context matters (breakfast/lunch/tea/dinner/late).`;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ModelResult {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

async function callModel(env: Env, messages: ChatMessage[], withTools = true): Promise<ModelResult> {
  if (env.OPENAI_API_KEY) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        messages,
        ...(withTools ? { tools: toolDefinitions } : {}),
        temperature: 0.3,
      }),
    });
    if (!resp.ok) throw new Error(`openai ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as {
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    };
    const msg = data.choices[0].message;
    return {
      content: msg.content,
      toolCalls: (msg.tool_calls ?? []).map((tc) => ({ id: tc.id, name: tc.function.name, arguments: safeJson(tc.function.arguments) })),
    };
  }

  const model = env.WA_MODEL || "@cf/openai/gpt-oss-120b";

  // gpt-oss on Workers AI speaks the OpenAI Responses API: `input` items +
  // flattened function tools; function results go back as function_call_output.
  if (model.includes("gpt-oss")) {
    let instructions = "";
    const input: Record<string, unknown>[] = [];
    for (const m of messages) {
      if (m.role === "system") { instructions = m.content ?? ""; continue; }
      if (m.role === "assistant" && m.tool_calls?.length) {
        if (m.content) input.push({ role: "assistant", content: m.content });
        for (const tc of m.tool_calls) {
          input.push({ type: "function_call", call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments });
        }
        continue;
      }
      if (m.role === "tool") {
        input.push({ type: "function_call_output", call_id: m.tool_call_id, output: m.content ?? "" });
        continue;
      }
      input.push({ role: m.role, content: m.content ?? "" });
    }
    const runInput: Record<string, unknown> = { instructions, input };
    if (withTools) {
      runInput.tools = toolDefinitions.map((t) => ({
        type: "function", name: t.function.name,
        description: t.function.description, parameters: t.function.parameters,
      }));
    }
    const result = (await env.AI.run(model as never, runInput as never)) as {
      output?: { type: string; call_id?: string; name?: string; arguments?: string; content?: { type: string; text?: string }[] }[];
    };
    const toolCalls: ModelResult["toolCalls"] = [];
    let content = "";
    for (const item of result.output ?? []) {
      if (item.type === "function_call" && item.name) {
        toolCalls.push({ id: item.call_id ?? `oss_${toolCalls.length}`, name: item.name, arguments: safeJson(item.arguments ?? "{}") });
      } else if (item.type === "message") {
        content += (item.content ?? []).map((c) => c.text ?? "").join("");
      }
    }
    return { content: content || null, toolCalls };
  }

  // other Workers AI models (llama fallback): chat-completions shape
  const waMessages = messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls?.length) {
      const calls = m.tool_calls.map((tc) => `${tc.function.name}(${tc.function.arguments})`).join(", ");
      return { role: "assistant", content: (m.content ?? "") + `\n[called tools: ${calls}]` };
    }
    if (m.role === "tool") return { role: "tool", content: m.content ?? "" };
    return { role: m.role, content: m.content ?? "" };
  });
  const runInput: Record<string, unknown> = { messages: waMessages, max_tokens: 900 };
  if (withTools) runInput.tools = toolDefinitions.map((t) => t.function);
  const result = (await env.AI.run(model as never, runInput as never)) as {
    response?: string;
    tool_calls?: { name: string; arguments: Record<string, unknown> | string }[];
    choices?: { message: { content: string | null; tool_calls?: { id?: string; function: { name: string; arguments: string } }[] } }[];
  };

  if (result.choices?.length) {
    const msg = result.choices[0].message;
    return {
      content: msg.content,
      toolCalls: (msg.tool_calls ?? []).map((tc, i) => ({
        id: tc.id ?? `wa_${i}`, name: tc.function.name, arguments: safeJson(tc.function.arguments),
      })),
    };
  }
  return {
    content: result.response ?? null,
    toolCalls: (result.tool_calls ?? []).map((tc, i) => ({
      id: `wa_${i}`, name: tc.name,
      arguments: typeof tc.arguments === "string" ? safeJson(tc.arguments) : (tc.arguments ?? {}),
    })),
  };
}

export interface AgentResponse {
  reply: string;
  effects: UiEffect[];
  items: unknown[];
}

export async function runAgent(
  env: Env,
  ctx: ExecutionContext,
  tel: Telemetry,
  sessionId: string,
  history: { role: "user" | "assistant"; content: string }[],
  cart: CartLine[],
): Promise<AgentResponse> {
  const started = Date.now();
  const effects: UiEffect[] = [];
  const surfaced: unknown[] = [];
  const traceSteps: { name: string; input: unknown; output: unknown }[] = [];
  const { daypart } = vnNow();
  const modelName = env.OPENAI_API_KEY ? (env.OPENAI_MODEL || "gpt-4.1-mini") : (env.WA_MODEL || "@cf/openai/gpt-oss-120b");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `[session metadata] current cart: ${JSON.stringify(cart ?? [])} | daypart: ${daypart}` },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  const userMsg = history[history.length - 1]?.content ?? "";
  tel.emit("chat_turn", "kiosk", "agent", `"${userMsg.slice(0, 80)}"`);

  let reply = "";
  for (let step = 0; step < 6; step++) {
    const t0 = Date.now();
    tel.emit("llm_call", "agent", "llm", `step ${step + 1}: ${modelName}`);
    const result = await callModel(env, messages);
    tel.emit("llm_result", "llm", "agent", result.toolCalls.length ? `wants: ${result.toolCalls.map((t) => t.name).join(", ")}` : "final reply", undefined, Date.now() - t0);

    if (!result.toolCalls.length) {
      reply = result.content ?? "";
      break;
    }

    messages.push({
      role: "assistant",
      content: result.content,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const tc of result.toolCalls) {
      const output = await executeTool(env, tel, sessionId, tc.name, tc.arguments, effects, cart);
      traceSteps.push({ name: tc.name, input: tc.arguments, output });
      const o = output as { items?: unknown[]; recommendations?: unknown[] };
      if (Array.isArray(o?.items)) surfaced.push(...o.items);
      if (Array.isArray(o?.recommendations)) surfaced.push(...o.recommendations);
      messages.push({ role: "tool", content: JSON.stringify(output), tool_call_id: tc.id });
    }
  }

  // Forced synthesis if the loop ended tool-hungry.
  if (!reply.trim()) {
    messages.push({
      role: "user",
      content: "Based on the tool results above, write your final reply to the customer now. Reply in the customer's language (Vietnamese or English), warm and concise, referencing the specific items/prices found. Do not call any tools.",
    });
    const t0 = Date.now();
    tel.emit("llm_call", "agent", "llm", "forced synthesis");
    const synth = await callModel(env, messages, false);
    tel.emit("llm_result", "llm", "agent", "synthesized reply", undefined, Date.now() - t0);
    reply = synth.content ?? "";
  }

  // persist transcript so HITL staff can read the conversation
  ctx.waitUntil(env.DB.batch([
    env.DB.prepare("INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)").bind(sessionId, "user", userMsg),
    env.DB.prepare("INSERT INTO chat_messages (session_id, role, content) VALUES (?,?,?)").bind(sessionId, "agent", reply),
  ]));

  tel.emit("trace_flush", "agent", "langfuse", `trace: ${traceSteps.length} tool spans, ${Date.now() - started}ms`, undefined, Date.now() - started);
  ctx.waitUntil(trace(env, {
    sessionId, name: "kfc-ordering-turn", input: userMsg, output: reply,
    steps: traceSteps, latencyMs: Date.now() - started, model: modelName,
  }));

  const seen = new Set<number>();
  const items = (surfaced as { id: number }[]).filter((p) => {
    if (!p?.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).slice(0, 6);

  const dedupedEffects: UiEffect[] = [];
  const addedIds = new Set<number>();
  for (const e of effects) {
    if (e.type === "add_to_cart") {
      const pid = (e.payload as { item?: { id?: number } })?.item?.id;
      if (pid != null) {
        if (addedIds.has(pid)) continue;
        addedIds.add(pid);
      }
    }
    dedupedEffects.push(e);
  }

  return { reply, effects: dedupedEffects, items };
}
