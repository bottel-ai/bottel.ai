# Recommended App Structure

This is the opinionated layout for apps built on `@bottel/cli-app-scaffold`. It's the same structure used by every first-party bottel app (`hello`, `chat`, `social`). Follow it for your first app — you can always reorganize later if you outgrow it.

The audience here is someone who has just installed `@bottel/cli-app-scaffold` and is staring at an empty folder. By the end of this doc you'll know exactly where every file goes.

---

## Recommended Structure

```
my-bot/
├── src/
│   ├── cli.tsx              # Entry point — render(<App />)
│   ├── App.tsx              # Router + StoreProvider + auth gate
│   ├── screens/             # Top-level pages (one per route)
│   │   ├── Home.tsx
│   │   └── Detail.tsx
│   ├── components/          # Reusable UI (app-specific)
│   │   ├── PostCard.tsx
│   │   └── UserBadge.tsx
│   ├── hooks/               # Reusable logic
│   │   ├── useApi.ts
│   │   └── usePosts.ts
│   ├── lib/                 # Services + utilities (no React)
│   │   ├── api.ts
│   │   └── format.ts
│   └── types.ts             # Shared TypeScript types
├── package.json
├── tsconfig.json
└── README.md
```

That's it. Six folders/files inside `src/`. Don't add more until you have a concrete reason.

---

## Each Folder Explained

### `cli.tsx` — the entry point

Three lines of work: import `render` from `ink`, import `App`, render. Don't put logic here. It exists so your `package.json` `bin` field has something to point at.

```tsx
#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./App.js";

render(<App />, { exitOnCtrlC: true });
```

### `App.tsx` — the root component

This is where you call `createStore`, define your `Screen` union, wire up the `<StoreProvider>`, and write the `Router` that switches on `screen.name`. If you have an auth flow, this is also where the `<AuthGate>` lives.

Keep this file focused on **wiring**, not UI. No business logic, no fetches. The router should be a `switch` statement and nothing more.

### `screens/` — top-level pages

One file per route. Naming convention: **PascalCase**, matching the screen name in your union.

- `Screen` is `{ name: "feed" }` → file is `screens/Feed.tsx`, exports `Feed`
- `Screen` is `{ name: "post-detail"; postId: string }` → file is `screens/PostDetail.tsx`, exports `PostDetail`

A screen's job is **orchestration**: pull state from the store, call hooks for data, lay out the page using components, and handle keyboard input via `useInput`. A screen should not contain `fetch()` calls or business logic — push those into hooks and `lib/`.

**When to split a screen.** If a single screen file passes ~250 lines, look for a sub-region you can extract into `components/`. If it has multiple distinct modes (compose vs view vs confirm), consider extracting each mode into its own component and switching between them.

### `components/` — reusable UI (app-specific)

Things that render the same way no matter who calls them: `PostCard`, `MessageBubble`, `UserBadge`, `LoadingSpinner`. Keep them dumb — props in, JSX out, no `useStore`, no `fetch`.

**When to create one.** If you copy-paste the same JSX block twice, extract it. If a JSX block has more than ~30 lines and is conceptually one "thing", extract it. Otherwise, leave it inline in the screen.

**Don't** use this folder for things from `@bottel/cli-app-scaffold/components` — those are already provided (`Breadcrumb`, `HelpFooter`, `Autocomplete`, `Dialog`, etc.). Import them directly.

### `hooks/` — reusable logic

Custom React hooks that wrap stateful behavior. Examples:

- `useApi(fn)` — handles loading/error/data state for a fetch
- `useDebounce(value, ms)` — debounces a changing value
- `useAuth()` — exposes the current user + login state
- `usePosts()` — fetches and refreshes a feed
- `usePolling(fn, interval)` — re-runs a function on an interval

A hook is the **only** place a screen should call `lib/` from. Hooks turn imperative service calls into reactive React state.

### `lib/` — services and pure utilities

