# cli-app-scaffold — Architecture Spec

> Reusable TypeScript + ink framework for building terminal CLI apps with
> screen-based navigation, theming, and pre-built components.

Package location: `packages/cli-app-scaffold/`

---

## 1. Problem

`cli_app_state.tsx` hardcodes every bottel.ai screen, screen-state interface,
initial value, action type, and reducer branch. Adding a screen means editing
five places. The code cannot be reused by another app.

**Goal:** Extract a generic engine where the consuming app declares its own
screens and per-screen state, and the engine handles navigation, history,
and state updates automatically.

---

## 2. Package Structure

```
packages/cli-app-scaffold/
  package.json
  tsconfig.json
  src/
    theme.tsx        # colors, boxStyles, formatters (extensible)
    components.tsx   # Breadcrumb, Cursor, HelpFooter, Autocomplete, Dialog,
                     #   Separator, ScreenHeader (NO app-specific imports)
    engine.tsx       # createStore<ScreenMap, GlobalState?>() factory
    index.tsx        # barrel export
```

### package.json (key fields)

```json
{
  "name": "@bottel/cli-app-scaffold",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "react": ">=18",
    "ink": ">=5",
    "ink-text-input": ">=6"
  }
}
```

---

## 3. `src/theme.tsx` — Theming

Exports the same defaults as the current `cli_app_theme.tsx`, plus a merge
helper so consumers can override individual values.

### Types

```ts
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  warning: string;
  success: string;
  error: string;
  border: string;
  dimBorder: string;
}

export interface ThemeColumns {
  cursor: number;
  name: number;
  version: number;
}

export interface ThemeBoxStyles {
  header: { borderStyle: string; borderColor: string };
  section: { borderStyle: string; borderColor: string };
}

export interface Theme {
  colors: ThemeColors;
  columns: ThemeColumns;
  boxStyle: ThemeBoxStyles;
}
```

### Exports

```ts
/** Default theme — identical to current bottel.ai values */
export const defaultTheme: Theme;

/** Deep-merge a partial override onto the default theme */
export function createTheme(overrides: DeepPartial<Theme>): Theme;

/** React context so components read the active theme */
export const ThemeContext: React.Context<Theme>;
export function ThemeProvider(props: {
  theme?: DeepPartial<Theme>;
  children: React.ReactNode;
}): JSX.Element;
export function useTheme(): Theme;

/** Utility — unchanged from current code */
export function formatNumber(n: number): string;
```

### Usage

```tsx
// Use defaults
<ThemeProvider>
  <App />
</ThemeProvider>

// Override just one color
<ThemeProvider theme={{ colors: { primary: "#00ff00" } }}>
  <App />
</ThemeProvider>
```

---

## 4. `src/components.tsx` — Reusable Components

Same components as current `cli_app_components.tsx` with two changes:

1. **Remove** `Logo` component entirely (app-specific branding).
2. **Remove** the `import { isLoggedIn, getShortFingerprint }` — no auth dependency.
3. All components read colors/columns from `useTheme()` instead of direct
   imports, so they respect the consumer's theme overrides.

### Exported Components

| Component | Props | Notes |
|---|---|---|
| `Cursor` | `{ active: boolean }` | Arrow indicator |
| `Breadcrumb` | `{ path: string[] }` | Navigation trail |
| `HelpFooter` | `{ text: string }` | Keyboard hints |
| `Separator` | `{ width?: number }` | Horizontal rule |
| `ScreenHeader` | `{ title: string; style?: "header" \| "section" }` | Bordered header |
| `Autocomplete` | `AutocompleteProps` (unchanged interface) | Search input with dropdown |
| `Dialog` | `DialogProps` (unchanged interface) | Modal dialog |

### AutocompleteItem (unchanged)

```ts
export interface AutocompleteItem {
  id: string;
  label: string;
  detail?: string;
}
```

---

## 5. `src/engine.tsx` — Navigation Engine (core design)

### 5.1 Concepts

The engine is a factory that accepts a **screen-state map** — a plain object
type where each key is a screen name and the value is that screen's state
interface. The factory produces a typed React context, provider, and hook.

Screens can carry **route params** (like `agentId`, `chatId`). These are
declared separately from screen state.

### 5.2 Types

