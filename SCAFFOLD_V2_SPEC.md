# Scaffold v2 Spec — `@bottel/cli-app-scaffold` upgrade

Owner: PM (this doc) → handed off to implementation agents.
Status: Draft for build.
Date: 2026-04-06.

## Goals

Today, `apps/hello`, `apps/chat`, and `apps/social` each invent their own
layout under `src/`. They roughly converge on `cli.tsx`, `App.tsx`, `screens/`,
`lib/` — but nothing is documented and nothing is enforced. This spec defines:

1. A **STRUCTURE.md** convention doc shipped inside the scaffold package.
2. A **`create-bottel-app`** generator package (`npx create-bottel-app my-bot`).
3. Three **optional scaffold helpers** (`useApi`, `useToast`, `useFocusable`),
   evaluated for v2 inclusion.

Non-goals: rewriting existing apps, adding a plugin system, supporting non-ink
frontends.

---

## 1. STRUCTURE.md

**Location:** `packages/cli-app-scaffold/STRUCTURE.md`. Linked from the
package README and from `create-bottel-app`'s generated README.

### Recommended layout

```
my-bot/
├── src/
│   ├── cli.tsx              ← entry: render(<App />)
│   ├── App.tsx              ← router: createStore + screen switching
│   ├── screens/             ← top-level pages (one file per screen)
│   ├── components/          ← reusable UI specific to this app
│   ├── hooks/               ← reusable logic (useFoo.ts)
│   ├── lib/                 ← services: api.ts, auth.ts, format.ts
│   └── types.ts             ← shared TS types/interfaces
├── package.json
├── tsconfig.json
└── README.md
```

### What goes where

- **`cli.tsx`** — Two lines essentially: `render(<App />)`. No logic. This is
  the binary entrypoint declared in `package.json#bin`.
- **`App.tsx`** — Calls `createStore(...)`, declares the screen registry,
  switches on `store.screen`. Owns top-level keybindings (quit, back).
- **`screens/`** — One `.tsx` per screen. A screen reads from the store,
  composes components, and dispatches store actions or calls hooks. Screens
  must not import from sibling screens — route via the store.
- **`components/`** — App-specific reusable UI. Anything generic enough for
  multiple apps belongs back in `@bottel/cli-app-scaffold`, not here.
- **`hooks/`** — `useThing.ts` files. Wrap async work, focus, timers. Hooks
  may import from `lib/` and from each other; they must not import screens.
- **`lib/`** — Pure-ish service modules. `api.ts` (HTTP client), `auth.ts`
  (Ed25519 keys), `format.ts` (string helpers). No React imports here.
- **`types.ts`** — Cross-cutting types (`Message`, `User`, `Screen`). Tiny
  apps can inline; once you're past ~5 shared types, extract.

### Layer interaction

```
screens  →  hooks  →  lib
   ↓         ↓
components  store (createStore)
```

Strict rules: `lib/` never imports React. `hooks/` never imports screens.
Screens never import other screens. The store is the only cross-screen channel.

### MVC analogy (loose)

- **Model** = the store (`createStore`) + `lib/` services.
- **View** = `screens/` and `components/`.
- **Controller** = `hooks/` and the store's reducers/actions.

The analogy is just a teaching aid. We do **not** want classical MVC
controllers — bottel apps are functional/declarative.

### Why this structure

- **Find-stuff-fast.** New contributor knows exactly where a new screen,
  service, or hook lives within 30 seconds.
- **Testability.** `lib/` is pure TS and trivially unit-testable. Hooks are
  testable in isolation with `ink-testing-library`.
- **Separation of concerns.** UI churn doesn't touch services; service swaps
  don't touch UI.

### What NOT to do

- No MVC-style controller classes.
- No React class components.
- No global mutable state outside the `createStore` instance.
- No reaching across screens (`import Home from '../screens/Home'`).
- No HTTP or fs calls inside components/screens — push them into `lib/`
  and surface via a hook.

---

## 2. `create-bottel-app` generator

**Location:** `packages/create-bottel-app/`.

### Usage

```bash
npx create-bottel-app my-bot
cd my-bot
npm run dev
```

### Behavior

1. Read project name from `process.argv[2]`. Validate (npm-package-name rules).
   Refuse if directory exists and is non-empty.
2. `mkdir my-bot/` and copy templates from `templates/default/`, running
   `.replace()` on each file for the placeholders below.
3. Run `npm install` in the new directory (spawn, inherit stdio). Skip with
   `--no-install` flag.
4. `git init` (best-effort, ignore failure).
5. Print next steps: `cd my-bot && npm run dev`.

### Generated files

