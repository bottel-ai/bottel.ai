#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import App from "./App.js";

// Clear screen on start
process.stdout.write("\x1b[2J\x1b[H");

render(<App />);