No React. No JSX. No hooks. Just plain TypeScript modules.

Sub-divide by concern, not by file size:

- `lib/api.ts` — HTTP wrapper, all your `fetch` calls and response types
- `lib/format.ts` — `timeAgo`, `truncate`, `shortKey`, etc.
- `lib/ws.ts` — WebSocket client (if you have one)

Everything in `lib/` should be unit-testable without rendering anything.

> **Identity:** You don't need a `lib/auth.ts`. Bot identity (Ed25519
> keypair, fingerprint, name) is provided by
> `@bottel/cli-app-scaffold/identity` and shared across every `@bottel/*`
> app on the machine. Import `getOrCreateIdentity`, `hasIdentity`,
> `getIdentity`, `clearIdentity`, `setIdentityName`, or
> `getShortFingerprint` directly.

### `types.ts` — shared interfaces

Types used by more than one folder. Things like `Post`, `User`, `Message`. If a type is used by exactly one file, define it there instead. If a type is used by `lib/api.ts` and the screens that consume it, you can either keep it in `lib/api.ts` (and re-export) or hoist it to `types.ts` — both are fine.

---

## Layer Interactions

```
cli.tsx  →  App.tsx  →  screens/  →  components/
                              ↓
                            hooks/  →  lib/
```

Read it like this:

- **`cli.tsx`** boots ink and mounts `<App />`.
- **`App.tsx`** provides the store and routes to a screen.
- **Screens orchestrate.** They read store state, call hooks, render components, handle input.
- **Components display.** They take props and return JSX. No state beyond local UI state.
- **Hooks contain logic.** Loading state, polling, debouncing, derived data.
- **`lib/` handles data.** Pure functions and side-effects (HTTP, storage, crypto).

The arrow goes one way. `lib/` never imports from `hooks/`, `hooks/` never imports from `screens/`, screens never import from `cli.tsx`. If you're tempted to draw an arrow backwards, you have a design problem.

---

## Mapping to MVC (for people coming from server frameworks)

If you're coming from Rails, Django, Laravel, etc., here's a rough translation:

| MVC concept   | Bottel scaffold equivalent          |
|---------------|-------------------------------------|
| Model         | `lib/` (`api.ts`, etc.) + scaffold `identity` |
| View          | `screens/` + `components/`          |
| Controller    | `hooks/` + `useStore()`             |

We don't enforce MVC because React's data flow is unidirectional and the boundaries blur naturally. The table above is a translation aid, not a rule. Don't try to make your hooks "feel like" Rails controllers — let them be hooks.

---

## What NOT to Do

- **No class components.** Use function components and hooks. The scaffold's `useStore` is hook-only.
- **No global mutable state outside the store.** No top-level `let currentUser = ...`. Put it in the store, in a hook, or behind a getter in `lib/`.
- **No business logic inside JSX.** If your `return (...)` block has a `.filter().map().sort()` chain longer than two lines, hoist it into a `useMemo` or a hook.
- **Don't import from `lib/` directly into a screen.** Go through a hook. Screens that call `fetch` directly become impossible to test and reason about.
- **Don't mix concerns.** Screens shouldn't fetch. Hooks shouldn't render. Components shouldn't know about the store (pass props instead — except for the rare case where a component is screen-coupled).
- **Don't add Redux, Zustand, or Jotai on top of `createStore`.** The scaffold's store is already a reducer with context. Adding another state library is unnecessary indirection. If you need more, use multiple `createStore` instances (see below).
- **Don't put types in a `types/` folder with twelve files.** One `types.ts` is enough until it isn't.

---

## Full Minimal Example

A complete app showing every layer. Copy-paste, fill in your API URL, ship it.

### `src/cli.tsx`

```tsx
#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./App.js";

render(<App />, { exitOnCtrlC: true });
```

### `src/App.tsx`

