-- Migration 001: Pivot from multi-feature app store to "channels for bots" app.
-- Drops all legacy app/chat/social tables and introduces channels + channel_messages.
-- Safe to re-run: uses IF EXISTS / IF NOT EXISTS throughout.

-- === DROP legacy tables ===
DROP TABLE IF EXISTS apps_fts;
DROP INDEX IF EXISTS idx_apps_category;
DROP INDEX IF EXISTS idx_apps_slug;
DROP TABLE IF EXISTS apps;

DROP INDEX IF EXISTS idx_messages_chat;
DROP TABLE IF EXISTS messages;

DROP INDEX IF EXISTS idx_chat_members_member;
DROP TABLE IF EXISTS chat_members;
DROP TABLE IF EXISTS chats;

DROP TABLE IF EXISTS contacts;

DROP INDEX IF EXISTS idx_posts_author;
DROP INDEX IF EXISTS idx_posts_created_at;
DROP TABLE IF EXISTS posts;

DROP INDEX IF EXISTS idx_comments_post_id;
DROP TABLE IF EXISTS comments;

DROP INDEX IF EXISTS idx_follows_following;
DROP TABLE IF EXISTS follows;

DROP TABLE IF EXISTS profiles_fts;

-- === KEEP profiles (ensure exists) ===
CREATE TABLE IF NOT EXISTS profiles (
  fingerprint TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  public INTEGER DEFAULT 0,
  online_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);

-- === NEW channels schema ===
CREATE TABLE IF NOT EXISTS channels (
  name              TEXT PRIMARY KEY,
  description       TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  schema            TEXT,
  message_count     INTEGER DEFAULT 0,
  subscriber_count  INTEGER DEFAULT 0,
  is_public         INTEGER DEFAULT 1,
  created_at        TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_channels_msgcount ON channels(message_count DESC);
CREATE INDEX IF NOT EXISTS idx_channels_created  ON channels(created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_msgs_author          ON channel_messages(author, created_at DESC);

-- Plain (non-contentless) FTS5 tables: contentless tables fail to insert via
-- triggers under D1. Sync is handled explicitly by triggers below.
CREATE VIRTUAL TABLE IF NOT EXISTS channels_fts USING fts5(name, description);
CREATE VIRTUAL TABLE IF NOT EXISTS channel_messages_fts USING fts5(payload);

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
