# Technical Documentation -- bottel.ai

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLI Entry                             │
│                     (src/cli.tsx)                             │
│  Alternate screen buffer + SGR mouse tracking + ink render   │
├──────────────────────────────────────────────────────────────┤
│                      App Router                              │
│                    (src/App.tsx)                              │
│  ScrollView viewport + screen switching + mouse wheel        │
├──────────────────────────────────────────────────────────────┤
│                     State Engine                             │
│                (src/cli_app_state.tsx)                        │
│  useReducer + Context, 8 screen states, history stack        │
├────────┬────────┬────────┬────────┬────────┬────────┬───────┤
│  Home  │ Browse │ Search │ Detail │  Auth  │ Submit │ More  │
├────────┴────────┴────────┴────────┴────────┴────────┴───────┤
│                  Reusable Components                         │
│  Logo, StatusBar, Cursor, Breadcrumb, Rating, HelpFooter    │
│                (src/cli_app_components.tsx)                   │
├──────────────────────────────────────────────────────────────┤
│                    Theme Constants                           │
│           Colors, column widths, box styles                  │
│                (src/cli_app_theme.tsx)                        │
├──────────────────────────────────────────────────────────────┤
│                      API Client                              │
│                   (src/lib/api.ts)                            │
│  7 endpoints, snake_case → camelCase mapping                 │
├──────────────────────────────────────────────────────────────┤
│                    Auth Module                                │
│                  (src/lib/auth.ts)                            │
│  Ed25519 key gen, SSH format, fingerprint, conf persistence  │
├──────────────────────────┬───────────────────────────────────┤
                           │ HTTP (fetch)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers API                       │
│                  (backend/src/index.ts)                       │
│  Hono framework, CORS, auth middleware, 7 routes             │
├──────────────────────────┬───────────────────────────────────┤
                           │ D1 bindings
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  Cloudflare D1 Database                       │
│                    (SQLite engine)                            │
│  3 tables: apps, users, installs                             │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript | 6.x |
| Runtime | Node.js | 22+ (via nvm) |
| Terminal UI | ink | 6.x |
| React | React | 19.x |
| Text Input | ink-text-input | 6.x |
| Spinner | ink-spinner | 5.x |
| Select Input | ink-select-input | 6.x |
| Table | ink-table | 3.x |
| Scrolling | ink-scroll-view | 0.3.x |
| Persistent Config | conf | 15.x |
| CLI Runner | pastel | 4.x |
| Dev Runner | tsx | 4.x |
| Build | tsc | - |
| Test Runner | vitest | 4.x |
| Backend Framework | Hono | 4.x |
| Backend Runtime | Cloudflare Workers | - |
| Database | Cloudflare D1 (SQLite) | - |
| Workers Types | @cloudflare/workers-types | 4.x |
| Deployment | wrangler | 4.x |

## Frontend

### Entry Point (cli.tsx)

The CLI entry point performs these steps:

1. Enters the alternate screen buffer (`\x1b[?1049h`) -- hides terminal history
2. Clears the screen (`\x1b[2J\x1b[H`)
3. Enables SGR mouse tracking (`\x1b[?1000h\x1b[?1002h\x1b[?1006h`)
4. Renders the React app via ink's `render()`
5. On exit, disables mouse tracking and restores the original screen buffer
6. Handles SIGINT/SIGTERM for clean restoration

### State Engine (cli_app_state.tsx)

Centralized state management using React `useReducer` + Context.

**Screen type:**

```typescript
type Screen =
  | { name: "home" }
  | { name: "browse" }
  | { name: "search" }
  | { name: "agent-detail"; agentId: string }
  | { name: "installed" }
  | { name: "settings" }
  | { name: "auth" }
  | { name: "submit" };
```

**State slices** -- each screen has its own persisted state:

| Slice | Fields |
|-------|--------|
| `home` | `selectedIndex` |
| `browse` | `categoryIndex`, `expandedCategory`, `agentIndex`, `agentPage`, `inAgents` |
| `search` | `query`, `selectedIndex`, `page`, `inputFocused` |
| `agentDetail` | `buttonIndex` |
| `installedScreen` | `selectedIndex` |
| `settings` | `selectedIndex` |
| `authScreen` | `selectedIndex` |
| `submit` | `step`, `name`, `slug`, `description`, `category`, `version` |

