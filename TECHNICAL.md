# Technical Documentation — bottel.ai

## Overview

bottel.ai is a CLI App Store for AI agents. It provides a terminal-based user interface where AI agents can discover, install, and manage CLI tools. The app uses an alternate screen buffer for a fullscreen experience, similar to vim or htop.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  CLI Entry                   │
│              (src/cli.tsx)                    │
│  Alternate screen buffer + ink render        │
├─────────────────────────────────────────────┤
│                 App Router                   │
│           (src/components/App.tsx)            │
│  Screen state management + navigation        │
├──────────┬──────────┬──────────┬────────────┤
│  Home    │  Browse  │  Search  │  Detail    │
│  Screen  │  Screen  │  Screen  │  Screen    │
├──────────┴──────────┴──────────┴────────────┤
│            Reusable Components               │
│        Logo, StatusBar, AgentCard            │
├─────────────────────────────────────────────┤
│              Store Data (JSON)               │
│           (src/data/store.json)              │
└─────────────────────────────────────────────┘
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
| Scrolling | ink-scroll-view | 0.3.x |
| Build | tsc | - |
| Dev runner | tsx | 4.x |

## Entry Point (cli.tsx)

The CLI entry point:
1. Enters the alternate screen buffer (`\x1b[?1049h`) — hides terminal history
2. Clears the screen (`\x1b[2J`)
3. Renders the React app via ink's `render()`
4. On exit, restores the original screen buffer (`\x1b[?1049l`)
5. Handles SIGINT/SIGTERM for clean restoration

## Screen Navigation

The app uses a single-state router in `App.tsx`:

```typescript
type Screen =
  | { name: "home" }
  | { name: "browse" }
  | { name: "search" }
  | { name: "agent-detail"; agentId: string }
  | { name: "installed" }
  | { name: "settings" };
```

- `goHome()` — returns to home, shows logo
- `navigate(screen)` — navigates to screen, hides logo
- Each screen receives an `onBack` callback
- Esc key always navigates back

## Component Library

### Logo
- Rainbow ASCII art using block characters (██)
- 7 lines, each a different color
- Gradient separator bar (░▒▓█)
- Centered with top/bottom padding

### StatusBar
- Single-line bordered box
- Left: "bottel.ai" in pink
- Right: installed count

### AgentCard
- **Compact mode**: single-line for lists (name, author, rating, installs, verified badge)
- **Full mode**: multi-line detail view

### Agent Interface
```typescript
interface Agent {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  longDescription: string;
  category: string;
  rating: number;      // 0-5
  reviews: number;
  installs: number;
  capabilities: string[];
  size: string;
  updated: string;     // ISO date
  verified: boolean;
}
```

## Store Data Format (store.json)

```json
{
  "featured": ["id1", "id2", "id3"],
  "trending": ["id1", "id2", "id3", "id4", "id5"],
  "categories": [
    {
      "name": "Category Name",
      "icon": ">>",
      "agents": ["id1", "id2"]
    }
  ],
  "agents": [
    { "id": "...", "name": "...", ... }
  ]
}
```

## Keyboard Navigation

| Key | Action |
|-----|--------|
| ↑ / ↓ | Navigate lists |
| Enter | Select / confirm |
| Esc | Go back |
| Tab | Switch sections (Home screen) |
| / | Open search |
| q | Quit app |

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Red | #ff6b6b | Logo line 1 |
| Orange | #ff9f43 | Logo line 2 |
| Yellow | #feca57 | Logo line 3, ratings |
| Cyan | #48dbfb | Selected items, primary highlight |
| Blue | #54a0ff | Logo line 5, secondary |
| Purple | #5f27cd | Borders, logo line 6 |
| Pink | #ff9ff3 | Logo gradient bar, branding |

## Development

```bash
# Prerequisites
nvm use 22       # Node 22+ required

# Install dependencies
npm install

# Run development
npm run dev

# Type check
npx tsc --noEmit

# Build
npm run build

# Run tests
npm test
```

## File Naming Conventions

- Components: PascalCase (e.g., `AgentCard.tsx`)
- Screens: PascalCase (e.g., `Home.tsx`)
- Data files: kebab-case (e.g., `store.json`)
- All imports use `.js` extension for ESM compatibility

## Git Workflow

- Commit after every completed change
- Descriptive commit messages
- All changes documented in this file
- README.md kept up to date

---

## Changelog

### v0.2.0 — Cleanup + Fullscreen (2026-04-05)
- Fullscreen alternate screen buffer for immersive TUI experience
- ScrollView-based scrolling via ink-scroll-view
- Mouse wheel support for navigating long lists
- Dead code cleanup: removed unused SearchBar, CategoryCard, cli_fullscreen, cli_app_viewport, Accordion, ScrollList, and useTerminalHeight

### v0.1.0 — Initial Scaffold (2026-04-04)
- Project setup: TypeScript, ink, React
- Core components: Logo, StatusBar, AgentCard
- Screens: Home (featured/trending/categories), Browse, Search
- Sample data: 15 agents across 6 categories
- Alternate screen buffer for fullscreen experience
- Rainbow ASCII logo with gradient bar
