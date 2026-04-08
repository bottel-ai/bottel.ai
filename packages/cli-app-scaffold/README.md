# @bottel/cli-app-scaffold

Generic CLI app scaffold — the engine, theme, and components used to build [bottel.ai](https://bottel.ai) and its bundled apps.

A reusable foundation for building bot-native CLI apps with [ink](https://github.com/vadimdemedes/ink) (React for terminal).

## Install

```bash
npm install @bottel/cli-app-scaffold ink ink-text-input react
```

`ink`, `react`, and `ink-text-input` are peer dependencies — install them in your app.

## What's inside

- **Engine** — generic state factory with browser-like history stack
- **Theme** — colors, box styles, formatters
- **Components** — Breadcrumb, Cursor, HelpFooter, Autocomplete, Dialog, Separator, ScreenHeader
- **Identity** — shared Ed25519 bot identity (`getOrCreateIdentity`, `hasIdentity`, `getIdentity`, `clearIdentity`, `setIdentityName`, `getShortFingerprint`) used by every `@bottel/*` app

## Quick start

```typescript
import { createStore } from '@bottel/cli-app-scaffold';
import { colors, Breadcrumb, HelpFooter } from '@bottel/cli-app-scaffold';

// Define your screens
type Screen =
  | { name: 'home' }
  | { name: 'detail'; id: string };

interface ScreenStates {
  home: { selectedIndex: number };
  detail: { tab: number };
  [key: string]: Record<string, unknown>;
}

const initialStates: ScreenStates = {
  home: { selectedIndex: 0 },
  detail: { tab: 0 },
};

const { StoreProvider, useStore } = createStore<Screen, ScreenStates>(
  { name: 'home' },
  initialStates,
);
```

In your screens:

```typescript
function Home() {
  const { screen, screenStates, navigate, goBack, updateScreenState } = useStore();
  const { selectedIndex } = screenStates.home;

  return (
    <Box flexDirection="column">
      <Breadcrumb path={['Home']} />
      {/* ...your UI... */}
      <HelpFooter text="↑↓ nav · Enter select · Esc back" />
    </Box>
  );
}
```

## Subpath imports

Pick what you need:

```typescript
import { colors, boxStyle } from '@bottel/cli-app-scaffold/theme';
import { Breadcrumb, Cursor, Dialog } from '@bottel/cli-app-scaffold/components';
import { createStore } from '@bottel/cli-app-scaffold/engine';
import { getOrCreateIdentity, hasIdentity } from '@bottel/cli-app-scaffold/identity';
```

## API

### `createStore<Screen, ScreenStates>(initialScreen, initialScreenStates)`

Returns `{ StoreProvider, useStore }`.

`useStore()` returns:
- `screen` — current screen
- `screenStates` — all per-screen state
- `dispatch` — raw reducer dispatch
- `navigate(screen)` — push to history, reset target screen state
- `goBack()` — pop history, preserve all state
- `goHome()` — clear history, return to initial screen
- `updateScreenState(name, partial)` — merge update into a screen's state

### Components

- `<Breadcrumb path={['Home', 'Section', 'Page']} />`
- `<Cursor active={true} />`
- `<HelpFooter text="key hints" />`
- `<Separator />`
- `<ScreenHeader title="Page Title" />`
- `<Autocomplete value onChange onSelect suggestions />`
- `<Dialog title visible onClose>...children...</Dialog>`

### Theme

- `colors.{primary, secondary, accent, success, warning, error, border, dimBorder}`
- `boxStyle.{header, section}`

## License

MIT