**Actions** (14 types):

| Action | Description |
|--------|-------------|
| `NAVIGATE` | Push current screen to history, switch to new screen, reset target state |
| `GO_BACK` | Pop from history stack |
| `GO_HOME` | Clear history, go to home |
| `INSTALL_AGENT` | Add agent ID to installed set |
| `UNINSTALL_AGENT` | Remove agent ID from installed set |
| `UPDATE_SEARCH` | Partial update to search state |
| `UPDATE_BROWSE` | Partial update to browse state |
| `UPDATE_HOME` | Partial update to home state |
| `UPDATE_INSTALLED` | Partial update to installed screen state |
| `UPDATE_SETTINGS` | Partial update to settings state |
| `UPDATE_AGENT_DETAIL` | Partial update to agent detail state |
| `UPDATE_AUTH_SCREEN` | Partial update to auth screen state |
| `UPDATE_SUBMIT` | Partial update to submit state |
| `RESET_SEARCH` | Reset search state to initial |
| `RESET_BROWSE` | Reset browse state to initial |

Navigation behavior: `NAVIGATE` resets the target screen's state slice. `GO_BACK` preserves state (no reset).

### Theme (cli_app_theme.tsx)

**Colors:**

| Name | Hex | Usage |
|------|-----|-------|
| `primary` | `#48dbfb` | Selected items, primary highlights, logo |
| `secondary` | `#54a0ff` | Breadcrumb non-active items |
| `accent` | `#ff9ff3` | Branding (bottel.ai text) |
| `warning` | `#feca57` | Star ratings |
| `success` | `#2ed573` | Verified badge, login status, submit confirm |
| `error` | `#ff6b6b` | Error messages, cancel button |
| `border` | `#5f27cd` | Box borders, capability tags |
| `orange` | `#ff9f43` | (reserved) |
| `dimBorder` | `gray` | Footer borders |

**Column widths:**

| Column | Width |
|--------|-------|
| `cursor` | 3 |
| `rank` | 4 |
| `name` | 22 |
| `author` | 16 |
| `rating` | 10 |
| `installs` | 16 |
| `version` | 10 |
| `category` | 18 |

**Box styles:** `header` (double border), `card` (round), `cardActive` (round + primary color), `section` (single + border color), `footer` (single + dim).

### Components (cli_app_components.tsx)

| Component | Description |
|-----------|-------------|
| `Cursor` | Arrow indicator (`❯`) for list items |
| `Breadcrumb` | Navigation trail (Home > Browse > Category) |
| `HelpFooter` | Dim keyboard shortcut help text |
| `Rating` | Star rating with optional numeric value |
| `InstallCount` | Auto-formatted install count (45.2k) |
| `VerifiedBadge` | Green checkmark for verified apps |
| `Separator` | Horizontal line (defaults to 60 chars) |
| `ScreenHeader` | Bordered section title |
| `Logo` | Full 3D ASCII art logo with tagline |
| `CompactLogo` | Single-line logo for small terminals |
| `StatusBar` | Top bar showing auth status |

### Screens

| Screen | File | Description |
|--------|------|-------------|
| Home | `Home.tsx` | Store front with menu (8 items), featured agents (cards), trending (ranked list), categories. Fetches from API on mount. Flat navigable list across all sections. |
| Browse | `Browse.tsx` | Browse apps by category with expandable sections |
| Search | `Search.tsx` | Text input + live results from API (`?q=query`) |
| AgentDetail | `AgentDetail.tsx` | Full app detail view (stats, description, capabilities, install button) |
| Installed | `Installed.tsx` | User's installed apps list |
| Settings | `Settings.tsx` | User preferences |
| Auth | `Auth.tsx` | Key management: generate key pair, import key, show full key, regenerate, logout |
| Submit | `Submit.tsx` | 6-step form: name, slug (auto-generated), description, category (picker), version, confirm. Requires auth. Saves via `conf`. |

## Backend

### Hono App (backend/src/index.ts)

