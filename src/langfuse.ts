// Minimal Langfuse tracing via the public ingestion API (no SDK weight in the Worker).
// No-ops when keys are absent so the build ships tracing-ready without credentials.

interface TraceInput {
  sessionId: string;
  name: string;
  input: string;
  output: string;
  steps: { name: string; input: unknown; output: unknown }[];
  latencyMs: number;
  model: string;
}

export async function trace(env: Env, t: TraceInput): Promise<void> {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return;
  const host = env.LANGFUSE_HOST || "https://cloud.langfuse.com";
  const traceId = crypto.randomUUID();
  const now = new Date().toISOString();

  const batch: unknown[] = [
    {
      id: crypto.randomUUID(),
      type: "trace-create",
      timestamp: now,
      body: {
        id: traceId,
        sessionId: t.sessionId,
        name: t.name,
        input: t.input,
        output: t.output,
        metadata: { latencyMs: t.latencyMs, model: t.model },
        tags: ["kfc", "kiosk-agent"],
      },
    },
    ...t.steps.map((s) => ({
      id: crypto.randomUUID(),
      type: "span-create",
      timestamp: now,
      body: {
        id: crypto.randomUUID(),
        traceId,
        name: `tool:${s.name}`,
        startTime: now,
        endTime: now,
        input: s.input,
        output: s.output,
      },
    })),
  ];

  try {
    const resp = await fetch(`${host}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + btoa(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`),
      },
      body: JSON.stringify({ batch }),
    });
    if (!resp.ok) {
      console.log(JSON.stringify({ level: "warn", msg: "langfuse ingest failed", status: resp.status }));
    }
  } catch (err) {
    console.log(JSON.stringify({ level: "warn", msg: "langfuse ingest error", err: String(err) }));
  }
}
