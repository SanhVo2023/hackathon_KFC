// Builds seed/seed.sql for the kfc-catalog D1 database.
// Menu = TinyFish crawl of kfcvietnam.com.vn (real items/prices/images) merged
// with a curated catalog that fills category gaps. Everything operational
// (POS history, promos, affinities, loyalty, staff) is synthetic — allowed by
// the hackathon rules ("data must be crawled or synthetic").
//
// Usage: node seed/generate.mjs   -> writes seed/seed.sql

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// ---------- deterministic rng so reseeding is stable ----------
let seedState = 20260711;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function weightedPick(entries) { // [[value, weight], ...]
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) { r -= w; if (r <= 0) return v; }
  return entries[entries.length - 1][0];
}

function fold(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}
const esc = (s) => (s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);

// ---------- 1. load crawl ----------
function loadCrawl() {
  const p = join(here, "crawl-menu.json");
  if (!existsSync(p)) return [];
  let raw = readFileSync(p, "utf8");
  // repair double-encoded UTF-8 if the console mangled it (Ã + continuation pattern)
  if ((raw.match(/Ã[-¿ -ÿ]/g) || []).length > 20) {
    raw = Buffer.from(raw, "latin1").toString("utf8");
  }
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith('{"status"'));
  if (!line) return [];
  try {
    const parsed = JSON.parse(line);
    if (parsed.status !== "COMPLETED") return [];
    return parsed.result?.items ?? [];
  } catch { return []; }
}

const CAT_MAP = [
  [/uu dai|combo|xo /, "combo"],
  [/ga ran|ga quay|mieng ga|tenders|canh ga|dui ga/, "chicken"],
  [/burger|com |mi y|pasta|rice/, "burger-rice"],
  [/thuc an nhe|khoai|salad|pho mai|sup/, "snack"],
  [/trang mieng|banh trung|kem/, "dessert"],
  [/thuc uong|pepsi|7up|mirinda|tra |nuoc/, "drink"],
];
function mapCategory(rawCat, name, desc) {
  const hay = fold(`${rawCat} ${name} ${desc ?? ""}`);
  // name-based signals beat the site's marketing buckets ("Ưu Đãi", "Món Mới")
  if (/^(1|2|3|\d+) mieng ga|ga lac|ga xot|phi-le|tenders/.test(fold(name))) return "chicken";
  if (/burger|com ga|mi y/.test(fold(name))) return "burger-rice";
  if (/khoai|salad|pho mai vien|sup/.test(fold(name))) return "snack";
  if (/banh trung|kem /.test(fold(name))) return "dessert";
  if (/pepsi|7up|mirinda|aquafina|tra|lipton/.test(fold(name))) return "drink";
  if (/xo |combo/.test(fold(name))) return "combo";
  for (const [re, cat] of CAT_MAP) if (re.test(hay)) return cat;
  return "snack";
}
const parsePrice = (s) => parseInt(String(s).replace(/[^\d]/g, ""), 10) || 0;

// ---------- 2. curated catalog (fills gaps; skipped when crawl has same folded name) ----------
const SIZE_MOD = JSON.stringify([{ group: "Kích cỡ", group_en: "Size", options: [
  { name: "Vừa", name_en: "Regular", delta: 0 }, { name: "Lớn", name_en: "Large", delta: 10000 }] }]);
const SPICE_MOD = JSON.stringify([{ group: "Vị", group_en: "Flavor", options: [
  { name: "Cay", name_en: "Spicy", delta: 0 }, { name: "Không cay", name_en: "Original", delta: 0 }] }]);