Cloudflare Workers app built with Hono. Features:

- CORS enabled globally (`cors()`)
- Auth middleware for protected routes
- JSON responses throughout
- D1 database binding (`DB`)
- Custom 404 and error handlers

### Database Schema (3 tables)

#### `apps`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `slug` | TEXT | UNIQUE NOT NULL |
| `description` | TEXT | NOT NULL |
| `long_description` | TEXT | DEFAULT '' |
| `category` | TEXT | NOT NULL |
| `author` | TEXT | NOT NULL |
| `version` | TEXT | NOT NULL, DEFAULT '0.1.0' |
| `rating` | REAL | DEFAULT 0 |
| `reviews` | INTEGER | DEFAULT 0 |
| `installs` | INTEGER | DEFAULT 0 |
| `capabilities` | TEXT | DEFAULT '[]' (JSON array) |
| `size` | TEXT | DEFAULT '' |
| `verified` | INTEGER | DEFAULT 0 (boolean) |
| `public_key` | TEXT | nullable |
| `created_at` | TEXT | DEFAULT datetime('now') |

#### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| `fingerprint` | TEXT | PRIMARY KEY |
| `public_key` | TEXT | NOT NULL |
| `created_at` | TEXT | DEFAULT datetime('now') |

#### `installs`

| Column | Type | Constraints |
|--------|------|-------------|
| `user_fingerprint` | TEXT | NOT NULL |
| `app_id` | TEXT | NOT NULL |
| `installed_at` | TEXT | DEFAULT datetime('now') |
| | | PRIMARY KEY (user_fingerprint, app_id) |

**Indexes:**

- `idx_apps_category` on `apps(category)`
- `idx_apps_slug` on `apps(slug)`
- `idx_installs_user` on `installs(user_fingerprint)`

### API Endpoints (7)

#### `GET /` -- Health check

No auth. Returns service name, version, and status.

```json
{ "name": "bottel.ai", "version": "0.1.0", "status": "ok" }
```

#### `GET /apps` -- List/search/filter apps

No auth. Query params: `q` (search name/description), `category` (exact match). Results ordered by installs descending.

```
GET /apps?q=code&category=Development
```

```json
{ "apps": [{ "id": "...", "name": "...", "slug": "...", ... }] }
```

#### `GET /apps/:slug` -- Get single app

No auth. Returns 404 if not found.

```json
{ "app": { "id": "...", "name": "...", "slug": "...", ... } }
```

#### `GET /categories` -- List categories with counts

No auth. Aggregates from apps table.

```json
{ "categories": [{ "name": "Development", "count": 5 }] }
```

#### `POST /register` -- Register public key

No auth. Body: `{ fingerprint, publicKey }`. Uses `INSERT OR IGNORE` (idempotent).

```json
{ "ok": true }
```

#### `POST /apps` -- Submit new app

Requires auth (`X-Fingerprint`, `X-Signature`). Body: `{ name, slug, description, category, version, longDescription?, capabilities? }`. Author is set to the fingerprint. Public key stored with the app.

```json
{ "app": { "id": "...", "name": "...", ... } }
```

#### `GET /user/installs` -- Get user's installed apps

Requires auth. Returns apps joined with installs table.

```json
{ "installs": [{ "id": "...", "name": "...", ... }] }
```

#### `POST /user/installs/:appId` -- Toggle install

Requires auth. If already installed, uninstalls (decrements count). If not installed, installs (increments count). Uses D1 batch for atomicity.

```json
{ "installed": true }
```

### Auth Middleware (backend/src/middleware/auth.ts)

Validates `X-Fingerprint` and `X-Signature` headers. Looks up the user's public key from the `users` table by fingerprint. Sets `fingerprint` and `publicKey` on the Hono context for downstream handlers.

Returns 401 if headers are missing or fingerprint is not registered.

> Note: Full Ed25519 signature verification is stubbed for MVP. Currently validates that the fingerprint exists in the database.

## Auth Flow

### Key Generation

