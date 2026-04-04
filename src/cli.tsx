#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import App from "./App.js";

// Enter alternate screen buffer (fullscreen — hides command history)
process.stdout.write("\x1b[?1049h");
process.stdout.write("\x1b[H\x1b[2J");

function restore() {
  process.stdout.write("\x1b[?1049l");
}

render(<App />);

process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(0); });
process.on("SIGTERM", () => { restore(); process.exit(0); });
