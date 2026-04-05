# {{SERVICE_NAME}}

A bottel.ai service adapter.

## Getting Started

```bash
npm install
npm run build
```

## How It Works

This adapter implements the `ServiceAdapter` interface:

```typescript
interface ServiceAdapter {
  id: string;           // unique identifier
  name: string;         // display name
  description: string;  // one-line description
  icon: string;         // 2-char icon for terminal display
  render: (query: string) => React.ReactNode;  // renders the UI
}
```

## Editing Your Adapter

Edit `src/adapter.tsx`:

1. Update the metadata (name, description, icon)
2. Replace the `render` function with your service logic
3. Fetch data from APIs using `fetch()`
4. Return ink components (`<Box>`, `<Text>`) for terminal display

## Example: Weather Adapter

```tsx
render: async (query: string) => {
  const res = await fetch(`https://api.weather.com/v1/${query}`);
  const data = await res.json();
  return (
    <Box flexDirection="column">
      <Text bold>{data.city}: {data.temp}°C</Text>
      <Text dimColor>{data.conditions}</Text>
    </Box>
  );
}
```

## Registering with bottel.ai

Once your adapter is built, register it:

```bash
bottel register ./dist/index.js
```
