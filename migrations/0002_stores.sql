-- Multi-store context: store clusters, per-store inventory, cluster-keyed
-- co-occurrence/popularity, holiday calendar.

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT,
  cluster TEXT NOT NULL            -- mall|office|residential|tourist
);

CREATE TABLE IF NOT EXISTS store_inventory (
  store_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 50,
  par_level INTEGER NOT NULL DEFAULT 50,  -- target stock: above = push, near-zero = protect
  available INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (store_id, item_id)
);

CREATE TABLE IF NOT EXISTS item_pairs_c (
  cluster TEXT NOT NULL,
  item_a INTEGER NOT NULL,
  item_b INTEGER NOT NULL,
  daypart TEXT NOT NULL,
  cnt INTEGER NOT NULL,
  PRIMARY KEY (cluster, item_a, item_b, daypart)
);
CREATE INDEX IF NOT EXISTS idx_pairs_c ON item_pairs_c(cluster, item_a, daypart);

-- basket share per cluster+daypart (drives popularity signal + honest attach %)
CREATE TABLE IF NOT EXISTS item_popularity (
  cluster TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  daypart TEXT NOT NULL,
  cnt INTEGER NOT NULL,            -- baskets containing the item
  share REAL NOT NULL,             -- cnt / total baskets in cluster+daypart
  PRIMARY KEY (cluster, item_id, daypart)
);

CREATE TABLE IF NOT EXISTS holidays (
  date TEXT PRIMARY KEY,           -- YYYY-MM-DD (Vietnam time)
  name TEXT NOT NULL
);