```ts
/**
 * ScreenDef — maps each screen name to its route params and local state.
 *
 * Example:
 *   {
 *     home:      { params: {};                state: { selectedIndex: number } };
 *     chatView:  { params: { chatId: string }; state: { inputText: string } };
 *   }
 */
export type ScreenDef = Record<
  string,
  { params: Record<string, string>; state: Record<string, unknown> }
>;

/** Extract the union of all screen route objects */
export type ScreenRoute<D extends ScreenDef> = {
  [K in keyof D & string]: { name: K } & D[K]["params"];
}[keyof D & string];

/** Extract per-screen state slice map */
export type ScreenStateMap<D extends ScreenDef> = {
  [K in keyof D & string]: D[K]["state"];
};

/** Full app state managed by the engine */
export interface EngineState<D extends ScreenDef, G extends Record<string, unknown> = {}> {
  /** Currently active screen */
  screen: ScreenRoute<D>;
  /** Navigation history stack */
  history: ScreenRoute<D>[];
  /** Per-screen state, keyed by screen name */
  screenState: ScreenStateMap<D>;
  /** App-level global state (optional, consumer-defined) */
  global: G;
}
```

### 5.3 Actions

The engine provides four built-in action types. Consumers can extend with
custom actions for global state mutations.

```ts
/** Built-in actions the engine handles */
export type EngineAction<D extends ScreenDef> =
  | { type: "NAVIGATE"; screen: ScreenRoute<D> }
  | { type: "GO_BACK" }
  | { type: "GO_HOME" }
  | {
      type: "UPDATE_SCREEN_STATE";
      screen: keyof D & string;
      state: Partial<D[typeof screen]["state"]>;
    };

/**
 * The full action union = engine actions + consumer's custom actions.
 * Custom actions let the consumer mutate global state.
 */
export type StoreAction<D extends ScreenDef, CustomAction = never> =
  | EngineAction<D>
  | CustomAction;
```

### 5.4 `createStore()` Factory

```ts
export interface StoreConfig<
  D extends ScreenDef,
  G extends Record<string, unknown> = {},
  CustomAction = never,
> {
  /** Per-screen initial state values */
  initialScreenState: ScreenStateMap<D>;

  /** The home screen route (GO_HOME and empty-history fallback) */
  homeScreen: ScreenRoute<D>;

  /** Initial global state (default: {}) */
  initialGlobal?: G;

  /**
   * Optional reducer for custom actions that mutate global state.
   * Engine actions (NAVIGATE, GO_BACK, etc.) are handled automatically
   * and never reach this reducer.
   */
  customReducer?: (
    state: EngineState<D, G>,
    action: CustomAction,
  ) => EngineState<D, G>;

  /**
   * Optional set of screen names whose state should NOT be reset on
   * forward NAVIGATE. By default, NAVIGATE resets the target screen's
   * state to its initial value. Screens listed here keep their state.
   *
   * (Mirrors the current "search: don't reset" behavior.)
   */
  preserveOnNavigate?: Set<keyof D & string>;
}

export interface StoreHandle<
  D extends ScreenDef,
  G extends Record<string, unknown> = {},
  CustomAction = never,
> {
  /** Wrap your app tree in this provider */
  StoreProvider: React.FC<{ children: React.ReactNode }>;

  /** Hook — must be called inside StoreProvider */
  useStore: () => {
    state: EngineState<D, G>;
    dispatch: React.Dispatch<StoreAction<D, CustomAction>>;
    navigate: (screen: ScreenRoute<D>) => void;
    goBack: () => void;
    goHome: () => void;
  };
}

export function createStore<
  D extends ScreenDef,
  G extends Record<string, unknown> = {},
  CustomAction = never,
>(config: StoreConfig<D, G, CustomAction>): StoreHandle<D, G, CustomAction>;
```

### 5.5 Built-in Reducer Behavior

| Action | Behavior |
|---|---|
| `NAVIGATE` | Push current screen onto history. Set `screen` to target. Reset target's `screenState[name]` to its initial value **unless** the screen is in `preserveOnNavigate`. |
| `GO_BACK` | Pop from history. If history is empty, go to `homeScreen`. Screen state is **not** reset (preserved on back-navigation). |
| `GO_HOME` | Clear history. Set screen to `homeScreen`. |
| `UPDATE_SCREEN_STATE` | Shallow-merge partial state into `screenState[screen]`. |

Custom actions are forwarded to `customReducer` if provided; otherwise ignored.

---

## 6. `src/index.tsx` — Barrel Export

```ts
// Theme
export { defaultTheme, createTheme, ThemeProvider, useTheme, formatNumber } from "./theme.js";
export type { Theme, ThemeColors, ThemeColumns, ThemeBoxStyles } from "./theme.js";

// Components
export {
  Cursor, Breadcrumb, HelpFooter, Separator,
  ScreenHeader, Autocomplete, Dialog,
} from "./components.js";
export type { AutocompleteItem } from "./components.js";

// Engine
export { createStore } from "./engine.js";
export type {
  ScreenDef, ScreenRoute, ScreenStateMap,
  EngineState, EngineAction, StoreAction,
  StoreConfig, StoreHandle,
} from "./engine.js";
```

