// Generates missing product photos + attract-screen heroes with Gemini.
// Usage:  GEMINI_API_KEY=... node seed/gen-images.mjs
// Writes public/img/gen-<name-slug>.jpg (products) and hero-*.jpg (attract).
// Filenames are NAME SLUGS, not catalog ids — ids shift when the crawl grows.
// The API key is passed via env only — never committed.

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "img");
mkdirSync(outDir, { recursive: true });

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY env var required"); process.exit(1); }

const MENU_STYLE = (p) =>
  `Professional studio product photography for a fast-food menu board: ${p}. Centered composition on a PURE WHITE background, appetizing, natural warm lighting, photorealistic, no text, no watermark, no logo, no people, square format.`;
const HERO_STYLE = (p) =>
  `Dramatic appetizing hero photograph for a fried-chicken restaurant kiosk idle screen: ${p}. Cinematic warm lighting, shallow depth of field, photorealistic, rich deep-red backdrop, no text, no watermark, no logo, no people, PORTRAIT (vertical 3:4) composition.`;

const TASKS = [
  // product shots that survive reseeds (existing gen-*.jpg are skipped)
  { file: "gen-combo-ga-quay-giang-sinh.jpg", prompt: MENU_STYLE("Christmas special combo: a whole golden honey-pepper glazed roast chicken with two boxes of french fries and two cola paper cups, garnished with small pine sprigs and a thin red ribbon for a subtle festive touch") },
  { file: "gen-party-bucket-noel.jpg", prompt: MENU_STYLE("Christmas party feast: a plain red-and-white striped bucket with 10 crispy fried chicken pieces, two large boxes of french fries, a coleslaw cup, four cola paper cups and two strawberry sundae cups, subtle festive pine-and-ribbon styling") },
  // attract-screen heroes
  { file: "hero-attract.jpg", prompt: HERO_STYLE("a plain red-and-white striped bucket overflowing with crispy golden fried chicken pieces, gentle steam rising, a few golden crumbs mid-air") },
  { file: "hero-xmas.jpg", prompt: HERO_STYLE("a plain red-and-white striped bucket overflowing with crispy golden fried chicken, surrounded by pine branches and softly glowing warm fairy-light bokeh, a quiet Christmas evening mood") },
];

const MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-preview-image-generation",
];

async function generate(model, prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error(`${model}: no image in response`);
  return Buffer.from(img.inlineData.data, "base64");
}

let model = null;
let done = 0;
for (const task of TASKS) {
  const out = join(outDir, task.file);
  if (existsSync(out)) { console.log(`${task.file} exists, skip`); done++; continue; }
  let ok = false;
  for (const m of model ? [model] : MODELS) {
    try {
      const buf = await generate(m, task.prompt);
      writeFileSync(out, buf);
      console.log(`✓ ${task.file} (${(buf.length / 1024).toFixed(0)}KB) via ${m}`);
      model = m; ok = true; done++;
      break;
    } catch (err) {
      console.log(`  ${String(err).slice(0, 140)}`);
    }
  }
  if (!ok) console.log(`✗ ${task.file} failed on all models`);
  await new Promise((r) => setTimeout(r, 1200)); // gentle rate limit
}
console.log(`\npresent: ${done}/${TASKS.length} — rerun seed/generate.mjs + reseed to attach product shots`);
