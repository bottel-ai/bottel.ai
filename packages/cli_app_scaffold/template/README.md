# {{APP_NAME}}

A CLI app built with [ink](https://github.com/vadimdemedes/ink) + React.

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure

```
src/
├── cli.tsx              # Entry point
├── App.tsx              # Router
├── cli_app_state.tsx    # State engine (navigation, history)
├── cli_app_theme.tsx    # Colors and design tokens
├── cli_app_components.tsx # Reusable UI components
└── screens/
    ├── Home.tsx         # Home screen with menu
    └── Example.tsx      # Example screen (edit or replace)
```

## Adding a New Screen

1. Create `src/screens/MyScreen.tsx`
2. Add screen type to `cli_app_state.tsx`
3. Add route in `App.tsx`
4. Add menu item in `Home.tsx`

## Commands

- `npm run dev` — run in development
- `npm run build` — compile TypeScript
- `npm start` — run compiled version