const CURATED = [
  // chicken
  { name: "2 Miếng Gà Rán", name_en: "2 pc Fried Chicken", category: "chicken", price: 72000, description: "2 Miếng Gà Rán + 1 Gói tương", tags: ["lunch", "dinner"], modifiers: SPICE_MOD, pop: 0.95, margin: 34 },
  { name: "3 Miếng Gà Rán", name_en: "3 pc Fried Chicken", category: "chicken", price: 105000, description: "3 Miếng Gà Rán + 2 Gói tương", tags: ["dinner", "sharing"], modifiers: SPICE_MOD, pop: 0.8, margin: 34 },
  { name: "3 Gà Miếng Tenders", name_en: "3 pc Chicken Tenders", category: "chicken", price: 48000, description: "3 miếng gà phi-lê tẩm bột chiên giòn", tags: ["lunch", "tea", "late"], pop: 0.6, margin: 38 },
  { name: "6 Cánh Gà Hot Wings", name_en: "6 pc Hot Wings", category: "chicken", price: 69000, description: "6 cánh gà cay giòn", tags: ["dinner", "late", "sharing"], pop: 0.7, margin: 36 },
  { name: "Gà Popcorn (Vừa)", name_en: "Popcorn Chicken (R)", category: "chicken", price: 37000, description: "Gà viên popcorn giòn rụm", tags: ["tea", "late"], modifiers: SIZE_MOD, pop: 0.65, margin: 40 },
  // burgers & rice
  { name: "Burger Zinger", name_en: "Zinger Burger", category: "burger-rice", price: 54000, description: "Burger gà giòn cay sốt mayonnaise", tags: ["lunch", "dinner"], pop: 0.9, margin: 32 },
  { name: "Burger Tôm", name_en: "Shrimp Burger", category: "burger-rice", price: 49000, description: "Burger tôm sốt đặc biệt", tags: ["lunch"], pop: 0.55, margin: 30 },
  { name: "Cơm Gà Xối Mỡ", name_en: "Crispy Chicken Rice", category: "burger-rice", price: 52000, description: "Cơm gà xối mỡ giòn + súp", tags: ["lunch"], pop: 0.75, margin: 28 },
  { name: "Cơm Gà Teriyaki", name_en: "Teriyaki Chicken Rice", category: "burger-rice", price: 55000, description: "Cơm phi-lê gà sốt teriyaki", tags: ["lunch"], pop: 0.5, margin: 28 },
  // snacks
  { name: "Khoai Tây Chiên (Lớn)", name_en: "French Fries (L)", category: "snack", price: 30000, description: "Khoai tây chiên giòn phần lớn", tags: ["lunch", "dinner", "tea", "late"], pop: 0.85, margin: 45 },
  { name: "Súp Gà Ngô Ngọt", name_en: "Chicken Corn Soup", category: "snack", price: 18000, description: "Súp gà ngô ngọt nóng", tags: ["breakfast", "lunch", "hot"], pop: 0.4, margin: 42 },
  { name: "Salad Bắp Cải", name_en: "Coleslaw", category: "snack", price: 18000, description: "Salad bắp cải trộn sốt", tags: ["lunch", "dinner"], pop: 0.5, margin: 48 },
  { name: "Phô Mai Que (3)", name_en: "3 Cheese Sticks", category: "snack", price: 33000, description: "3 phô mai que chiên xù kéo sợi", tags: ["tea", "late"], pop: 0.6, margin: 44 },
  // drinks
  { name: "Pepsi (Vừa)", name_en: "Pepsi (R)", category: "drink", price: 15000, description: "Pepsi tươi mát ly vừa", tags: ["lunch", "dinner", "tea", "late", "cold"], modifiers: SIZE_MOD, pop: 0.95, margin: 60 },
  { name: "7Up (Vừa)", name_en: "7Up (R)", category: "drink", price: 15000, description: "7Up chanh mát lạnh", tags: ["lunch", "dinner", "tea", "cold"], modifiers: SIZE_MOD, pop: 0.6, margin: 60 },
  { name: "Mirinda Cam (Vừa)", name_en: "Mirinda Orange (R)", category: "drink", price: 15000, description: "Mirinda vị cam", tags: ["tea", "cold"], modifiers: SIZE_MOD, pop: 0.5, margin: 60 },
  { name: "Trà Chanh Hạt Chia", name_en: "Chia Lemon Tea", category: "drink", price: 25000, description: "Trà chanh hạt chia mát lạnh", tags: ["tea", "breakfast", "cold"], pop: 0.55, margin: 55 },
  { name: "Cà Phê Sữa Đá", name_en: "Vietnamese Iced Coffee", category: "drink", price: 29000, description: "Cà phê sữa đá đậm vị", tags: ["breakfast", "hot"], pop: 0.45, margin: 55 },
  { name: "Aquafina 500ml", name_en: "Aquafina Water", category: "drink", price: 12000, description: "Nước suối Aquafina", tags: ["lunch", "dinner", "cold"], pop: 0.35, margin: 65 },
  // desserts
  { name: "Kem Sundae Dâu", name_en: "Strawberry Sundae", category: "dessert", price: 15000, description: "Kem tươi sốt dâu", tags: ["tea", "late", "sweet", "cold"], pop: 0.6, margin: 50 },
  { name: "Kem Ốc Quế", name_en: "Ice Cream Cone", category: "dessert", price: 8000, description: "Kem ốc quế vani", tags: ["tea", "late", "sweet", "cold"], pop: 0.7, margin: 52 },
  { name: "2 Bánh Trứng", name_en: "2 Egg Tarts", category: "dessert", price: 38000, description: "2 bánh trứng nướng thơm béo", tags: ["breakfast", "tea", "sweet"], pop: 0.65, margin: 46 },
  // combos
  { name: "Combo Zinger Solo", name_en: "Zinger Solo Combo", category: "combo", price: 79000, description: "1 Burger Zinger + 1 Khoai tây chiên (Vừa) + 1 Pepsi (Vừa)", tags: ["lunch", "dinner"], pop: 0.8, margin: 30 },
  { name: "Combo 2 Miếng Gà", name_en: "2 pc Chicken Combo", category: "combo", price: 89000, description: "2 Miếng gà + 1 Khoai tây chiên (Vừa) + 1 Pepsi (Vừa)", tags: ["lunch", "dinner"], pop: 0.85, margin: 30 },
  { name: "Xô Gia Đình 329K", name_en: "Family Bucket 329K", category: "combo", price: 329000, description: "8 Miếng gà + 2 Khoai lớn + 1 Salad + 4 Pepsi", tags: ["dinner", "sharing"], pop: 0.75, margin: 28 },
  { name: "Combo Ăn Xế 45K", name_en: "Tea Break Combo 45K", category: "combo", price: 45000, description: "1 Gà Popcorn (Vừa) + 1 Pepsi (Vừa)", tags: ["tea", "late"], pop: 0.55, margin: 35 },
];

