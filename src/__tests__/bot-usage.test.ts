import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storeData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../data/store.json"), "utf-8")
);

describe("Bot can use bottel store", () => {
  // A bot needs to search for tools by capability
  it("can find agents by capability keyword", () => {
    const query = "security";
    const results = storeData.agents.filter((a: any) =>
      a.capabilities.some((c: string) => c.includes(query)) ||
      a.description.toLowerCase().includes(query) ||
      a.category.toLowerCase().includes(query)
    );
    expect(results.length).toBeGreaterThan(0);
    // Should find security-scanner and vuln-hunter at minimum
    const ids = results.map((a: any) => a.id);
    expect(ids).toContain("security-scanner");
  });

  // A bot needs to search by name
  it("can find agent by name search", () => {
    const query = "code reviewer";
    const results = storeData.agents.filter((a: any) =>
      a.name.toLowerCase().includes(query.toLowerCase())
    );
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("code-reviewer");
  });

  // A bot needs to know what's available in a category
  it("can list agents in a category", () => {
    const category = storeData.categories.find((c: any) => c.name === "Development");
    expect(category).toBeDefined();
    expect(category.agents.length).toBeGreaterThan(0);
    // Every listed agent should exist
    for (const id of category.agents) {
      const agent = storeData.agents.find((a: any) => a.id === id);
      expect(agent).toBeDefined();
    }
  });

  // A bot needs to check if an agent is verified/trusted
  it("can check agent trust signals", () => {
    const agent = storeData.agents.find((a: any) => a.id === "code-reviewer");
    expect(agent).toBeDefined();
    expect(agent.verified).toBe(true);
    expect(agent.rating).toBeGreaterThanOrEqual(4.0);
    expect(agent.installs).toBeGreaterThan(1000);
    expect(agent.reviews).toBeGreaterThan(100);
  });

  // A bot needs to get agent details before installing
  it("can read agent metadata for install decision", () => {
    const agent = storeData.agents.find((a: any) => a.id === "code-reviewer");
    expect(agent.version).toBeDefined();
    expect(agent.size).toBeDefined();
    expect(agent.updated).toBeDefined();
    expect(agent.capabilities).toBeInstanceOf(Array);
    expect(agent.capabilities.length).toBeGreaterThan(0);
    expect(agent.longDescription.length).toBeGreaterThan(50);
  });

  // A bot should be able to find the best agent for a task
  it("can rank agents by rating and installs", () => {
    const devAgents = storeData.agents
      .filter((a: any) => a.category === "Development")
      .sort((a: any, b: any) => b.rating - a.rating || b.installs - a.installs);
    expect(devAgents[0].id).toBe("code-reviewer"); // highest rated dev tool
  });

  // A bot needs to discover what capabilities exist
  it("can list all available capabilities", () => {
    const allCaps = new Set<string>();
    for (const agent of storeData.agents) {
      for (const cap of agent.capabilities) {
        allCaps.add(cap);
      }
    }
    expect(allCaps.size).toBeGreaterThan(10);
    expect(allCaps.has("code-review")).toBe(true);
    expect(allCaps.has("security")).toBe(true);
    expect(allCaps.has("testing")).toBe(true);
  });

  // A bot needs to find trending/popular tools
  it("can access trending agents", () => {
    expect(storeData.trending).toBeInstanceOf(Array);
    expect(storeData.trending.length).toBeGreaterThan(0);
    for (const id of storeData.trending) {
      const agent = storeData.agents.find((a: any) => a.id === id);
      expect(agent).toBeDefined();
    }
  });

  // A bot needs to find featured/recommended tools
  it("can access featured agents", () => {
    expect(storeData.featured).toBeInstanceOf(Array);
    expect(storeData.featured.length).toBeGreaterThan(0);
    for (const id of storeData.featured) {
      const agent = storeData.agents.find((a: any) => a.id === id);
      expect(agent).toBeDefined();
      // Featured agents should be verified
      expect(agent.verified).toBe(true);
    }
  });

  // A bot might need to filter by multiple criteria
  it("can filter by capability AND minimum rating", () => {
    const results = storeData.agents.filter((a: any) =>
      a.capabilities.includes("code-review") && a.rating >= 4.5
    );
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.rating).toBeGreaterThanOrEqual(4.5);
    }
  });

  // CLI app output should be parseable (no HTML, no images)
  it("store data is pure structured data, no HTML or image references", () => {
    const json = JSON.stringify(storeData);
    expect(json).not.toContain("<html");
    expect(json).not.toContain("<div");
    expect(json).not.toContain("<img");
    expect(json).not.toContain(".png");
    expect(json).not.toContain(".jpg");
    expect(json).not.toContain("http://"); // no external URLs in sample data
  });
});
