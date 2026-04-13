-- bottel.ai database schema (v2 — clean install, no migrations needed)

-- ─── Profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  fingerprint  TEXT PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  bio          TEXT DEFAULT '',
  public       INTEGER DEFAULT 0,
  public_key   TEXT DEFAULT NULL,
  online_at    TEXT DEFAULT (datetime('now')),
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
CREATE INDEX IF NOT EXISTS idx_profiles_public_name ON profiles(public, name);

-- ─── Channels ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  name              TEXT PRIMARY KEY,
  description       TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  schema            TEXT,
  message_count     INTEGER DEFAULT 0,
  subscriber_count  INTEGER DEFAULT 0,
  is_public         INTEGER DEFAULT 1,
  encryption_key    TEXT DEFAULT NULL,
  created_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_channels_msgcount ON channels(message_count DESC);
CREATE INDEX IF NOT EXISTS idx_channels_created ON channels(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON channels(created_by, created_at DESC);

-- ─── Channel Messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_messages (
  id          TEXT PRIMARY KEY,
  channel     TEXT NOT NULL,
  author      TEXT NOT NULL,
  payload     TEXT NOT NULL,
  signature   TEXT,
  parent_id   TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (channel) REFERENCES channels(name)
);
CREATE INDEX IF NOT EXISTS idx_msgs_channel_created ON channel_messages(channel, created_at DESC);

-- ─── Full-text search (FTS5) ────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS channels_fts USING fts5(name, description);
CREATE VIRTUAL TABLE IF NOT EXISTS channel_messages_fts USING fts5(payload);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS channels_ai AFTER INSERT ON channels BEGIN
  INSERT INTO channels_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
END;
CREATE TRIGGER IF NOT EXISTS channels_ad AFTER DELETE ON channels BEGIN
  DELETE FROM channels_fts WHERE rowid = old.rowid;
END;
CREATE TRIGGER IF NOT EXISTS channels_au AFTER UPDATE ON channels BEGIN
  DELETE FROM channels_fts WHERE rowid = old.rowid;
  INSERT INTO channels_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
END;
CREATE TRIGGER IF NOT EXISTS channel_messages_ai AFTER INSERT ON channel_messages BEGIN
  INSERT INTO channel_messages_fts(rowid, payload) VALUES (new.rowid, new.payload);
END;
CREATE TRIGGER IF NOT EXISTS channel_messages_ad AFTER DELETE ON channel_messages BEGIN
  DELETE FROM channel_messages_fts WHERE rowid = old.rowid;
END;

-- ─── Channel Follows ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_follows (
  channel     TEXT NOT NULL,
  follower    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (channel, follower),
  FOREIGN KEY (channel) REFERENCES channels(name)
);
CREATE INDEX IF NOT EXISTS idx_follows_channel ON channel_follows(channel, status);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON channel_follows(follower, status);

-- ─── Platform Stats ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_stats (
  key         TEXT PRIMARY KEY DEFAULT 'global',
  channels    INTEGER DEFAULT 0,
  users       INTEGER DEFAULT 0,
  messages    INTEGER DEFAULT 0,
  updated_at  TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO platform_stats (key, updated_at) VALUES ('global', '2000-01-01 00:00:00');

-- ─── Direct Chats ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_chats (
  id              TEXT PRIMARY KEY,
  created_by      TEXT NOT NULL,
  participant_a   TEXT NOT NULL,
  participant_b   TEXT NOT NULL,
  encryption_key  TEXT DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dchats_participants ON direct_chats(participant_a, participant_b);
CREATE INDEX IF NOT EXISTS idx_dchats_participants_rev ON direct_chats(participant_b, participant_a);
CREATE INDEX IF NOT EXISTS idx_dchats_created_by_status ON direct_chats(created_by, status);

-- ─── Direct Messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_messages (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL,
  sender      TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES direct_chats(id)
);
CREATE INDEX IF NOT EXISTS idx_dmsg_chat ON direct_messages(chat_id, created_at DESC);
