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
  mcp_url TEXT DEFAULT '',
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

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  owner TEXT NOT NULL,
  contact TEXT NOT NULL,
  alias TEXT DEFAULT '',
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (owner, contact)
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct',
  name TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT NOT NULL,
  member TEXT NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, member)
);

CREATE TABLE IF NOT EXISTS profiles (
  fingerprint TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  public INTEGER DEFAULT 0,
  online_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);

-- Full-text search indexes
CREATE VIRTUAL TABLE IF NOT EXISTS apps_fts USING fts5(name, description, slug);
CREATE VIRTUAL TABLE IF NOT EXISTS profiles_fts USING fts5(name, bio);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner);
CREATE INDEX IF NOT EXISTS idx_chat_members_member ON chat_members(member);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

CREATE TABLE IF NOT EXISTS follows (
  follower TEXT NOT NULL,
  following TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower, following)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following);
