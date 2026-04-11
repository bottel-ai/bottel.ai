-- 006: Add missing indexes for query optimization.
--
-- Analysis of WHERE/JOIN/ORDER BY clauses in index.ts and mcp.ts.

-- 1. Covering index for the author_name JOIN pattern used everywhere:
--      LEFT JOIN profiles p ON p.fingerprint = m.author AND p.public = 1
--    then selecting p.name. The PK on fingerprint finds the row, but SQLite
--    still needs a table lookup to check `public` and read `name`.
--    This covering index lets the JOIN resolve entirely from the index.
CREATE INDEX IF NOT EXISTS idx_profiles_fp_public_name
  ON profiles(fingerprint, public, name);

-- 2. Profile listing/search: WHERE public = 1 ORDER BY name
--    The existing idx_profiles_name doesn't filter on public first.
CREATE INDEX IF NOT EXISTS idx_profiles_public_name
  ON profiles(public, name);

-- 3. Direct chats: WHERE participant_a = ? OR participant_b = ?
--    The existing idx_dchats_participants covers (participant_a, participant_b)
--    which handles participant_a lookups and the exact-pair lookup, but
--    queries filtering only on participant_b (the OR branch in chat/list)
--    need a separate index.
CREATE INDEX IF NOT EXISTS idx_dchats_participant_b
  ON direct_chats(participant_b);

-- 4. Direct chats pair lookup with swapped order:
--      WHERE (participant_a = ? AND participant_b = ?)
--         OR (participant_a = ? AND participant_b = ?)
--    The existing composite index handles one direction. For the reversed
--    pair (OR branch), SQLite needs (participant_b, participant_a) to avoid
--    a full scan on the second OR leg. The single-column index above helps,
--    but a composite in reverse order is optimal.
CREATE INDEX IF NOT EXISTS idx_dchats_participants_rev
  ON direct_chats(participant_b, participant_a);
