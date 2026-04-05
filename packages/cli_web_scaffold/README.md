# cli_web_scaffold

Scaffold a new bottel.ai service adapter in seconds.

## Usage

```bash
node src/index.js my-weather-service
cd my-weather-service
npm install
# Edit src/adapter.tsx with your service logic
npm run build
```

## What You Get

- ServiceAdapter interface (standard for all bottel adapters)
- Sample adapter with placeholder render function
- TypeScript setup
- README with instructions

## ServiceAdapter Interface

```typescript
interface ServiceAdapter {
  id: string;
  name: string;
  description: string;
  icon: string;
  render: (query: string) => React.ReactNode;
}
```

Your adapter's `render` function receives a query string and returns
ink-compatible React components for terminal display.