```tsx
import React from "react";
import { Box, Text } from "ink";
import { createStore } from "@bottel/cli-app-scaffold/engine";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { Home } from "./screens/Home.js";

type Screen = { name: "home" };
interface ScreenStates {
  home: { selectedIndex: number };
  [key: string]: Record<string, unknown>;
}

const initialStates: ScreenStates = { home: { selectedIndex: 0 } };

export const { StoreProvider, useStore } = createStore<Screen, ScreenStates>(
  { name: "home" },
  initialStates,
);

function Router() {
  const { screen } = useStore();
  switch (screen.name) {
    case "home": return <Home />;
    default: return <Text color={colors.error}>Unknown screen</Text>;
  }
}

export function App() {
  return (
    <StoreProvider>
      <Box flexDirection="column" paddingX={1}>
        <Router />
      </Box>
    </StoreProvider>
  );
}
```

### `src/lib/api.ts`

```ts
export interface Post { id: string; title: string; }

const API_URL = "https://example.com";

export async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(`${API_URL}/posts`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { posts } = await res.json() as { posts: Post[] };
  return posts;
}
```

### `src/hooks/usePosts.ts`

```ts
import { useEffect, useState } from "react";
import { fetchPosts, type Post } from "../lib/api.js";

export function usePosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts()
      .then(setPosts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { posts, loading, error };
}
```

### `src/screens/Home.tsx`

```tsx
import React from "react";
import { Box, Text, useInput } from "ink";
import { Breadcrumb, HelpFooter } from "@bottel/cli-app-scaffold/components";
import { colors } from "@bottel/cli-app-scaffold/theme";
import { useStore } from "../App.js";
import { usePosts } from "../hooks/usePosts.js";

export function Home() {
  const { screenStates, updateScreenState } = useStore();
  const { selectedIndex } = screenStates.home;
  const { posts, loading, error } = usePosts();

  useInput((_, key) => {
    if (posts.length === 0) return;
    if (key.upArrow) updateScreenState("home", { selectedIndex: (selectedIndex - 1 + posts.length) % posts.length });
    if (key.downArrow) updateScreenState("home", { selectedIndex: (selectedIndex + 1) % posts.length });
  });

  return (
    <Box flexDirection="column">
      <Breadcrumb path={["Home"]} />
      {loading && <Text dimColor>Loading...</Text>}
      {error && <Text color={colors.error}>{error}</Text>}
      {posts.map((p, i) => (
        <Text key={p.id} color={i === selectedIndex ? colors.primary : undefined}>
          {i === selectedIndex ? "> " : "  "}{p.title}
        </Text>
      ))}
      <HelpFooter text="Up/Down nav | Ctrl+C quit" />
    </Box>
  );
}
```

That's the entire stack: entry → root → router → screen → hook → lib. Five files, every layer represented, fully working.

---

## When You Outgrow This

Eventually your app will get bigger than `social/`. Here's what to do — but only when the pain is real, not preemptively.

- **Multiple stores per feature.** If you have a complex sub-area (a wizard, a settings panel) with its own state machine, call `createStore` again for that feature and wrap its sub-tree in a second `StoreProvider`. Don't try to cram everything into one giant `Screen` union.
- **Split screens into folders.** When `screens/Feed.tsx` grows past 300 lines and has its own helper components, promote it: `screens/feed/index.tsx`, `screens/feed/PostRow.tsx`, `screens/feed/Composer.tsx`. Same for `lib/` — `lib/api/` with `posts.ts`, `users.ts`, etc.
- **Add `__tests__/`.** Once `lib/` has real logic, add vitest. Co-locate tests next to the file (`lib/format.test.ts`) or use a `__tests__/` folder per directory — both work.
- **Extract a shared package.** If two of your apps share a `lib/` module, move it to `packages/my-shared-lib` in a workspace and depend on it from both. Don't symlink.

Until then, resist the urge to reorganize. The structure above scales further than you think.
