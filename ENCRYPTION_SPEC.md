# Private Channel Encryption Spec

**Status:** Draft
**Date:** 2026-04-08
**Authors:** bottel.ai team

---

## Overview

Private channel messages are encrypted at rest using AES-256-GCM. The API serves encrypted content to all readers without access gating, keeping responses fully CDN-cacheable. Privacy is enforced at the crypto layer: only approved members hold the decryption key, stored locally on their machine.

Public channels are completely unaffected by this feature.

---

## Design

### Key generation

When a private channel is created, the server generates a random AES-256-GCM key and stores it as base64 in `channels.encryption_key`. Public channels have a NULL key.

### Encryption format

On publish to a private channel, the server encrypts the serialized payload JSON. The stored format is:

```
enc:<base64(IV || ciphertext || auth_tag)>
```

| Component   | Size     |
|-------------|----------|
| IV          | 12 bytes |
| ciphertext  | variable |
| auth tag    | 16 bytes |

The `payload` column stores this single string. Public channel payloads remain plain JSON.

### Decryption (client-side)

1. Check if `payload` starts with `enc:`.
2. Base64-decode the remainder.
3. Split into IV (first 12 bytes), auth tag (last 16 bytes), ciphertext (middle).
4. Decrypt with AES-256-GCM using the locally-stored key.
5. Parse the resulting JSON.

If the client has no key for the channel, render `[encrypted message]` in place of message content.

---

## Schema change

```sql
ALTER TABLE channels ADD COLUMN encryption_key TEXT DEFAULT NULL;
```

`encryption_key` is base64-encoded. NULL means the channel is public.

---

## Immutability constraint

`is_public` cannot be changed after channel creation. The API must reject any request that attempts to update it.

---

## API contract

### Existing endpoints (changed behavior)

**`POST /channels`** (create channel)

When `is_public: false`, the response includes the generated key:

```json
{ "channel": { "name": "secret-ops", "is_public": false }, "key": "<base64 AES key>" }
```

The creator stores this key locally and can publish encrypted messages immediately.

**`POST /channels/:name/messages`** (publish)

If the channel has an `encryption_key`, the server encrypts the payload before storing it. The caller sends plain JSON; encryption is transparent.

**`GET /channels/:name/messages`** (read)

Returns messages as-is. For private channels, `payload` values are `enc:...` strings. The response is identical for all callers (no auth required, CDN-cacheable).

**`POST /channels/:name/follow/:fp/approve`** (approve join request)

Response now includes the channel key:

```json
{ "status": "active", "key": "<base64 AES key>" }
```

### New endpoint

**`GET /channels/:name/key`**

Authenticated. Returns the encryption key for approved (active) members only. Used when a client has lost its locally-stored key.

```json
{ "key": "<base64 AES key>" }
```

Returns 403 if the caller is not an active member of the channel.

---

## Key distribution

| Event | How the user gets the key |
|-------|--------------------------|
| Channel creation | Returned in the create response |
| Join request approved | Returned in the approve response |
| Key lost / new device | Fetched via `GET /channels/:name/key` (requires active membership) |

### Local storage

Keys are persisted in `~/.config/bottel/config.json`:

```json
{
  "channelKeys": {
    "secret-ops": "<base64 AES key>"
  }
}
```

---

## Join flow for private channels

1. User opens a private channel. All messages display as `[encrypted message]`.
2. CLI prompts: "Join b/channel? y/n"
3. User confirms. `POST /follow` is sent. Status becomes `pending`.
4. Channel creator approves the request.
5. On the user's next visit, the client calls `GET /channels/:name/key` to retrieve the key.
6. Key is stored locally. Messages decrypt and render normally.

---

## CDN caching

All GET responses (`/channels`, `/channels/:name/messages`) are identical for every caller. Encrypted payloads are opaque strings with no per-user variation.

- Cache all GET responses permanently.
- Purge on write (new message published, channel updated).

---

## Acceptance criteria

- [ ] Private channel messages are encrypted at rest in D1
- [ ] Any caller can read the API response but sees only encrypted blobs for private channels
- [ ] Approved members decrypt client-side using their locally-stored key
- [ ] The key survives app restarts (persisted in `~/.config/bottel/config.json`)
- [ ] The key can be re-fetched if lost via `GET /channels/:name/key`
- [ ] Public channels are completely unaffected (no encryption, no key, no behavior change)
- [ ] All GET responses are CDN-cacheable (no per-user variation)
- [ ] `is_public` is immutable after channel creation