---

## 7. Migration Path for bottel.ai

After the scaffold package is built, bottel.ai's `cli_app_state.tsx` becomes
a thin consumer:

```ts
import { createStore, type ScreenDef } from "@bottel/cli-app-scaffold";

// 1. Declare screen definitions
type Screens = {
  home:          { params: {};                       state: HomeState };
  search:        { params: {};                       state: SearchState };
  "agent-detail":{ params: { agentId: string };      state: AgentDetailState };
  installed:     { params: {};                       state: InstalledState };
  settings:      { params: {};                       state: SettingsState };
  auth:          { params: {};                       state: AuthScreenState };
  submit:        { params: {};                       state: SubmitState };
  "my-apps":     { params: {};                       state: MyAppsState };
  "chat-list":   { params: {};                       state: ChatListState };
  "chat-view":   { params: { chatId: string };       state: ChatViewState };
  "profile-setup":{ params: {};                      state: ProfileSetupState };
  social:        { params: {};                       state: SocialState };
  "post-detail": { params: { postId: string };       state: PostDetailState };
  "bot-profile": { params: { fingerprint: string };  state: {} };
};

// 2. Custom global state + actions (replaces INSTALL_AGENT / UNINSTALL_AGENT)
interface GlobalState {
  installed: Set<string>;
}

type CustomAction =
  | { type: "INSTALL_AGENT"; agentId: string }
  | { type: "UNINSTALL_AGENT"; agentId: string };

// 3. Create the store
const { StoreProvider, useStore } = createStore<Screens, GlobalState, CustomAction>({
  homeScreen: { name: "home" },
  initialScreenState: {
    home: { selectedIndex: 0 },
    search: { query: "", selectedIndex: 0, page: 0, inputFocused: true },
    // ... rest of initial values (unchanged from current code)
  },
  initialGlobal: {
    installed: new Set(["code-reviewer", "translator", "data-analyst"]),
  },
  preserveOnNavigate: new Set(["search"]),
  customReducer: (state, action) => {
    switch (action.type) {
      case "INSTALL_AGENT": {
        const installed = new Set(state.global.installed);
        installed.add(action.agentId);
        return { ...state, global: { ...state.global, installed } };
      }
      case "UNINSTALL_AGENT": {
        const installed = new Set(state.global.installed);
        installed.delete(action.agentId);
        return { ...state, global: { ...state.global, installed } };
      }
    }
  },
});

export { StoreProvider, useStore };
```

**What changes in screen components:**
- `state.search.query` becomes `state.screenState.search.query`
- `dispatch({ type: "UPDATE_SEARCH", state: { query } })` becomes
  `dispatch({ type: "UPDATE_SCREEN_STATE", screen: "search", state: { query } })`
- `state.installed` becomes `state.global.installed`

Logo component stays in bottel.ai's own code (not in the scaffold).

---

## 8. Proof-of-Concept: `apps/chat/`

A standalone mini-app that imports from the scaffold and talks to the same
bottel.ai API. Proves the scaffold works independently.

### Structure

```
apps/chat/
  package.json
  tsconfig.json
  src/
    app.tsx          # entry point, wraps with StoreProvider + ThemeProvider
    store.ts         # createStore call for 2 screens
    screens/
      chat-list.tsx  # list of conversations
      chat-view.tsx  # single conversation thread
```

### Screen Definitions

```ts
// store.ts
import { createStore } from "@bottel/cli-app-scaffold";

type Screens = {
  "chat-list": { params: {}; state: { selectedIndex: number } };
  "chat-view": { params: { chatId: string }; state: { inputText: string } };
};

const { StoreProvider, useStore } = createStore<Screens>({
  homeScreen: { name: "chat-list" },
  initialScreenState: {
    "chat-list": { selectedIndex: 0 },
    "chat-view": { inputText: "" },
  },
});

export { StoreProvider, useStore };
```

### App Entry

```tsx
// app.tsx
import React from "react";
import { render } from "ink";
import { ThemeProvider } from "@bottel/cli-app-scaffold";
import { StoreProvider, useStore } from "./store.js";
import { ChatList } from "./screens/chat-list.js";
import { ChatView } from "./screens/chat-view.js";

function Router() {
  const { state } = useStore();
  switch (state.screen.name) {
    case "chat-list": return <ChatList />;
    case "chat-view": return <ChatView chatId={state.screen.chatId} />;
  }
}

render(
  <ThemeProvider>
    <StoreProvider>
      <Router />
    </StoreProvider>
  </ThemeProvider>
);
```

