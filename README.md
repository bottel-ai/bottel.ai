# bottel.ai

**The Bot CLI Internet Portal**

bottel.ai is a CLI app store and browser for AI agents. Agents discover, install, and run CLI apps -- just like humans browse the App Store on their phones.

The terminal is the bot's browser. bottel is the bot's internet portal.

```
Human world                    Bot world (bottel.ai)
-----------                    ---------------------
iPhone / Browser          →    Terminal
App Store                 →    bottel
Chrome / Safari           →    google-cli
Gmail                     →    email-cli
Slack                     →    slack-cli
```

Every service that humans access through apps, bots access through CLI apps installed via bottel. No HTML. No images. No CSS. Just clean, structured, machine-readable output.

## Features

- **Store UI** -- Fullscreen terminal UI to browse, search, and discover CLI apps
- **Browse by category** -- Apps organized into categories (Development, Security, Data, etc.)
- **Search** -- Full-text search across app names and descriptions
- **Ed25519 auth** -- Passwordless key pair authentication (generate, import, or regenerate keys)
- **Submit apps** -- Multi-step form to submit new CLI apps to the store (requires auth)
- **Install/uninstall** -- Toggle installs per user, tracked server-side
- **Ratings and reviews** -- Star ratings and install counts for trust signals
- **Verified publishers** -- Verified badge for trusted apps
- **Mouse wheel scrolling** -- SGR mouse tracking for scrollable viewports
- **Remote backend** -- Connects to Cloudflare Workers API out of the box

## Quick Start

```bash
npm install
npm run dev
```

That's it. The CLI connects to the remote backend at `https://bottel-api.cenconq.workers.dev` automatically. No local backend setup needed.

## What It Looks Like

```
  ██████╗   ██████╗  ████████╗████████╗███████╗██╗         █████╗ ██╗
  ██╔══██╗ ██╔═══██╗ ╚══██╔══╝╚══██╔══╝██╔════╝██║        ██╔══██╗██║
  ██████╔╝ ██║   ██║    ██║      ██║   █████╗  ██║        ███████║██║
  ██╔══██╗ ██║   ██║    ██║      ██║   ██╔══╝  ██║        ██╔══██║██║
  ██████╔╝ ╚██████╔╝    ██║      ██║   ███████╗███████╗██╗██║  ██║██║
  ╚═════╝   ╚═════╝     ╚═╝      ╚═╝   ╚══════╝╚══════╝╚═╝╚═╝  ╚═╝╚═╝

                  The Bot CLI Internet Portal
        Discover, install, and run CLI apps — built for bots.

┌─ bottel.ai ──────────────────────────── ○ not logged in ─┐

  15 apps available

  ▶ Menu
    > Home              Store front
      Browse            Browse by category
      Search            Find apps
      Submit            Submit your app
      Auth              Login / manage keys
      Installed         Your apps
      Settings          Preferences
      Exit              Quit bottel

  ──────────────────────────────────────────────────────────

  Featured Agents
  ╭──────────────────────╮  ╭──────────────────────╮
  │ Code Reviewer         │  │ Data Analyst          │
  │ ★★★★★ 4.9            │  │ ★★★★★ 4.7            │
  │ by cenconq            │  │ by cenconq            │
  │ 45.2k installs        │  │ 12.1k installs        │
  ╰──────────────────────╯  ╰──────────────────────╯

  Trending
  ❯ 1. Code Reviewer     ★★★★★ 4.9   45.2k installs ✓
    2. Translator         ★★★★★ 4.8   38.5k installs ✓
    3. Data Analyst       ★★★★★ 4.7   12.1k installs

  Categories
    Development (5)
    Security (3)
    Data (2)

  Esc back · ↑↓ nav · Enter select · / search · q quit
```

## Architecture

```
┌─────────────────────────────┐
│   CLI Frontend (ink/React)  │  TypeScript, fullscreen TUI
│   npm run dev               │
└────────────┬────────────────┘
             │ HTTP (fetch)
             ▼
┌─────────────────────────────┐
│  API (Cloudflare Workers)   │  Hono, 7 endpoints
│  bottel-api.cenconq.workers │
└────────────┬────────────────┘
             │ D1 bindings
             ▼
┌─────────────────────────────┐
│  Database (Cloudflare D1)   │  SQLite, 3 tables
│  bottel-db                  │
└─────────────────────────────┘
```

## Project Structure

```
src/
├── cli.tsx                  # Entry point (alternate screen buffer + mouse tracking)
├── App.tsx                  # Router (ScrollView viewport + screen switching)
├── cli_app_state.tsx        # State engine (useReducer + context, 8 screen states)
├── cli_app_theme.tsx        # Theme (colors, column widths, box styles, formatters)
├── cli_app_components.tsx   # Reusable components (Logo, StatusBar, Cursor, etc.)
├── components/
│   └── AgentCard.tsx        # App card (compact + full modes)
├── screens/
│   ├── Home.tsx             # Store front (menu, featured, trending, categories)
│   ├── Browse.tsx           # Browse by category
│   ├── Search.tsx           # Full-text search
│   ├── AgentDetail.tsx      # App detail page
│   ├── Installed.tsx        # User's installed apps
│   ├── Settings.tsx         # Preferences
│   ├── Auth.tsx             # Key pair management (generate/import/logout)
│   └── Submit.tsx           # Multi-step app submission form
├── lib/
│   ├── api.ts               # API client (7 endpoints, snake_case → camelCase mapping)
│   └── auth.ts              # Ed25519 key pair auth (generate, import, persist via conf)
├── data/
│   └── store.json           # Sample store data (fallback)
└── __tests__/
    ├── app.test.ts           # App component tests
    ├── auth.test.ts          # Auth module tests
    ├── bot-usage.test.ts     # Bot usage scenario tests
    ├── cli-app-state.test.ts # State reducer tests
    ├── fullscreen.test.ts    # Fullscreen buffer tests
    ├── navigation.test.ts    # Navigation flow tests
    └── store-data.test.ts    # Store data tests

backend/
├── src/
│   ├── index.ts             # Hono app (7 API routes + error handling)
│   ├── middleware/
│   │   └── auth.ts          # Auth middleware (X-Fingerprint + X-Signature)
│   └── db/
│       ├── schema.sql       # D1 schema (3 tables, 3 indexes)
│       └── seed.sql         # Seed data
├── wrangler.toml            # Cloudflare Workers config
└── package.json

packages/
├── cli_app_scaffold/        # Scaffold a new CLI app (ink + React)
└── cli_web_scaffold/        # Scaffold a new service adapter
```

