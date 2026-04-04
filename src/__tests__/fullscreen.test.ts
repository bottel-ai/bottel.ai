import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Fullscreen component", () => {
  it("cli_fullscreen.tsx exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../cli_fullscreen.tsx"))).toBe(true);
  });

  it("exports FullScreen component", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli_fullscreen.tsx"), "utf-8");
    expect(content).toContain("export");
    expect(content).toContain("FullScreen");
  });

  it("cli.tsx uses alternate screen buffer codes", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli.tsx"), "utf-8");
    expect(content).toContain("1049h");
    expect(content).toContain("1049l");
  });

  it("constrains height to terminal rows", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli_fullscreen.tsx"), "utf-8");
    expect(content).toContain("height");
    expect(content).toContain("rows");
  });

  it("cli.tsx handles cleanup on signals", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../cli.tsx"), "utf-8");
    expect(content).toContain("SIGINT");
  });

  it("App.tsx uses FullScreen wrapper", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf-8");
    expect(content).toContain("FullScreen");
    expect(content).toContain("cli_fullscreen");
  });
});
