// Bindings + optional secrets (set via `wrangler secret put`) so the code
// typechecks without hand-written drift.
interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  WA_MODEL?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_HOST?: string;
}