## Backend API

**Base URL:** `https://bottel-api.cenconq.workers.dev`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | No | Health check |
| `GET` | `/apps` | No | List/search/filter apps (`?q=`, `?category=`) |
| `GET` | `/apps/:slug` | No | Get single app by slug |
| `GET` | `/categories` | No | List categories with counts |
| `POST` | `/register` | No | Register public key (fingerprint + publicKey) |
| `POST` | `/apps` | Yes | Submit new app |
| `GET` | `/user/installs` | Yes | Get user's installed apps |
| `POST` | `/user/installs/:appId` | Yes | Toggle install/uninstall |

Auth headers for protected endpoints: `X-Fingerprint` and `X-Signature`.

## Auth (Ed25519 Key Pairs)

bottel uses passwordless Ed25519 key pair authentication:

1. **Generate** -- `crypto.generateKeyPairSync("ed25519")` creates a key pair
2. **Format** -- Public key is converted to SSH wire format (`ssh-ed25519 AAAA...`)
3. **Fingerprint** -- SHA256 hash of the public key blob (matches OpenSSH format: `SHA256:xxxx...`)
4. **Persist** -- Keys stored locally via `conf` (in `~/.config/bottel/config.json`)
5. **Register** -- Public key + fingerprint sent to `/register` endpoint
6. **Sign** -- Requests to protected endpoints include `X-Fingerprint` and `X-Signature` headers

Users can also import an existing private key (base64-encoded PKCS8 DER).

## Reusable Packages

### cli_app_state

State management engine using React `useReducer` + Context. Exports:

- `Screen` type (8 screens: home, browse, search, agent-detail, installed, settings, auth, submit)
- `AppState` interface with per-screen state slices
- `Action` union type (14 action types)
- `StoreProvider` component and `useStore()` hook
- Built-in history stack with `navigate()`, `goBack()`, `goHome()`

### cli_app_theme

Visual constants and formatters. Exports:

- `colors` -- 9 named colors (primary, secondary, accent, warning, success, error, border, orange, dimBorder)
- `columns` -- Fixed column widths for table-like layouts
- `boxStyle` -- Predefined ink `Box` border styles (header, card, cardActive, section, footer)
- `formatStars()`, `formatInstalls()`, `formatNumber()` -- Display formatters

### cli_app_components

Terminal UI components built on ink. Exports:

- `Cursor` -- Arrow indicator for list items
- `Breadcrumb` -- Navigation trail (Home > Browse > Development)
- `HelpFooter` -- Keyboard shortcut help text
- `Rating` -- Star rating display
- `InstallCount` -- Auto-formatted install count
- `VerifiedBadge` -- Green checkmark
- `Separator` -- Horizontal line
- `ScreenHeader` -- Bordered section title
- `Logo` -- Full ASCII art logo
- `CompactLogo` -- Single-line logo for small terminals
- `StatusBar` -- Top bar with app name and auth status

## Scaffold Packages

### cli_app_scaffold

Create a new CLI app with the bottel stack (ink + React + cli_app_state + cli_app_theme):

```bash
npx cli_app_scaffold my-app
cd my-app
npm install
npm run dev
```

Generates: `cli.tsx`, `App.tsx`, `cli_app_state.tsx`, `cli_app_theme.tsx`, `cli_app_components.tsx`, screens (`Home.tsx`, `Example.tsx`), `tsconfig.json`, `package.json`.

### cli_web_scaffold

Create a new bottel.ai service adapter (for wrapping a web service as a CLI tool):

```bash
npx cli_web_scaffold my-service
cd my-service
npm install
# Edit src/adapter.tsx with your service logic
npm run build
```

Generates: `adapter.tsx`, `index.ts`, `types.ts`, `tsconfig.json`, `package.json`.

## Development

### Frontend

```bash
npm install
npm run dev          # runs tsx src/cli.tsx
```

### Backend

```bash
cd backend
npm install
npm run dev          # runs wrangler dev (local Workers)
npm run db:migrate   # apply schema to local D1
npm run db:seed      # seed sample data
npm run deploy       # deploy to Cloudflare Workers
```

### Override API URL

```bash
BOTTEL_API_URL=http://localhost:8787 npm run dev
```

### Tests

```bash
npm test             # vitest run (84 tests across 7 files)
```

### Type Check

```bash
npx tsc --noEmit
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
| Persistent Config | conf | 15.x |
| CLI Runner | pastel | 4.x |
| Dev Runner | tsx | 4.x |
| Test Runner | vitest | 4.x |
| Backend Framework | Hono | 4.x |
| Backend Runtime | Cloudflare Workers | - |
| Database | Cloudflare D1 (SQLite) | - |
| Deployment | wrangler | 4.x |

## License

ISC
