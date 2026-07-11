// Telemetry stream powering the live system diagram and the admin event log.
// Events are collected in-memory during a request and flushed as one batch
// via ctx.waitUntil so the hot path never waits on D1 writes.

export type DiagramNode =
  | "kiosk" | "admin" | "worker" | "rec" | "agent" | "d1" | "llm" | "langfuse" | "staff";

export interface TelemetryEvent {
  session_id: string | null;
  source: string; // kiosk|agent|rec|admin|system
  type: string;
  node_from: DiagramNode | null;
  node_to: DiagramNode | null;
  label: string;
  data?: unknown;
  duration_ms?: number;
}

export class Telemetry {
  private events: TelemetryEvent[] = [];
  constructor(private sessionId: string | null, private source: string) {}

  emit(
    type: string,
    node_from: DiagramNode | null,
    node_to: DiagramNode | null,
    label: string,
    data?: unknown,
    duration_ms?: number,
  ): void {
    this.events.push({ session_id: this.sessionId, source: this.source, type, node_from, node_to, label, data, duration_ms });
  }

  flush(env: Env, ctx: ExecutionContext): void {
    if (!this.events.length) return;
    const stmts = this.events.map((e) =>
      env.DB.prepare(
        "INSERT INTO events (session_id,source,type,node_from,node_to,label,data,duration_ms) VALUES (?,?,?,?,?,?,?,?)",
      ).bind(
        e.session_id, e.source, e.type, e.node_from, e.node_to, e.label,
        e.data === undefined ? null : JSON.stringify(e.data), e.duration_ms ?? null,
      ),
    );
    this.events = [];
    ctx.waitUntil(env.DB.batch(stmts).catch((err) =>
      console.log(JSON.stringify({ level: "warn", msg: "telemetry flush failed", err: String(err) }))));
  }
}

export type Daypart = "breakfast" | "lunch" | "tea" | "dinner" | "late";

// Vietnam is UTC+7; Workers run on UTC.
export function vnNow(): { daypart: Daypart; dow: number; hour: number; iso: string } {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const hour = now.getUTCHours();
  const dow = now.getUTCDay();
  let daypart: Daypart;
  if (hour >= 6 && hour < 11) daypart = "breakfast";
  else if (hour >= 11 && hour < 14) daypart = "lunch";
  else if (hour >= 14 && hour < 17) daypart = "tea";
  else if (hour >= 17 && hour < 21) daypart = "dinner";
  else daypart = "late";
  return { daypart, dow, hour, iso: now.toISOString().replace("Z", "+07:00") };
}

export async function handleTelemetryGet(env: Env, url: URL): Promise<Response> {
  const after = Number(url.searchParams.get("after") ?? 0);
  const rs = await env.DB.prepare(
    "SELECT id,session_id,source,type,node_from,node_to,label,data,duration_ms,created_at FROM events WHERE id > ? ORDER BY id ASC LIMIT 120",
  ).bind(after).all();
  return new Response(JSON.stringify({ events: rs.results, cursor: rs.results.length ? (rs.results[rs.results.length - 1] as { id: number }).id : after }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function getSettings(env: Env): Promise<Record<string, unknown>> {
  const rs = await env.DB.prepare("SELECT key,value FROM settings").all<{ key: string; value: string }>();
  const out: Record<string, unknown> = {};
  for (const row of rs.results) {
    try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
  }
  return out;
}
