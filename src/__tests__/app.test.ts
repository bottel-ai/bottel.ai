import { describe, it, expect } from "vitest";
import fs from "fs";

const base = "src";

const requiredFiles = [
  "cli.tsx",
  "App.tsx",
  "cli_app_components.tsx",
  "screens/Home.tsx",
  "screens/Search.tsx",
  "screens/AgentDetail.tsx",
  "screens/Installed.tsx",
  "screens/Settings.tsx",
  "screens/Auth.tsx",
  "screens/Submit.tsx",
];

describe("source files exist", () => {
  for (const file of requiredFiles) {
    it(`${base}/${file} exists`, () => {
      expect(fs.existsSync(`${base}/${file}`)).toBe(true);
    });
  }
});