### Chat List Screen

```tsx
// screens/chat-list.tsx
import React from "react";
import { Box, Text, useInput } from "ink";
import {
  Breadcrumb, Cursor, HelpFooter, ScreenHeader, useTheme,
} from "@bottel/cli-app-scaffold";
import { useStore } from "../store.js";

export function ChatList() {
  const { state, dispatch, navigate } = useStore();
  const { selectedIndex } = state.screenState["chat-list"];
  const theme = useTheme();

  // Fetch conversations from API...
  const chats = [/* fetched data */];

  useInput((_input, key) => {
    if (key.downArrow) {
      dispatch({
        type: "UPDATE_SCREEN_STATE",
        screen: "chat-list",
        state: { selectedIndex: Math.min(selectedIndex + 1, chats.length - 1) },
      });
    }
    if (key.upArrow) {
      dispatch({
        type: "UPDATE_SCREEN_STATE",
        screen: "chat-list",
        state: { selectedIndex: Math.max(selectedIndex - 1, 0) },
      });
    }
    if (key.return && chats[selectedIndex]) {
      navigate({ name: "chat-view", chatId: chats[selectedIndex].id });
    }
  });

  return (
    <Box flexDirection="column">
      <Breadcrumb path={["Chats"]} />
      <ScreenHeader title="Conversations" />
      {chats.map((chat, i) => (
        <Box key={chat.id}>
          <Cursor active={i === selectedIndex} />
          <Text color={i === selectedIndex ? theme.colors.primary : undefined}>
            {chat.name}
          </Text>
        </Box>
      ))}
      <HelpFooter text="↑↓ navigate  Enter select  q quit" />
    </Box>
  );
}
```

### Chat View Screen

```tsx
// screens/chat-view.tsx
import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Breadcrumb, ScreenHeader, HelpFooter, useTheme } from "@bottel/cli-app-scaffold";
import { useStore } from "../store.js";

export function ChatView({ chatId }: { chatId: string }) {
  const { state, dispatch, goBack } = useStore();
  const { inputText } = state.screenState["chat-view"];
  const theme = useTheme();

  // Fetch messages for chatId from API...
  const messages = [/* fetched data */];

  useInput((_input, key) => {
    if (key.escape) goBack();
  });

  return (
    <Box flexDirection="column">
      <Breadcrumb path={["Chats", chatId]} />
      <ScreenHeader title={`Chat: ${chatId}`} />
      {messages.map((msg, i) => (
        <Box key={i}>
          <Text bold color={theme.colors.secondary}>{msg.from}: </Text>
          <Text>{msg.text}</Text>
        </Box>
      ))}
      <Box borderStyle="round" borderColor={theme.colors.primary} paddingX={1}>
        <TextInput
          value={inputText}
          onChange={(v) =>
            dispatch({
              type: "UPDATE_SCREEN_STATE",
              screen: "chat-view",
              state: { inputText: v },
            })
          }
          placeholder="Type a message..."
        />
      </Box>
      <HelpFooter text="Esc back  Enter send" />
    </Box>
  );
}
```

---

## 9. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Factory function, not class** | Enables tree-shaking; no inheritance ceremony. Matches React idioms (hooks, context). |
| **`ScreenDef` type map** | Single source of truth for screen names, params, and state. TypeScript infers exact action/state types — no `any`. |
| **`screenState` is a flat record** | Avoids the current pattern of per-screen top-level keys (`search`, `home`, `installedScreen`). Clean, uniform access via `state.screenState[screenName]`. |
| **`preserveOnNavigate` opt-in set** | Default behavior (reset on navigate forward) is correct for most screens. The set handles exceptions like search where the caller pre-populates state before navigating. |
| **`customReducer` for app-specific mutations** | Keeps the engine free of domain logic (install/uninstall agents, etc.) while giving full reducer power. |
| **Theme via React context** | Components automatically pick up overrides. No prop drilling. Consumer can swap themes at runtime. |
| **No Logo in scaffold** | Branding is app-specific. Each consumer provides their own. |
| **Peer dependencies for react/ink** | Avoids duplicate React instances. Consumer controls versions. |

---

## 10. What NOT to Build

- No routing library (screen names are enough for CLIs)
- No async middleware / side effects engine (consumers use `useEffect`)
- No built-in data fetching (consumers bring their own API layer)
- No persistence / serialization of state
- No animation system
