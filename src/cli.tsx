#!/usr/bin/env node
import React from "react";
import { withFullScreen } from "fullscreen-ink";
import App from "./App.js";

const { waitUntilExit } = withFullScreen(<App />);
waitUntilExit();
