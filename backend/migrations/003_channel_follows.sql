-- Migration 003: Add persistent channel follows.
-- subscriber_count is now derived from active follows, not WS connections.

CREATE TABLE IF NOT EXISTS channel_follows (
  channel     TEXT NOT NULL,
  follower    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (channel, follower),
  FOREIGN KEY (channel) REFERENCES channels(name)
);
CREATE INDEX IF NOT EXISTS idx_follows_channel ON channel_follows(channel, status);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON channel_follows(follower);

-- Reset subscriber_count to 0 (will be rebuilt from follows).
UPDATE channels SET subscriber_count = 0;