// ---------- build merged catalog ----------
const crawlItems = loadCrawl();
console.log(`crawl items: ${crawlItems.length}`);

const catalog = [];
const seen = new Set();
let nextId = 1;

for (const it of crawlItems) {
  const key = fold(it.name);
  if (seen.has(key) || !parsePrice(it.price)) continue;
  seen.add(key);
  const cat = mapCategory(it.category, it.name, it.description);
  const isCombo = cat === "combo";
  catalog.push({
    id: nextId++, name: it.name.trim(), name_en: it.name_en, category: cat,
    description: it.description, price: parsePrice(it.price), image_url: it.image_url,
    is_combo: isCombo ? 1 : 0,
    modifiers: null,
    tags: JSON.stringify(guessTags(cat, it.name, it.description)),
    pop: 0.5 + rand() * 0.45, margin: cat === "drink" ? 60 : cat === "snack" ? 45 : isCombo ? 29 : 33,
    source: "tinyfish-crawl",
  });
}
for (const it of CURATED) {
  const key = fold(it.name);
  if (seen.has(key)) continue;
  seen.add(key);
  catalog.push({
    id: nextId++, name: it.name, name_en: it.name_en, category: it.category,
    description: it.description, price: it.price, image_url: it.image_url ?? null,
    is_combo: it.category === "combo" ? 1 : 0,
    modifiers: it.modifiers ?? null,
    tags: JSON.stringify(it.tags), pop: it.pop, margin: it.margin,
    source: "curated",
  });
}

function guessTags(cat, name, desc) {
  const hay = fold(`${name} ${desc ?? ""}`);
  const tags = [];
  if (cat === "combo") tags.push(/xo|nhom|gia dinh|4 mieng|8 mieng/.test(hay) ? "sharing" : "single");
  if (cat === "combo" || cat === "burger-rice" || cat === "chicken") tags.push("lunch", "dinner");
  if (cat === "snack") tags.push("tea", "late", "lunch");
  if (cat === "drink") tags.push("lunch", "dinner", "tea", "cold");
  if (cat === "dessert") tags.push("tea", "late", "sweet");
  if (/cay|hot|tieu/.test(hay)) tags.push("spicy");
  if (/xo |nhom|gia dinh/.test(hay)) tags.push("sharing");
  return [...new Set(tags)];
}

console.log(`catalog total: ${catalog.length}`);