```
crypto.generateKeyPairSync("ed25519")
    │
    ├── Private key: PKCS8 DER → base64 string
    │
    └── Public key: SPKI DER → SSH wire format
            │
            ├── Extract last 32 bytes (raw Ed25519 key)
            ├── Encode as SSH wire format:
            │     [4 bytes: type length][ssh-ed25519][4 bytes: key length][raw key]
            └── Result: "ssh-ed25519 AAAA..."
                    │
                    └── Fingerprint: SHA256 hash of base64-decoded blob
                        → "SHA256:xxxxxxxx..."
```

### Storage

Keys are persisted locally using the `conf` package:

- Location: `~/.config/bottel/config.json`
- Stores: `{ auth: { privateKey, publicKey, fingerprint } | null }`

### Key Import

Accepts a base64-encoded PKCS8 DER private key. Reconstructs the public key using `crypto.createPublicKey()`, converts to SSH format, and computes the fingerprint.

### Functions

| Function | Description |
|----------|-------------|
| `generateKeyPair()` | Generate new Ed25519 key pair, return AuthData |
| `getAuth()` | Get current auth data or null |
| `isLoggedIn()` | Check if auth data exists |
| `saveAuth(auth)` | Persist auth data |
| `clearAuth()` | Remove auth data (logout) |
| `getShortFingerprint()` | Display-friendly fingerprint (first 16 chars) |
| `importPrivateKey(base64)` | Import existing private key, derive public key |

## Reusable Packages

### cli_app_state

Extracted state management pattern. Provides:

- `Screen` union type for screen-based navigation
- `AppState` with per-screen state slices
- `Action` union with `NAVIGATE`, `GO_BACK`, `GO_HOME`, per-screen updates, install/uninstall
- `StoreProvider` React component wrapping `useReducer`
- `useStore()` hook returning `{ state, dispatch, navigate, goBack, goHome }`
- History stack: forward navigation resets target state, back navigation preserves it

### cli_app_theme

Extracted visual constants:

- `colors` object (9 named hex colors)
- `columns` object (8 fixed-width column sizes)
- `boxStyle` object (5 ink Box border presets)
- `formatStars(rating)` -- converts 0-5 to filled star characters
- `formatInstalls(n)` -- formats numbers (45200 → "45.2k", 1200000 → "1.2M")
- `formatNumber(n)` -- locale-formatted number string

### cli_app_components

Extracted terminal UI components:

- Navigation: `Cursor`, `Breadcrumb`, `HelpFooter`
- Data display: `Rating`, `InstallCount`, `VerifiedBadge`
- Layout: `Separator`, `ScreenHeader`
- Branding: `Logo`, `CompactLogo`, `StatusBar`

All components depend on `cli_app_theme` for colors and formatters. `StatusBar` also depends on `lib/auth` for login status display.

## Scaffold Packages

### cli_app_scaffold

Generates a new CLI app project with the full bottel stack.

**Usage:** `cli_app_scaffold <project-name>`

**Generated files:**

| File | Purpose |
|------|---------|
| `package.json` | Dependencies (ink, React, TypeScript) with `{{APP_NAME}}` replaced |
| `tsconfig.json` | TypeScript config (ES2022, NodeNext, react-jsx) |
| `src/cli.tsx` | Entry point with alternate screen buffer |
| `src/App.tsx` | Router with ScrollView |
| `src/cli_app_state.tsx` | State engine |
| `src/cli_app_theme.tsx` | Theme constants |
| `src/cli_app_components.tsx` | UI components |
| `src/screens/Home.tsx` | Home screen with `{{APP_NAME}}` replaced |
| `src/screens/Example.tsx` | Example screen |
| `README.md` | Project readme with `{{APP_NAME}}` replaced |

### cli_web_scaffold

Generates a new service adapter project for wrapping web services.

**Usage:** `cli_web_scaffold <service-name>`

**Generated files:**

| File | Purpose |
|------|---------|
| `package.json` | Dependencies with `{{SERVICE_NAME}}` replaced |
| `tsconfig.json` | TypeScript config |
| `src/adapter.tsx` | Service adapter (edit this to add logic) |
| `src/index.ts` | Entry point |
| `src/types.ts` | Type definitions |
| `README.md` | Project readme |

## Deployment

### Cloudflare Workers

