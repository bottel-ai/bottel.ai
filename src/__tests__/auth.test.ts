import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Auth system", () => {
  it("auth.ts exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../lib/auth.ts"))).toBe(true);
  });

  it("exports key generation functions", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../lib/auth.ts"), "utf-8");
    expect(content).toContain("generateKeyPair");
    expect(content).toContain("isLoggedIn");
    expect(content).toContain("clearAuth");
    expect(content).toContain("getAuth");
    expect(content).toContain("ed25519");
  });

  it("Auth screen exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../screens/Auth.tsx"))).toBe(true);
  });

  it("Submit screen exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../screens/Submit.tsx"))).toBe(true);
  });

  it("Auth screen has key management", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../screens/Auth.tsx"), "utf-8");
    expect(content).toContain("Generate");
    expect(content).toContain("Logout");
    expect(content).toContain("goBack");
  });

  it("Submit screen has form steps", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../screens/Submit.tsx"), "utf-8");
    expect(content).toContain("Name");
    expect(content).toContain("Description");
    expect(content).toContain("Category");
    expect(content).toContain("Version");
  });

  it("Home menu includes Auth and Submit", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../screens/Home.tsx"), "utf-8");
    expect(content).toContain('"auth"');
    expect(content).toContain('"submit"');
  });

  it("StatusBar shows auth status", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli_app_components.tsx"), "utf-8");
    expect(content).toContain("isLoggedIn");
    expect(content).toContain("not logged in");
  });

  it("State engine has auth and submit screens", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli_app_state.tsx"), "utf-8");
    expect(content).toContain('"auth"');
    expect(content).toContain('"submit"');
  });
});