// ---------- 3. promotions (daypart/dow aware) ----------
const PROMOS = [
  { code: "TRUAVUI", name: "Trưa Vui Vẻ -10%", description: "Giảm 10% cho đơn từ 80.000₫ vào buổi trưa (11h-14h)", kind: "percent", value: 10, daypart: "lunch", min_order: 80000 },
  { code: "XECHIEU", name: "Xế Chiều 39K", description: "Snack + Pepsi chỉ 39.000₫ khung 14h-17h", kind: "combo_price", value: 39000, daypart: "tea", min_order: 0 },
  { code: "TOIGANKET", name: "Tối Gắn Kết -25K", description: "Giảm 25.000₫ cho đơn nhóm từ 250.000₫ sau 17h", kind: "amount", value: 25000, daypart: "dinner", min_order: 250000 },
  { code: "CUOITUAN", name: "Cuối Tuần Xô Vui", description: "Giảm 15% các món xô/combo nhóm Thứ 7 & CN", kind: "percent", value: 15, scope_category: "combo", days_of_week: "0,6", min_order: 150000 },
  { code: "DEMMUON", name: "Đêm Muộn Freeship Vị Giác", description: "Giảm 10.000₫ đơn sau 21h", kind: "amount", value: 10000, daypart: "late", min_order: 60000 },
  { code: "SINHNHAT50", name: "KFC 50 Năm -50K", description: "Giảm 50.000₫ cho đơn từ 300.000₫ - mừng sinh nhật KFC", kind: "amount", value: 50000, min_order: 300000 },
];

// ---------- 4. affinities ----------
const AFFINITIES = [
  ["chicken", "drink", 1.0, "Gà rán mặn giòn — 78% khách gọi kèm nước"],
  ["chicken", "snack", 0.8, "Khoai/salad cân bằng bữa gà"],
  ["burger-rice", "drink", 1.0, "Burger/cơm luôn cần nước giải khát"],
  ["burger-rice", "snack", 0.6, "Thêm khoai cho đủ bữa"],
  ["combo", "dessert", 0.7, "Tráng miệng ngọt khép bữa combo"],
  ["snack", "drink", 0.8, "Ăn vặt + nước là cặp bài trùng giờ xế"],
  ["chicken", "dessert", 0.5, "Kem mát sau vị cay giòn"],
  ["drink", "dessert", 0.4, "Ngọt mát đi cùng nhau"],
];

// ---------- 4b. stores & clusters ----------
// Site situation differs per store; the engine keys co-occurrence and
// popularity by cluster so each kiosk is tailored to its store's reality.
const STORES = [
  { id: 1, name: "KFC Nguyễn Văn Trỗi", district: "Q. Phú Nhuận", cluster: "residential" },
  { id: 2, name: "KFC Vincom Đồng Khởi", district: "Q.1 (TTTM)", cluster: "mall" },
  { id: 3, name: "KFC Landmark 81", district: "Bình Thạnh (VP)", cluster: "office" },
  { id: 4, name: "KFC Bùi Viện", district: "Q.1 (phố Tây)", cluster: "tourist" },
  { id: 5, name: "KFC Aeon Tân Phú", district: "Tân Phú (TTTM)", cluster: "mall" },
  { id: 6, name: "KFC Phú Mỹ Hưng", district: "Q.7", cluster: "residential" },
];
const CLUSTERS = ["mall", "office", "residential", "tourist"];

// how each cluster's crowd orders differently
const CLUSTER_DAYPART = {
  office:      { breakfast: 12, lunch: 45, tea: 18, dinner: 17, late: 8 },
  mall:        { breakfast: 4,  lunch: 26, tea: 22, dinner: 38, late: 10 },
  residential: { breakfast: 5,  lunch: 22, tea: 12, dinner: 46, late: 15 },
  tourist:     { breakfast: 8,  lunch: 22, tea: 20, dinner: 28, late: 22 },
};
function clusterBias(cluster, item) {
  const tags = JSON.parse(item.tags ?? "[]");
  const sharing = tags.includes("sharing");
  switch (cluster) {
    case "office":
      return (item.category === "burger-rice" ? 1.8 : 1) * (sharing ? 0.35 : 1) * (item.category === "combo" && !sharing ? 1.5 : 1);
    case "mall":
      return (sharing ? 1.9 : 1) * (item.category === "dessert" ? 1.6 : 1) * (item.category === "snack" ? 1.25 : 1);
    case "residential":
      return (sharing ? 1.6 : 1) * (item.category === "chicken" ? 1.45 : 1);
    case "tourist":
      return (item.category === "dessert" ? 1.5 : 1) * (item.category === "drink" ? 1.4 : 1) * (item.category === "snack" ? 1.4 : 1) * (sharing ? 0.85 : 1);
    default: return 1;
  }
}

