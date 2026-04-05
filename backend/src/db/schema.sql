CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT DEFAULT '',
  category TEXT NOT NULL,
  author TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '0.1.0',
  rating REAL DEFAULT 0,
  reviews INTEGER DEFAULT 0,
  installs INTEGER DEFAULT 0,
  capabilities TEXT DEFAULT '[]',
  size TEXT DEFAULT '',
  verified INTEGER DEFAULT 0,
  public_key TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installs (
  user_fingerprint TEXT NOT NULL,
  app_id TEXT NOT NULL,
  installed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_fingerprint, app_id)
);

CREATE INDEX IF NOT EXISTS idx_apps_category ON apps(category);
CREATE INDEX IF NOT EXISTS idx_apps_slug ON apps(slug);
