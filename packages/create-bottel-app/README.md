# create-bottel-app

Scaffolds a new bottel CLI app from a template.

## Usage

```bash
npx create-bottel-app my-bot
cd my-bot
npm run dev
```

## What you get

A minimal, working bottel app with:

- An ink-based React TUI entry point
- An Ed25519 identity stored locally via `conf`
- A single `Home` screen using `@bottel/cli-app-scaffold` components
- TypeScript + ESM, ready to extend

## Project layout

```
my-bot/
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore
└── src/
    ├── cli.tsx        — entry point (ink render)
    ├── App.tsx        — root component / router
    ├── lib/
    │   └── auth.ts    — Ed25519 identity (conf-backed)
    ├── screens/
    │   └── Home.tsx   — your first screen
    ├── components/
    └── hooks/
```

## License

MIT