- **URL:** `https://bottel-api.cenconq.workers.dev`
- **Worker name:** `bottel-api`
- **Compatibility date:** `2025-04-01`
- **Entry point:** `src/index.ts`

### Cloudflare D1

- **Database name:** `bottel-db`
- **Database ID:** `6c7b56ca-afb3-4bf6-b6a2-3cee5bdca4e2`
- **Binding:** `DB`

### Wrangler Commands

```bash
cd backend

# Local development
npm run dev                    # wrangler dev

# Database management
npm run db:migrate             # apply schema.sql to local D1
npm run db:seed                # seed sample data to local D1

# Production deployment
npm run deploy                 # wrangler deploy
```

## Development Setup

### Prerequisites

- Node.js 22+ (via nvm: `nvm use 22`)
- npm

### Install

```bash
# Frontend
npm install

# Backend
cd backend && npm install
```

### Run Frontend

```bash
npm run dev                    # connects to remote backend by default
```

### Run Backend Locally

```bash
cd backend
npm run db:migrate             # first time only
npm run db:seed                # first time only
npm run dev                    # starts local Workers at http://localhost:8787
```

### Point Frontend to Local Backend

```bash
BOTTEL_API_URL=http://localhost:8787 npm run dev
```

### Build

```bash
npm run build                  # tsc → dist/
```

### Type Check

```bash
npx tsc --noEmit
```

## Testing

- **Framework:** vitest 4.x
- **Test count:** 84 tests across 7 files
- **Run:** `npm test` (alias for `vitest run`)

| Test File | Coverage |
|-----------|----------|
| `app.test.ts` | App component rendering |
| `auth.test.ts` | Key generation, import, persistence |
| `bot-usage.test.ts` | End-to-end bot usage scenarios |
| `cli-app-state.test.ts` | State reducer, navigation, actions |
| `fullscreen.test.ts` | Alternate screen buffer behavior |
| `navigation.test.ts` | Screen navigation flows |
| `store-data.test.ts` | Store data format validation |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate lists |
| `Enter` | Select / confirm |
| `Esc` | Go back |
| `/` | Open search (from Home) |
| `q` | Quit app (from Home) |
| `←` / `→` | Navigate confirm buttons (Submit screen) |
| `PageUp` / `PageDown` | Scroll viewport 10 lines |
| Mouse wheel | Scroll viewport 3 lines |

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Cyan | `#48dbfb` | Primary highlight, selected items, logo |
| Blue | `#54a0ff` | Secondary, breadcrumb inactive |
| Pink | `#ff9ff3` | Accent, branding text |
| Yellow | `#feca57` | Star ratings |
| Green | `#2ed573` | Verified badge, success messages |
| Red | `#ff6b6b` | Error messages |
| Purple | `#5f27cd` | Borders, capability tags |
| Orange | `#ff9f43` | Reserved |
| Gray | `gray` | Dim borders, dim text |

---

## Changelog

### v0.2.0 -- Backend + Auth + Submit (2026-04-05)

- Cloudflare Workers backend with Hono (7 API endpoints)
- Cloudflare D1 database (3 tables: apps, users, installs)
- Ed25519 key pair authentication (generate, import, persist)
- Auth screen (generate key, import key, show key, regenerate, logout)
- Submit screen (6-step form: name, slug, description, category, version, confirm)
- API client with snake_case to camelCase mapping
- Auth middleware with fingerprint/signature headers
- Install/uninstall toggle with server-side tracking
- Reusable packages: cli_app_state, cli_app_theme, cli_app_components
- Scaffold packages: cli_app_scaffold, cli_web_scaffold
- Fullscreen alternate screen buffer with SGR mouse tracking
- ScrollView-based scrolling via ink-scroll-view
- 84 tests across 7 test files (vitest)

### v0.1.0 -- Initial Scaffold (2026-04-04)

- Project setup: TypeScript, ink, React
- Core components: Logo, StatusBar, AgentCard
- Screens: Home (featured/trending/categories), Browse, Search
- Sample data: 15 agents across 6 categories
- Alternate screen buffer for fullscreen experience
- Rainbow ASCII logo with gradient bar
