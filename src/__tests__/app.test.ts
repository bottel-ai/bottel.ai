import { describe, it, expect } from "vitest";
import fs from "fs";

const base = "src";

const requiredFiles = [
  "cli.tsx",
  "App.tsx",
  "cli_app_components.tsx",
  "components/AgentCard.tsx",
  "screens/Home.tsx",
  "screens/Browse.tsx",
  "screens/Search.tsx",
  "screens/AgentDetail.tsx",
  "screens/Installed.tsx",
  "screens/Settings.tsx",
];

describe("source files exist", () => {
  for (const file of requiredFiles) {
    it(`${base}/${file} exists`, () => {
      expect(fs.existsSync(`${base}/${file}`)).toBe(true);
    });
  }
});

describe("store.json content checks", () => {
  it("has at least 10 agents", () => {
    const store = JSON.parse(fs.readFileSync("src/data/store.json", "utf-8"));
    expect(store.agents.length).toBeGreaterThanOrEqual(10);
  });

  it("has at least 5 categories", () => {
    const store = JSON.parse(fs.readFileSync("src/data/store.json", "utf-8"));
    expect(store.categories.length).toBeGreaterThanOrEqual(5);
  });
});
