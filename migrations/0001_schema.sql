-- kfc-catalog schema. Idempotent so remote re-apply never breaks.

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  name_en TEXT,
  category TEXT NOT NULL,          -- combo|chicken|burger-rice|snack|drink|dessert
  description TEXT,
  price INTEGER NOT NULL,          -- VND
  image_url TEXT,
  is_combo INTEGER DEFAULT 0,
  combo_contents TEXT,             -- JSON [{item_id,qty}] for combos
  modifiers TEXT,                  -- JSON [{group,options:[{name,name_en,delta}]}]
  tags TEXT,                       -- JSON ["spicy","breakfast","shareable","hot","cold"]
  keywords TEXT,                   -- diacritic-folded search haystack
  available INTEGER DEFAULT 1,
  margin_pct REAL DEFAULT 30,
  popularity REAL DEFAULT 0.5
);
CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_items(category);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL,              -- percent|amount|combo_price|free_item
  value INTEGER NOT NULL,
  item_id INTEGER,                 -- for free_item / item-scoped promos
  scope_category TEXT,             -- NULL = storewide
  daypart TEXT,                    -- NULL|breakfast|lunch|tea|dinner|late
  days_of_week TEXT,               -- NULL or CSV of 0-6 (0=Sunday)
  min_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS affinities (
  id INTEGER PRIMARY KEY,
  anchor_category TEXT NOT NULL,
  addon_category TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  reason TEXT
);

-- Synthetic POS history (the "trained on 90 days of transactions" story)
CREATE TABLE IF NOT EXISTS pos_orders (
  id INTEGER PRIMARY KEY,
  ordered_at TEXT NOT NULL,
  daypart TEXT NOT NULL,
  dow INTEGER NOT NULL,
  store_id INTEGER DEFAULT 1,
  items TEXT NOT NULL,             -- JSON [{item_id,qty}]
  total INTEGER NOT NULL
);

-- Precomputed co-occurrence by daypart for O(1) rec lookups
CREATE TABLE IF NOT EXISTS item_pairs (
  item_a INTEGER NOT NULL,
  item_b INTEGER NOT NULL,
  daypart TEXT NOT NULL,
  cnt INTEGER NOT NULL,
  PRIMARY KEY (item_a, item_b, daypart)
);
CREATE INDEX IF NOT EXISTS idx_pairs_a ON item_pairs(item_a, daypart);

CREATE TABLE IF NOT EXISTS loyalty_members (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'member'       -- member|silver|gold
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel TEXT DEFAULT 'kiosk',    -- kiosk|chat
  order_type TEXT,                 -- dine-in|takeaway
  items TEXT NOT NULL,             -- JSON line items
  subtotal INTEGER NOT NULL,
  discount INTEGER DEFAULT 0,
  total INTEGER NOT NULL,
  promo_code TEXT,
  loyalty_phone TEXT,
  rec_attributed INTEGER DEFAULT 0, -- VND of rec-accepted items in this order
  status TEXT DEFAULT 'received',  -- received|preparing|ready|completed
  created_at TEXT DEFAULT (datetime('now'))
);

-- Human-in-the-loop: agent escalations routed to available CS/sales staff
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'cs',          -- cs|sales|manager
  available INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel TEXT DEFAULT 'kiosk',
  reason TEXT,
  status TEXT DEFAULT 'pending',   -- pending|active|resolved
  assigned_to INTEGER,             -- staff.id
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Chat relay so staff replies reach the kiosk chat panel (kiosk polls)
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,              -- user|agent|staff
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, id);

CREATE TABLE IF NOT EXISTS rec_events (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  trigger TEXT NOT NULL,           -- item_added|cart_review|chat
  anchor_items TEXT,               -- JSON ids
  shown_items TEXT,                -- JSON ids
  accepted_item_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Telemetry stream that powers the live system diagram + admin log
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  source TEXT NOT NULL,            -- kiosk|agent|rec|admin|system
  type TEXT NOT NULL,
  node_from TEXT,
  node_to TEXT,
  label TEXT,
  data TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);
