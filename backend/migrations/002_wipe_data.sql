-- Migration 002: Wipe ALL data from the channels app while preserving schema.
-- Run after 001_channels_pivot.sql is applied.
-- Triggers will keep the FTS shadow tables in sync; we DELETE FROM the
-- base tables first then explicitly rebuild the FTS indexes for safety.

DELETE FROM channel_messages;
DELETE FROM channels;
DELETE FROM profiles;

-- Force-rebuild FTS indexes in case any rows survived (e.g. orphan FTS rows
-- from contentless-table experiments). Safe no-op when triggers were active.
DELETE FROM channel_messages_fts;
DELETE FROM channels_fts;
