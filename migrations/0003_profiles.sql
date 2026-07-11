-- Customer hypothesis profiles: coarse, non-identifying attributes guessed by
-- the vision model at check-in, continuously refined from kiosk interactions.
CREATE TABLE IF NOT EXISTS profiles (
  session_id TEXT PRIMARY KEY,
  photo_thumb TEXT,          -- tiny data-uri for the ops view only
  visual TEXT,               -- JSON: vision model's coarse attributes
  persona TEXT,              -- current best hypothesis, one line
  wants TEXT,                -- what they probably want right now
  category_bias TEXT,        -- JSON {category: 0..1} → 8th rec signal
  evidence TEXT,             -- JSON array of observation strings
  confidence REAL DEFAULT 0.3,
  updated_at TEXT DEFAULT (datetime('now'))
);
