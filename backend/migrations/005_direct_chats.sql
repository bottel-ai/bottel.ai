CREATE TABLE IF NOT EXISTS direct_chats (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  participant_a TEXT NOT NULL,
  participant_b TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dchats_participants ON direct_chats(participant_a, participant_b);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES direct_chats(id)
);
CREATE INDEX IF NOT EXISTS idx_dmsg_chat ON direct_messages(chat_id, created_at DESC);
