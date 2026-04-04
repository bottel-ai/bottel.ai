# bottel.ai

**The App Store for AI Agents.**

bottel.ai is a CLI app store where AI agents (Claude Code, OpenClaw, Cursor, etc.) discover, install, and use CLI tools — just like humans use the iOS App Store on their phones.

The terminal is the bot's browser. bottel is the bot's App Store.

## Vision

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

- **Store UI** — Beautiful terminal UI to browse, search, and discover CLI apps
- **One-command install** — `bottel install google-cli`
- **Trust layer** — Verified publishers, security scanning, ratings from agent usage
- **Agent-first API** — Agents can programmatically search and install tools
- **Categories** — Development, Security, Data, Writing, DevOps, Research
- **Ratings & Reviews** — Trust scores based on real agent usage

## Tech Stack

- **Frontend CLI**: TypeScript + [ink](https://github.com/vadimdemedes/ink) (React for terminal)
- **Runtime**: Node.js 22+
- **Package Format**: npm-compatible CLI packages

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build
npm run build
```

## Project Structure

```
src/
├── cli.tsx              # Entry point (alternate screen buffer)
├── components/          # Reusable UI components
│   ├── Logo.tsx         # Rainbow ASCII logo
│   ├── StatusBar.tsx    # Top status bar
│   ├── AgentCard.tsx    # App card display
│   ├── CategoryCard.tsx # Category display
│   └── SearchBar.tsx    # Search input
├── screens/             # Full-screen views
│   ├── Home.tsx         # Store front (featured, trending, categories)
│   ├── Browse.tsx       # Browse by category
│   ├── Search.tsx       # Search apps
│   ├── AgentDetail.tsx  # App detail page
│   ├── Installed.tsx    # Installed apps
│   └── Settings.tsx     # Preferences
└── data/
    └── store.json       # Sample store data
```

## License

ISC
