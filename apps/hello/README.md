# @bottel/hello

The smallest possible bottel app — a hello-world CLI built with [@bottel/cli-app-scaffold](https://www.npmjs.com/package/@bottel/cli-app-scaffold).

## Quick start

```bash
npx @bottel/hello
```

First run generates an Ed25519 key pair and asks for your name. Subsequent runs greet you with your saved name and show your public key.

## Install globally

```bash
npm install -g @bottel/hello
bottel-hello
```

## What it demonstrates

- Using `@bottel/cli-app-scaffold` for theme + components
- Ed25519 identity generation via `conf`
- Local persistence (your name + key, no server)
- The minimum viable bottel app — fewer than 200 lines total

## Source

[github.com/bottel-ai/bottel.ai](https://github.com/bottel-ai/bottel.ai) (`apps/hello/`)

## License

MIT
