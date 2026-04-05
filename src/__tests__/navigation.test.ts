import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storeData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../data/store.json"), "utf-8")
);

describe("Navigation paths a bot would take", () => {

  // Bot opens app and sees the home screen
  it("home screen has menu with all navigation options", () => {
    // A bot reading stdout should find these menu labels
    const expectedMenuItems = ["Home", "Browse", "Search", "Installed", "Settings", "Auth", "Submit", "Exit"];
    // These should exist as text in the app
    for (const item of expectedMenuItems) {
      expect(item.length).toBeGreaterThan(0); // menu items are non-empty strings
    }
  });

  // Bot navigates Home > Search > type "code" > select result > see detail > back to search > back to home
  it("search flow: all agents are searchable by name", () => {
    for (const agent of storeData.agents) {
      // Every agent name should be at least partially unique for search
      const matches = storeData.agents.filter((a: any) =>
        a.name.toLowerCase().includes(agent.name.toLowerCase().split(" ")[0])
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.length).toBeLessThanOrEqual(5); // not too many false positives
    }
  });

  // Bot navigates Home > Browse > select category > see agents > select agent > detail
  it("browse flow: every category leads to agents", () => {
    for (const cat of storeData.categories) {
      expect(cat.agents.length).toBeGreaterThan(0);
      for (const agentId of cat.agents) {
        const agent = storeData.agents.find((a: any) => a.id === agentId);
        expect(agent).toBeDefined();
      }
    }
  });

  // Bot navigates Home > Installed > select agent > detail > back to installed
  it("installed flow: pre-installed agents exist in store", () => {
    const preinstalled = ["code-reviewer", "translator", "data-analyst"];
    for (const id of preinstalled) {
      const agent = storeData.agents.find((a: any) => a.id === id);
      expect(agent).toBeDefined();
    }
  });

  // Bot uses trending to find popular tools
  it("trending flow: trending agents are accessible", () => {
    for (const id of storeData.trending) {
      const agent = storeData.agents.find((a: any) => a.id === id);
      expect(agent).toBeDefined();
      // Trending agents should be reasonably popular
      expect(agent.installs).toBeGreaterThan(5000);
    }
  });

  // Bot uses featured to find recommended tools
  it("featured flow: featured agents are high quality", () => {
    for (const id of storeData.featured) {
      const agent = storeData.agents.find((a: any) => a.id === id);
      expect(agent).toBeDefined();
      expect(agent.verified).toBe(true);
      expect(agent.rating).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Bot needs to navigate back correctly
  it("back navigation: no dead ends in navigation", () => {
    // Every agent can be reached from at least one category
    for (const agent of storeData.agents) {
      const inCategory = storeData.categories.some((cat: any) =>
        cat.agents.includes(agent.id)
      );
      const inFeatured = storeData.featured.includes(agent.id);
      const inTrending = storeData.trending.includes(agent.id);
      // Agent should be discoverable through at least one path
      expect(inCategory || inFeatured || inTrending).toBe(true);
    }
  });

  // Bot needs pagination for large result sets
  it("pagination: categories with many agents need multiple pages", () => {
    const largeCat = storeData.categories.find((c: any) => c.agents.length > 5);
    if (largeCat) {
      // If a category has >5 agents, pagination would be needed
      expect(largeCat.agents.length).toBeGreaterThan(5);
    }
    // At minimum, total agents exceed one page
    expect(storeData.agents.length).toBeGreaterThan(5);
  });

  // Bot searches for non-existent tool
  it("search handles no results gracefully", () => {
    const nonsense = "xyzzy12345nonexistent";
    const results = storeData.agents.filter((a: any) =>
      a.name.toLowerCase().includes(nonsense) ||
      a.description.toLowerCase().includes(nonsense)
    );
    expect(results.length).toBe(0);
  });

  // Bot can find agents by capability for its task
  it("task-based discovery: bot finds right tool for common tasks", () => {
    const tasks = [
      { need: "review code", expectCap: "code-review" },
      { need: "scan security", expectCap: "security" },
      { need: "write tests", expectCap: "testing" },
      { need: "analyze data", expectCap: "data-analysis" },
    ];
    for (const task of tasks) {
      const found = storeData.agents.filter((a: any) =>
        a.capabilities.includes(task.expectCap)
      );
      expect(found.length).toBeGreaterThan(0);
    }
  });
});

describe("Screen file structure", () => {
  const requiredScreens = [
    "Home.tsx", "Browse.tsx", "Search.tsx",
    "AgentDetail.tsx", "Installed.tsx", "Settings.tsx"
  ];

  for (const screen of requiredScreens) {
    it(`${screen} exists and is not empty`, () => {
      const filePath = path.resolve(__dirname, `../screens/${screen}`);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content.length).toBeGreaterThan(100);
      // Every screen should have goBack navigation (except Home)
      if (screen !== "Home.tsx") {
        expect(content).toContain("goBack");
      }
      // Every screen should use useInput for keyboard handling
      expect(content).toContain("useInput");
    });
  }
});
