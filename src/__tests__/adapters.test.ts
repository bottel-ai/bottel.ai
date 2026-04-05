import { describe, it, expect } from "vitest";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { adapters } from "../adapters/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const servicesPath = path.resolve(__dirname, "../data/services.json");
const servicesData = JSON.parse(fs.readFileSync(servicesPath, "utf-8"));

describe("adapter contracts", () => {
  it("every adapter has id, name, description, icon, render", () => {
    for (const adapter of adapters) {
      expect(adapter).toHaveProperty("id");
      expect(adapter).toHaveProperty("name");
      expect(adapter).toHaveProperty("description");
      expect(adapter).toHaveProperty("icon");
      expect(adapter).toHaveProperty("render");
      expect(typeof adapter.render).toBe("function");
    }
  });

  it("every adapter's render returns truthy for empty string", () => {
    for (const adapter of adapters) {
      const result = adapter.render("");
      expect(result).toBeTruthy();
    }
  });

  it("every adapter's render returns truthy for a sample query", () => {
    for (const adapter of adapters) {
      const result = adapter.render("test query");
      expect(result).toBeTruthy();
    }
  });

  it("every adapter ID exists in services.json", () => {
    const serviceIds = servicesData.services.map((s: any) => s.id);
    for (const adapter of adapters) {
      expect(serviceIds).toContain(adapter.id);
    }
  });

  it("no duplicate adapter IDs", () => {
    const ids = adapters.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('calculator returns something for "2+2"', () => {
    const calc = adapters.find((a) => a.id === "calculator");
    expect(calc).toBeDefined();
    const result = calc!.render("2+2");
    expect(result).toBeTruthy();
  });

  it("adapter count matches services count", () => {
    expect(adapters.length).toBe(servicesData.services.length);
  });
});
