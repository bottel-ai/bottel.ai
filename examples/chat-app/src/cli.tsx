#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./App.js";

// Use alt screen buffer so the app doesn't pollute the terminal
const { waitUntilExit } = render(<App />, {
  exitOnCtrlC: true,
});

waitUntilExit().then(() => {
  process.exit(0);
});
