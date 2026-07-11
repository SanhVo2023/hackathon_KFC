// Generates missing menu-item product photos with Gemini image generation.
// Usage:  GEMINI_API_KEY=... node seed/gen-images.mjs
// Writes public/img/item-<id>.jpg; generate.mjs + a D1 UPDATE pick them up.
// The API key is passed via env only — never committed.

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "img");
mkdirSync(outDir, { recursive: true });

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY env var required"); process.exit(1); }

const ITEMS = [
  { id: 25, prompt: "3 crispy golden fried chicken tenders" },
  { id: 26, prompt: "6 spicy crispy fried chicken hot wings" },
  { id: 31, prompt: "teriyaki glazed chicken fillet on white rice in a bowl" },
  { id: 33, prompt: "hot chicken and sweet corn soup in a small paper cup" },
  { id: 38, prompt: "orange Mirinda soft drink in a branded-free paper cup with ice" },
  { id: 39, prompt: "iced lemon tea with chia seeds in a clear plastic cup" },
  { id: 41, prompt: "a 500ml bottle of still water, plain label" },
  { id: 42, prompt: "strawberry sundae soft-serve ice cream in a cup with strawberry syrup" },
  { id: 45, prompt: "combo meal: crispy chicken burger, box of french fries and a cola paper cup" },
  { id: 47, prompt: "family feast: red-and-white striped bucket of 8 fried chicken pieces with 2 large fries, coleslaw salad and 4 cola cups" },
];

const MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-preview-image-generation",
];

async function generate(model, prompt) {
  const body = {
    contents: [{ parts: [{ text: `Professional studio product photography for a fast-food menu board: ${prompt}. Centered composition on a PURE WHITE background, appetizing, natural warm lighting, photorealistic, no text, no watermark, no logo, no people, square format.` }] }],
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
const done = [];
for (const item of ITEMS) {
  const out = join(outDir, `item-${item.id}.jpg`);
  if (existsSync(out)) { console.log(`item-${item.id} exists, skip`); done.push(item.id); continue; }
  let ok = false;
  for (const m of model ? [model] : MODELS) {
    try {
      const buf = await generate(m, item.prompt);
      writeFileSync(out, buf);
      console.log(`✓ item-${item.id}.jpg (${(buf.length / 1024).toFixed(0)}KB) via ${m}`);
      model = m; ok = true; done.push(item.id);
      break;
    } catch (err) {
      console.log(`  ${String(err).slice(0, 140)}`);
    }
  }
  if (!ok) console.log(`✗ item-${item.id} failed on all models`);
  await new Promise((r) => setTimeout(r, 1200)); // gentle rate limit
}
console.log(`\ngenerated/present: ${done.length}/${ITEMS.length}`);
console.log("SQL to apply:\n" + done.map((id) => `UPDATE menu_items SET image_url='/img/item-${id}.jpg' WHERE id=${id};`).join("\n"));
