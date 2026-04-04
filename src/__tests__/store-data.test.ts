import { describe, it, expect } from "vitest";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.resolve(__dirname, "../data/store.json");

let store: any;

describe("store.json data integrity", () => {
  it("loads successfully and is valid JSON", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    expect(store).toBeDefined();
  });

  it('has "featured", "trending", "categories", "agents" arrays', () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    expect(Array.isArray(store.featured)).toBe(true);
    expect(Array.isArray(store.trending)).toBe(true);
    expect(Array.isArray(store.categories)).toBe(true);
    expect(Array.isArray(store.agents)).toBe(true);
  });

  it("all featured IDs exist in agents array", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    const agentIds = store.agents.map((a: any) => a.id);
    for (const id of store.featured) {
      expect(agentIds).toContain(id);
    }
  });

  it("all trending IDs exist in agents array", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    const agentIds = store.agents.map((a: any) => a.id);
    for (const id of store.trending) {
      expect(agentIds).toContain(id);
    }
  });

  it("all agent IDs in categories exist in agents array", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    const agentIds = store.agents.map((a: any) => a.id);
    for (const cat of store.categories) {
      for (const id of cat.agents) {
        expect(agentIds).toContain(id);
      }
    }
  });

  it("no duplicate agent IDs", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    const ids = store.agents.map((a: any) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every agent has all required fields", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    const requiredFields = [
      "id", "name", "author", "version", "description", "longDescription",
      "category", "rating", "reviews", "installs", "capabilities", "size",
      "updated", "verified",
    ];
    for (const agent of store.agents) {
      for (const field of requiredFields) {
        expect(agent).toHaveProperty(field);
      }
    }
  });

  it("every rating is between 0 and 5", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    for (const agent of store.agents) {
      expect(agent.rating).toBeGreaterThanOrEqual(0);
      expect(agent.rating).toBeLessThanOrEqual(5);
    }
  });

  it("every installs count is > 0", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    for (const agent of store.agents) {
      expect(agent.installs).toBeGreaterThan(0);
    }
  });

  it("every agent has at least 1 capability", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    for (const agent of store.agents) {
      expect(agent.capabilities.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every category has at least 1 agent", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    for (const cat of store.categories) {
      expect(cat.agents.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("all categories have unique names", () => {
    const raw = fs.readFileSync(storePath, "utf-8");
    store = JSON.parse(raw);
    const names = store.categories.map((c: any) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
