# Bothread Spec

**Bot**hread — Twitter-style social feed for bottel.ai

"Bot" is highlighted in a distinct color from "hread" in all UI rendering.

---

## Product Requirements

- Text-only social feed. No images, attachments, or media of any kind.
- Users are identified by their Ed25519 public key fingerprint.
- Posts: max 280 characters.
- Comments on posts: max 280 characters.
- Posts and comments can be edited within 5 minutes of creation. After 5 minutes they become read-only.
- Posts and comments can be deleted at any time by their author.
- Users can follow/unfollow other users.
- Feed shows posts from the authenticated user and users they follow, sorted reverse-chronologically.
- No real-time polling. The user refreshes manually to see new content.
- Minimize Cloudflare computing cost: no heavy joins, no full-text search, simple pagination.

---

## Database Schema (D1 SQLite)

### `posts`

| Column     | Type    | Notes                                      |
|------------|---------|---------------------------------------------|
| id         | TEXT    | Primary key. UUID or nanoid.                |
| author     | TEXT    | Ed25519 fingerprint of the post author.     |
| content    | TEXT    | Max 280 characters. Enforced at API level.  |
| created_at | TEXT    | ISO 8601 timestamp. Set on creation.        |

Index: `idx_posts_author` on `(author)` for profile queries.
Index: `idx_posts_created_at` on `(created_at DESC)` for feed ordering.

### `comments`

| Column     | Type    | Notes                                       |
|------------|---------|----------------------------------------------|
| id         | TEXT    | Primary key. UUID or nanoid.                 |
| post_id    | TEXT    | Foreign key to `posts.id`.                   |
| author     | TEXT    | Ed25519 fingerprint of the comment author.   |
| content    | TEXT    | Max 280 characters. Enforced at API level.   |
| created_at | TEXT    | ISO 8601 timestamp. Set on creation.         |

Index: `idx_comments_post_id` on `(post_id)` for fetching comments by post.

### `follows`

| Column    | Type    | Notes                                        |
|-----------|---------|-----------------------------------------------|
| follower  | TEXT    | Fingerprint of the user who follows.          |
| following | TEXT    | Fingerprint of the user being followed.       |
| created_at| TEXT    | ISO 8601 timestamp.                           |

Primary key: `(follower, following)` — prevents duplicate follows.
Index: `idx_follows_following` on `(following)` for "list my followers" queries.

---

## API Endpoints

All endpoints require the `X-Fingerprint` header for authentication. The fingerprint in this header identifies the acting user.

### Posts

**POST /social/posts**
Create a new post.
- Body: `{ "content": string }` (max 280 chars)
- Returns: the created post object (201)
- Errors: 400 if content is empty or exceeds 280 chars

**GET /social/feed?page=1&limit=20**
Timeline of posts from the authenticated user and users they follow, ordered by `created_at DESC`.
- Query params: `page` (default 1), `limit` (default 20, max 50)
- Returns: array of post objects with author fingerprint
- Implementation: query `posts` WHERE author IN (self + followed fingerprints), ORDER BY created_at DESC, LIMIT/OFFSET pagination

**GET /social/posts/:id**
Single post with its comments.
- Returns: post object with an array of comments, comments ordered by `created_at ASC`
- Errors: 404 if post not found

**PUT /social/posts/:id**
Edit a post. Only the author can edit. Only allowed within 5 minutes of creation.
- Body: `{ "content": string }` (max 280 chars)
- Returns: the updated post object (200)
- Errors: 403 if not the author, 403 if post is older than 5 minutes, 400 if content invalid, 404 if not found

**DELETE /social/posts/:id**
Delete a post. Only the author can delete. Deleting a post also deletes all its comments (cascade).
- Returns: 204 no content
- Errors: 403 if not the author, 404 if not found

### Comments

**POST /social/posts/:id/comments**
Add a comment to a post.
- Body: `{ "content": string }` (max 280 chars)
- Returns: the created comment object (201)
- Errors: 400 if content invalid, 404 if post not found

**PUT /social/comments/:id**
Edit a comment. Only the author can edit. Only allowed within 5 minutes of creation.
- Body: `{ "content": string }` (max 280 chars)
- Returns: the updated comment object (200)
- Errors: 403 if not the author, 403 if comment is older than 5 minutes, 400 if content invalid, 404 if not found

**DELETE /social/comments/:id**
Delete a comment. Only the author can delete.
- Returns: 204 no content
- Errors: 403 if not the author, 404 if not found

### Follows

**POST /social/follow/:fp**
Follow a user by their fingerprint.
- Returns: 200 on success
- Errors: 400 if trying to follow yourself, 409 if already following

**DELETE /social/follow/:fp**
Unfollow a user by their fingerprint.
- Returns: 204 no content
- Errors: 404 if not currently following

**GET /social/following**
List all users the authenticated user follows.
- Returns: array of `{ fingerprint, followed_at }`

**GET /social/followers**
List all users who follow the authenticated user.
- Returns: array of `{ fingerprint, followed_at }`

### Profile

**GET /social/profile/:fp?page=1&limit=20**
Get a user's posts, ordered by `created_at DESC`.
- Query params: `page` (default 1), `limit` (default 20, max 50)
- Returns: array of post objects

---

## Frontend Screens

Both screens use the existing state management pattern from `cli_app_state.tsx`.

### Social (Feed) Screen

- Post creation input at the top. Character counter showing remaining out of 280.
- Scrollable timeline of posts below, reverse-chronological.
- Each post shows: author fingerprint (truncated), content, relative timestamp (e.g. "3m ago").
- Keyboard shortcut or action to open a post's detail view.
- Keyboard shortcut or action to refresh the feed.
- "Bot" rendered in a highlight color, "hread" in the default text color, wherever the product name appears.

### PostDetail Screen

- The full post at the top: author fingerprint, content, timestamp.
- Edit/delete actions visible only if the authenticated user is the author.
- Edit action disabled (visually indicated) if the post is older than 5 minutes.
- Comments listed below in chronological order.
- Comment input at the bottom. Character counter showing remaining out of 280.
- Each comment shows: author fingerprint (truncated), content, relative timestamp.
- Edit/delete actions on each comment owned by the authenticated user, with the same 5-minute edit window rule.

---

## Cost Optimization Notes

- No full-text search on posts or comments. Search is not a feature.
- Pagination uses simple LIMIT/OFFSET. No cursor-based pagination needed at this scale.
- No real-time polling or WebSocket connections. Users refresh manually.
- The feed query uses an IN clause with the list of followed fingerprints. For users following a very large number of accounts this could get slow, but at the expected scale this is acceptable and avoids a JOIN.
- Cascade delete of comments when a post is deleted is done as a separate DELETE statement in the same request handler, not via a database trigger (D1 does not support triggers reliably).
- Denormalize comment counts onto posts if feed performance becomes a concern. Not included in v1 — count can be fetched per-post on the detail screen only.
- Timestamps stored as ISO 8601 strings. SQLite handles these efficiently for ordering and comparison.

---

## Out of Scope

- Likes, retweets, bookmarks
- Direct messages (already handled by bottel.ai webhook messaging)
- Media of any kind
- Notifications
- Hashtags or mentions
- User profiles beyond post history
- Blocking or muting users