```
my-bot/
├── package.json             ← name, bin, deps on @bottel/cli-app-scaffold + ink + react
├── tsconfig.json            ← ESM, NodeNext, jsx: react-jsx
├── .gitignore               ← node_modules, dist, .env
├── LICENSE                  ← MIT, year + holder placeholder
├── README.md                ← quickstart, link to STRUCTURE.md
├── src/
│   ├── cli.tsx              ← #!/usr/bin/env node + render(<App/>)
│   ├── App.tsx              ← createStore + Home screen
│   ├── screens/
│   │   └── Home.tsx         ← "Hello from {{projectName}}"
│   ├── components/.gitkeep
│   ├── hooks/.gitkeep
│   ├── lib/
│   │   └── auth.ts          ← Ed25519 starter, copied verbatim from apps/hello
│   └── types.ts             ← empty stub with one example type
```

### Template placeholders

String-replace only. No engine. Tokens:

- `{{projectName}}`
- `{{projectNameSafe}}` (for identifiers)
- `{{year}}`
- `{{scaffoldVersion}}` (read from generator's own dep list at publish time)

### Package shape

- **ESM-only TypeScript**, compiled to `dist/`.
- **Single bin entry:** `bin/create-bottel-app.js` (a one-line shim that
  imports the compiled CLI).
- **Templates:** stored as real files under `templates/default/` and shipped
  via `package.json#files`. Read at runtime with `fs.readFile`. Files use a
  `.tmpl` suffix only when they would otherwise confuse tooling
  (e.g. `_gitignore` → renamed to `.gitignore` on write, since npm strips
  `.gitignore` from published tarballs).
- **Dependencies:** keep tiny — `kleur` for color, nothing else. No
  `commander`, no `prompts` (positional arg only in v1).

### Decisions

- **String templating, not Handlebars/EJS.** Three placeholders, three files
  with substitutions. A template engine is more code than the substitutions.
- **No interactive prompts in v1.** Positional name arg + flags. Prompts can
  come in v1.1 if users ask.
- **`npm install` only, not pnpm/yarn detection.** Bottel monorepo standardizes
  on npm; detection adds bug surface for negligible value.
- **Templates are real files, not inline strings.** Easier to lint, easier to
  open in an editor, easier to diff.

---

## 3. Scaffold helpers (v2 candidates)

These would live in `packages/cli-app-scaffold/src/hooks.tsx` and re-export
from `index.tsx`.

### `useApi(fn, deps)` — **INCLUDE in v2**

```ts
function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[]
): { data: T | null; loading: boolean; error: Error | null; refetch: () => void };
```

**Why:** every existing app reimplements this — `chat` and `social` both have
near-identical loading/error state machines around their `lib/api.ts` calls.
Centralizing kills ~30 lines per screen and standardizes error handling.

**Example:**

```tsx
const { data: messages, loading, error } = useApi(() => api.listMessages(), []);
if (loading) return <Text>Loading…</Text>;
if (error) return <Text color="red">{error.message}</Text>;
return <MessageList items={messages} />;
```

### `useToast()` — **INCLUDE in v2**

```ts
function useToast(): {
  toast: { message: string; kind: 'info' | 'error' | 'success' } | null;
  show: (message: string, kind?: ToastKind, ms?: number) => void;
};
```

**Why:** transient "Saved!" / "Failed to send" messages currently get glued
into screen state by hand. A 30-line hook + a `<Toast />` component in
scaffold removes the boilerplate. Pairs with a top-level `<Toast />` slot
that `App.tsx` mounts once.

**Example:**

```tsx
const { show } = useToast();
await api.send(text);
show('Sent', 'success');
```

### `useFocusable(id)` — **DEFER to v2.1**

```ts
function useFocusable(id: string): { isFocused: boolean; focus: () => void };
```

**Why defer:** ink already ships `useFocus`/`useFocusManager`. The win here
is auto-managing focus *groups* across screens, but we don't yet have two
apps that need it. Revisit once a third app hits the same problem — premature
abstraction otherwise.

---

## Rollout

1. Implementation agent A: write `STRUCTURE.md`.
2. Implementation agent B: scaffold `create-bottel-app` per section 2.
3. Implementation agent C: add `useApi` + `useToast` to scaffold, re-export,
   bump scaffold to `0.2.0`.
4. Follow-up PR: migrate `apps/hello` to use `useApi`/`useToast` as proof.
   Do **not** retrofit `chat`/`social` in the same PR — keep diffs reviewable.

## Out of scope

- Migrating existing apps' folder structure (they already mostly conform).
- Test runner / CI templates in the generator (v1.1).
- Plugin/middleware system for the store.