const HOLIDAYS = [
  ["2026-07-27", "Ngày Thương binh Liệt sĩ (weekend-level traffic)"],
  ["2026-09-02", "Quốc khánh 2/9"],
  ["2026-09-03", "Nghỉ lễ Quốc khánh"],
];

// ---------- 5. synthetic POS history -> co-occurrence pairs ----------
const byCat = (c) => catalog.filter((i) => i.category === c);
const withTag = (arr, t) => arr.filter((i) => JSON.parse(i.tags).includes(t));
function samplePop(arr) {
  if (!arr.length) return null;
  const entries = arr.map((i) => [i, i.pop]);
  return weightedPick(entries);
}

const DAYPART_HOURS = { breakfast: [7, 10], lunch: [11, 14], tea: [14, 17], dinner: [17, 21], late: [21, 23] };
// archetype: slots of category picks per daypart
const ARCHETYPES = {
  breakfast: [[["dessert", "drink"], 3], [["snack", "drink"], 2]],
  lunch: [[["combo"], 5], [["burger-rice", "drink"], 4], [["chicken", "snack", "drink"], 3], [["burger-rice", "drink", "snack"], 2]],
  tea: [[["snack", "drink"], 5], [["dessert", "drink"], 3], [["chicken", "drink"], 2]],
  dinner: [[["combo"], 5], [["combo", "dessert"], 3], [["chicken", "chicken", "snack", "drink"], 3], [["chicken", "drink"], 2]],
  late: [[["snack", "drink"], 4], [["chicken", "drink"], 3], [["dessert"], 1]],
};
const DAYPART_WEIGHT = { breakfast: 5, lunch: 30, tea: 15, dinner: 38, late: 12 };

function samplePopBiased(arr, cluster) {
  if (!arr.length) return null;
  return weightedPick(arr.map((i) => [i, i.pop * clusterBias(cluster, i)]));
}

const posOrders = [];
const pairCountsC = new Map();   // `${cluster}|${a}|${b}|${daypart}` -> cnt
const popCounts = new Map();     // `${cluster}|${item}|${daypart}` -> baskets containing item
const basketTotals = new Map();  // `${cluster}|${daypart}` -> baskets
const globalItemCount = new Map();
const start = new Date("2026-04-12T00:00:00Z");
for (let n = 0; n < 9000; n++) {
  const store = pick(STORES);
  const cluster = store.cluster;
  const daysAgo = Math.floor(rand() * 90);
  const d = new Date(start.getTime() + daysAgo * 86400000);
  let dow = d.getUTCDay();
  // weekends busier (malls especially): resample weekday->weekend
  if (rand() < (cluster === "mall" ? 0.35 : 0.25)) { dow = pick([0, 6]); }
  const daypart = weightedPick(Object.entries(CLUSTER_DAYPART[cluster]));
  const [h0, h1] = DAYPART_HOURS[daypart];
  const hour = h0 + Math.floor(rand() * (h1 - h0));
  const slots = weightedPick(ARCHETYPES[daypart]);
  const chosen = new Map();
  for (const cat of slots) {
    const pool = daypart === "breakfast" || daypart === "tea" ? (withTag(byCat(cat), daypart).length ? withTag(byCat(cat), daypart) : byCat(cat)) : byCat(cat);
    const item = samplePopBiased(pool, cluster);
    if (item) chosen.set(item.id, (chosen.get(item.id) ?? 0) + 1);
  }
  // weekend family effect: sharing add-on for mall/residential dinners
  if ((dow === 0 || dow === 6) && ["mall", "residential"].includes(cluster) && daypart === "dinner" && rand() < 0.3) {
    const item = samplePopBiased(byCat("dessert"), cluster);
    if (item) chosen.set(item.id, (chosen.get(item.id) ?? 0) + 1);
  }
  // 10% noise: one random extra item
  if (rand() < 0.1) { const item = pick(catalog); chosen.set(item.id, (chosen.get(item.id) ?? 0) + 1); }
  if (!chosen.size) continue;
  const items = [...chosen.entries()].map(([item_id, qty]) => ({ item_id, qty }));
  const total = items.reduce((s, it) => s + (catalog.find((c) => c.id === it.item_id)?.price ?? 0) * it.qty, 0);
  const ts = `${d.toISOString().slice(0, 10)} ${String(hour).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}:00`;
  posOrders.push({ ordered_at: ts, daypart, dow, store_id: store.id, items: JSON.stringify(items), total });

  basketTotals.set(`${cluster}|${daypart}`, (basketTotals.get(`${cluster}|${daypart}`) ?? 0) + 1);
  const ids = [...chosen.keys()];
  for (const id of ids) {
    popCounts.set(`${cluster}|${id}|${daypart}`, (popCounts.get(`${cluster}|${id}|${daypart}`) ?? 0) + 1);
    globalItemCount.set(id, (globalItemCount.get(id) ?? 0) + 1);
  }
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
    if (i === j) continue;
    const k = `${cluster}|${ids[i]}|${ids[j]}|${daypart}`;
    pairCountsC.set(k, (pairCountsC.get(k) ?? 0) + 1);
  }
}
// popularity is now DERIVED from POS frequency, not invented
const maxCount = Math.max(...globalItemCount.values());
for (const item of catalog) {
  item.pop = +(0.05 + 0.9 * ((globalItemCount.get(item.id) ?? 0) / maxCount)).toFixed(2);
}
console.log(`pos orders: ${posOrders.length}, cluster pairs: ${pairCountsC.size}, pop entries: ${popCounts.size}`);

