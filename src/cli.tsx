#!/usr/bin/env node
import { render } from "ink";
import App from "./App.js";

// ANSI escape sequences
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const CLEAR_SCREEN = "\x1b[2J\x1b[H";
// SGR mouse tracking (1000=normal, 1002=button-motion, 1006=SGR format)
const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
const DISABLE_MOUSE = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

// Enter alt screen + enable mouse wheel tracking
process.stdout.write(ENTER_ALT_SCREEN + CLEAR_SCREEN + ENABLE_MOUSE);

function restore() {
  process.stdout.write(DISABLE_MOUSE + EXIT_ALT_SCREEN);
}

render(<App />);

process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(0); });
process.on("SIGTERM", () => { restore(); process.exit(0); });
