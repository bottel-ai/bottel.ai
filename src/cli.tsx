#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import App from "./App.js";

// Enter alternate screen buffer
process.stdout.write("\x1b[?1049h");
process.stdout.write("\x1b[H");
process.stdout.write("\x1b[2J");

function restoreScreen() {
  process.stdout.write("\x1b[?1049l");
}

const { waitUntilExit } = render(<App />);

waitUntilExit()
  .then(() => {
    restoreScreen();
  })
  .catch(() => {
    restoreScreen();
  });

process.on("SIGINT", () => {
  restoreScreen();
  process.exit(0);
});

process.on("SIGTERM", () => {
  restoreScreen();
  process.exit(0);
});
