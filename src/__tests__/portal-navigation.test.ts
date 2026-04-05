import { describe, it, expect } from "vitest";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { adapters } from "../adapters/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const servicesPath = path.resolve(__dirname, "../data/services.json");
const servicesData = JSON.parse(fs.readFileSync(servicesPath, "utf-8"));

describe("portal navigation", () => {
  it("Portal.tsx exists and contains useInput and goBack", () => {
    const filePath = path.resolve(__dirname, "../screens/Portal.tsx");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("useInput");
    expect(content).toContain("goBack");
  });

  it("ServiceView.tsx exists and contains useInput and goBack", () => {
    const filePath = path.resolve(__dirname, "../screens/ServiceView.tsx");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("useInput");
    expect(content).toContain("goBack");
  });

  it('Home menu includes "Portal" option', () => {
    const filePath = path.resolve(__dirname, "../screens/Home.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content.toLowerCase()).toContain("portal");
  });

  it('cli_app_state.tsx contains "portal" and "service" screen types', () => {
    const filePath = path.resolve(__dirname, "../cli_app_state.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("portal");
    expect(content).toContain("service");
  });

  it("every service has a corresponding adapter", () => {
    const adapterIds = adapters.map((a) => a.id);
    for (const service of servicesData.services) {
      expect(adapterIds).toContain(service.id);
    }
  });

  it("App.tsx imports Portal and ServiceView", () => {
    const filePath = path.resolve(__dirname, "../App.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Portal");
    expect(content).toContain("ServiceView");
  });
});