// ---------- 5b. per-store inventory ----------
// stock vs par tells the engine what to push (overstock) and protect (low).
const inventory = [];
for (const store of STORES) {
  for (const item of catalog) {
    const par = 30 + Math.floor(item.pop * 50);
    let stock = Math.max(0, Math.round(par * (0.4 + rand() * 1.3)));
    inventory.push({ store_id: store.id, item_id: item.id, stock, par, available: 1 });
  }
}
// narrative cases for the demo
const zinger = catalog.find((i) => fold(i.name).includes("burger zinger") && !i.is_combo);
const eggTart = catalog.find((i) => fold(i.name).includes("banh trung"));
const pepsiCan = catalog.find((i) => fold(i.name).includes("pepsi (lon)"));
for (const inv of inventory) {
  if (zinger && inv.store_id === 2 && inv.item_id === zinger.id) { inv.stock = 0; }            // mall store 86'd Zinger
  if (eggTart && inv.store_id === 1 && inv.item_id === eggTart.id) { inv.stock = inv.par * 3; } // overstock: push egg tarts
  if (pepsiCan && inv.store_id === 3 && inv.item_id === pepsiCan.id) { inv.stock = 4; }         // office store nearly out
}

// ---------- 6. loyalty, staff, settings ----------
const LOYALTY = [
  ["0901234567", "Nguyễn Minh Anh", 1250, "gold"],
  ["0912345678", "Trần Văn Bình", 480, "silver"],
  ["0923456789", "Lê Thị Chi", 120, "member"],
  ["0934567890", "Phạm Quốc Đạt", 2890, "gold"],
  ["0945678901", "Sanh Võ", 760, "silver"],
];
const STAFF = [
  ["Ngọc Trâm", "cs", 1],
  ["Hữu Phước", "cs", 1],
  ["Thanh Hằng", "sales", 1],
  ["Quản lý Ca", "manager", 0],
];
const SETTINGS = {
  signals: { cooccurrence: true, affinity: true, daypart: true, promo: true, inventory: true, margin: true, popularity: true },
  weights: { cooccurrence: 0.3, affinity: 0.15, daypart: 0.15, promo: 0.15, inventory: 0.1, margin: 0.1, popularity: 0.05 },
  rec_slots: 3,
  llm_pitch: true,
  model: "workers-ai",
  current_store: 1,
  languages: ["vi", "en"],
};

