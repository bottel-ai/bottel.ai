import { describe, it, expect } from "vitest";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const servicesPath = path.resolve(__dirname, "../data/services.json");

describe("services.json data integrity", () => {
  it("loads successfully and is valid JSON", () => {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    const data = JSON.parse(raw);
    expect(data).toBeDefined();
  });

  it('has "featured", "categories", "services" arrays', () => {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    const data = JSON.parse(raw);
    expect(Array.isArray(data.featured)).toBe(true);
    expect(Array.isArray(data.categories)).toBe(true);
    expect(Array.isArray(data.services)).toBe(true);
  });

  it("all featured IDs exist in services array", () => {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    const data = JSON.parse(raw);
    const serviceIds = data.services.map((s: any) => s.id);
    for (const id of data.featured) {
      expect(serviceIds).toContain(id);
    }
  });

  it("all category service IDs exist in services array", () => {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    const data = JSON.parse(raw);
    const serviceIds = data.services.map((s: any) => s.id);
    for (const cat of data.categories) {
      for (const id of cat.services) {
        expect(serviceIds).toContain(id);
      }
    }
  });

  it("no duplicate service IDs", () => {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    const data = JSON.parse(raw);
    const ids = data.services.map((s: any) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every service has: id, name, description, icon, category", () => {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    const data = JSON.parse(raw);
    const requiredFields = ["id", "name", "description", "icon", "category"];
    for (const service of data.services) {
      for (const field of requiredFields) {
        expect(service).toHaveProperty(field);
      }
    }
  });

  it("all categories have unique names", () => {
    const raw = fs.readFileSync(servicesPath, "utf-8");
    const data = JSON.parse(raw);
    const names = data.categories.map((c: any) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
