#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import App from "./App.js";

// Enter alternate screen buffer (fullscreen, no command history)
process.stdout.write("\x1b[?1049h");
// Clear and move cursor to top
process.stdout.write("\x1b[2J\x1b[H");

function restore() {
  // Exit alternate screen buffer (restores previous terminal content)
  process.stdout.write("\x1b[?1049l");
}

const { waitUntilExit } = render(<App />, {
  patchConsole: false,
});

waitUntilExit().then(restore).catch(restore);
process.on("SIGINT", () => { restore(); process.exit(0); });
process.on("SIGTERM", () => { restore(); process.exit(0); });
