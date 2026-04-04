import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Fullscreen setup", () => {
  it("cli.tsx uses fullscreen-ink", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli.tsx"), "utf-8");
    expect(content).toContain("withFullScreen");
    expect(content).toContain("fullscreen-ink");
  });

  it("App.tsx uses FullScreenBox and ScrollView", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf-8");
    expect(content).toContain("FullScreenBox");
    expect(content).toContain("ScrollView");
    expect(content).toContain("ink-scroll-view");
  });

  it("fullscreen-ink package is installed", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../node_modules/fullscreen-ink"))).toBe(true);
  });

  it("ink-scroll-view package is installed", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../node_modules/ink-scroll-view"))).toBe(true);
  });
});