// ---------- 6b. baseline live-system data: today's orders + rec funnel ----------
// Makes the admin metrics tell the P2 story from the first minute of the demo:
// orders WITH accepted AI recs have a visibly higher AOV than those without.
const baselineOrders = [];
const baselineRecEvents = [];
const drinkSnackDessert = catalog.filter((i) => ["drink", "snack", "dessert"].includes(i.category));
const mains = catalog.filter((i) => ["combo", "chicken", "burger-rice"].includes(i.category));
// 1) identical base-order distribution for every order
const bases = [];
for (let n = 0; n < 120; n++) {
  const main = samplePop(mains);
  const items = [{ id: main.id, name: main.name, price: main.price, quantity: 1 + (rand() < 0.3 ? 1 : 0) }];
  if (rand() < 0.25) {
    const extra = samplePop(drinkSnackDessert);
    items.push({ id: extra.id, name: extra.name, price: extra.price, quantity: 1 });
  }
  bases.push({ main, items, base: items.reduce((s, i) => s + i.price * i.quantity, 0) });
}
// 2) stratified with/without assignment: sort by base value, alternate within
//    pairs, so the two groups have matched bases and the AI addon is the ONLY
//    difference — an honest AOV counterfactual
bases.sort((a, b) => a.base - b.base);
bases.forEach((b, i) => { b.withRec = (i % 2 === 0) === (Math.floor(i / 2) % 2 === 0); });

