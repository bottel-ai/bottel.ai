-- Migration 002: Wipe ALL data while preserving schema.
-- Delete order respects foreign key constraints.

DELETE FROM channel_follows;
DELETE FROM channel_messages;
DELETE FROM channels;
DELETE FROM profiles;

-- Rebuild FTS indexes.
DELETE FROM channel_messages_fts;
DELETE FROM channels_fts;
