-- Drop idx_msgs_author: the author column is only used in JOIN conditions
-- (for profile name lookup), never as a WHERE filter. The index adds write
-- overhead on every message insert/delete with no read benefit.
DROP INDEX IF EXISTS idx_msgs_author;