bases.forEach((b, n) => {
  const hoursAgo = rand() * 7;
  const ts = `datetime('now', '-${(hoursAgo * 60).toFixed(0)} minutes')`;
  const items = [...b.items];
  let recAttributed = 0;
  if (b.withRec) {
    // accepted addons skew cheap (drinks/desserts) — keeps the AOV uplift in
    // the credible 12-16% band KFC itself projects, not a fantasy number
    const pool = drinkSnackDessert.filter((i) => i.price <= 25000 && !items.some((x) => x.id === i.id));
    const addon = samplePop(pool);
    items.push({ id: addon.id, name: addon.name, price: addon.price, quantity: 1 });
    recAttributed = addon.price;
    if (rand() < 0.15) {
      const addon2 = samplePop(pool.filter((i) => i.id !== addon.id));
      items.push({ id: addon2.id, name: addon2.name, price: addon2.price, quantity: 1 });
      recAttributed += addon2.price;
    }
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const channel = rand() < 0.85 ? "kiosk" : "chat";
  const status = hoursAgo > 1 ? "completed" : pick(["received", "preparing", "ready", "completed"]);
  baselineOrders.push({ ts, channel, items, subtotal, recAttributed, status });

  const sid = `demo-${n}`;
  baselineRecEvents.push({ sid, trigger: "item_added", anchor: [b.main.id], shown: drinkSnackDessert.slice(0, 3).map((i) => i.id), accepted: b.withRec ? items[items.length - 1].id : null, ts });
  if (rand() < 0.6) {
    baselineRecEvents.push({ sid, trigger: "cart_review", anchor: items.map((i) => i.id), shown: drinkSnackDessert.slice(2, 5).map((i) => i.id), accepted: b.withRec && rand() < 0.3 ? items[items.length - 1].id : null, ts });
  }
});

// ---------- 7. emit SQL ----------
const lines = [
  "-- generated by seed/generate.mjs — re-runnable",
  "DELETE FROM menu_items; DELETE FROM promotions; DELETE FROM affinities;",
  "DELETE FROM pos_orders; DELETE FROM item_pairs; DELETE FROM loyalty_members;",
  "DELETE FROM staff; DELETE FROM settings;",
  "DELETE FROM orders; DELETE FROM rec_events;",
  "DELETE FROM stores; DELETE FROM store_inventory; DELETE FROM item_pairs_c;",
  "DELETE FROM item_popularity; DELETE FROM holidays;",
];

for (const i of catalog) {
  const keywords = fold(`${i.name} ${i.name_en ?? ""} ${i.description ?? ""} ${i.category}`);
  lines.push(
    `INSERT INTO menu_items (id,sku,name,name_en,category,description,price,image_url,is_combo,combo_contents,modifiers,tags,keywords,available,margin_pct,popularity) VALUES (` +
    `${i.id},${esc("KFC-" + String(i.id).padStart(3, "0"))},${esc(i.name)},${esc(i.name_en)},${esc(i.category)},${esc(i.description)},${i.price},${esc(i.image_url)},${i.is_combo},NULL,${esc(i.modifiers)},${esc(i.tags)},${esc(keywords)},1,${i.margin},${i.pop.toFixed(2)});`,
  );
}
for (const p of PROMOS) {
  lines.push(
    `INSERT INTO promotions (code,name,description,kind,value,item_id,scope_category,daypart,days_of_week,min_order,active) VALUES (` +
    `${esc(p.code)},${esc(p.name)},${esc(p.description)},${esc(p.kind)},${p.value},NULL,${esc(p.scope_category)},${esc(p.daypart)},${esc(p.days_of_week)},${p.min_order},1);`,
  );
}
for (const [a, b, w, r] of AFFINITIES) {
  lines.push(`INSERT INTO affinities (anchor_category,addon_category,weight,reason) VALUES (${esc(a)},${esc(b)},${w},${esc(r)});`);
}
// batch pos_orders as multi-row inserts (keep statements < ~50 rows for D1)
for (let i = 0; i < posOrders.length; i += 50) {
  const chunk = posOrders.slice(i, i + 50).map((o) =>
    `(${esc(o.ordered_at)},${esc(o.daypart)},${o.dow},${o.store_id},${esc(o.items)},${o.total})`);
  lines.push(`INSERT INTO pos_orders (ordered_at,daypart,dow,store_id,items,total) VALUES ${chunk.join(",")};`);
}
const pairRows = [...pairCountsC.entries()].map(([k, cnt]) => {
  const [cl, a, b, dp] = k.split("|");
  return `(${esc(cl)},${a},${b},${esc(dp)},${cnt})`;
});
for (let i = 0; i < pairRows.length; i += 100) {
  lines.push(`INSERT INTO item_pairs_c (cluster,item_a,item_b,daypart,cnt) VALUES ${pairRows.slice(i, i + 100).join(",")};`);
}
const popRows = [...popCounts.entries()].map(([k, cnt]) => {
  const [cl, id, dp] = k.split("|");
  const total = basketTotals.get(`${cl}|${dp}`) ?? 1;
  return `(${esc(cl)},${id},${esc(dp)},${cnt},${(cnt / total).toFixed(4)})`;
});
for (let i = 0; i < popRows.length; i += 100) {
  lines.push(`INSERT INTO item_popularity (cluster,item_id,daypart,cnt,share) VALUES ${popRows.slice(i, i + 100).join(",")};`);
}
for (const s of STORES) {
  lines.push(`INSERT INTO stores (id,name,district,cluster) VALUES (${s.id},${esc(s.name)},${esc(s.district)},${esc(s.cluster)});`);
}
const invRows = inventory.map((v) => `(${v.store_id},${v.item_id},${v.stock},${v.par},${v.available})`);
for (let i = 0; i < invRows.length; i += 100) {
  lines.push(`INSERT INTO store_inventory (store_id,item_id,stock,par_level,available) VALUES ${invRows.slice(i, i + 100).join(",")};`);
}
for (const [date, name] of HOLIDAYS) {
  lines.push(`INSERT INTO holidays (date,name) VALUES (${esc(date)},${esc(name)});`);
}
for (const [phone, name, points, tier] of LOYALTY) {
  lines.push(`INSERT INTO loyalty_members (phone,name,points,tier) VALUES (${esc(phone)},${esc(name)},${points},${esc(tier)});`);
}
for (const [name, role, avail] of STAFF) {
  lines.push(`INSERT INTO staff (name,role,available) VALUES (${esc(name)},${esc(role)},${avail});`);
}
for (const [k, v] of Object.entries(SETTINGS)) {
  lines.push(`INSERT INTO settings (key,value) VALUES (${esc(k)},${esc(JSON.stringify(v))});`);
}
for (const o of baselineOrders) {
  lines.push(
    `INSERT INTO orders (session_id, channel, order_type, items, subtotal, discount, total, promo_code, rec_attributed, status, created_at) VALUES (` +
    `'demo', ${esc(o.channel)}, ${esc(rand() < 0.6 ? "dine-in" : "takeaway")}, ${esc(JSON.stringify(o.items))}, ${o.subtotal}, 0, ${o.subtotal}, NULL, ${o.recAttributed}, ${esc(o.status)}, ${o.ts});`,
  );
}
for (const r of baselineRecEvents) {
  lines.push(
    `INSERT INTO rec_events (session_id, trigger, anchor_items, shown_items, accepted_item_id, created_at) VALUES (` +
    `${esc(r.sid)}, ${esc(r.trigger)}, ${esc(JSON.stringify(r.anchor))}, ${esc(JSON.stringify(r.shown))}, ${r.accepted ?? "NULL"}, ${r.ts});`,
  );
}

writeFileSync(join(here, "seed.sql"), lines.join("\n"), "utf8");
console.log(`wrote seed.sql: ${lines.length} statements, ${catalog.length} menu items`);
