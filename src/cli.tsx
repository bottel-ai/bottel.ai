#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import App from "./App.js";

// Enter alt screen BEFORE ink renders (must happen synchronously)
process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H");

function restore() {
  process.stdout.write("\x1b[?1049l");
}

render(<App />);

process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(0); });
process.on("SIGTERM", () => { restore(); process.exit(0); });
