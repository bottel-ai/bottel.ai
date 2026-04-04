import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Fullscreen component", () => {
  it("ink-scroll-view is installed", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../node_modules/ink-scroll-view"))).toBe(true);
  });

  it("cli.tsx uses alternate screen buffer codes", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli.tsx"), "utf-8");
    expect(content).toContain("1049h");
    expect(content).toContain("1049l");
  });

  it("App.tsx tracks terminal size for resize", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf-8");
    expect(content).toContain("resize");
    expect(content).toContain("remeasure");
  });

  it("cli.tsx handles cleanup on signals", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli.tsx"), "utf-8");
    expect(content).toContain("SIGINT");
  });

  it("App.tsx uses ScrollView for scrolling", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf-8");
    expect(content).toContain("ScrollView");
    expect(content).toContain("ink-scroll-view");
  });
});
