#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve templates directory: dist/cli.js -> ../templates/default
const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates", "default");

interface TemplateVars {
  NAME: string;
  PACKAGE_NAME: string;
  DESCRIPTION: string;
  YEAR: string;
}

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function validateName(name: string): void {
  if (!name) fail("project name is required");
  if (name.length > 214) fail("project name must be 214 characters or fewer");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
    fail(
      "project name must be lowercase letters, digits, and hyphens only (no spaces, slashes, or leading/trailing hyphens)",
    );
  }
}

function applyTemplate(content: string, vars: TemplateVars): string {
  return content
    .replaceAll("{{NAME}}", vars.NAME)
    .replaceAll("{{PACKAGE_NAME}}", vars.PACKAGE_NAME)
    .replaceAll("{{DESCRIPTION}}", vars.DESCRIPTION)
    .replaceAll("{{YEAR}}", vars.YEAR);
}

function copyTemplateTree(srcDir: string, destDir: string, vars: TemplateVars): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    let destName = entry.name;
    if (destName.endsWith(".template")) {
      destName = destName.slice(0, -".template".length);
    }
    const destPath = path.join(destDir, destName);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplateTree(srcPath, destPath, vars);
      continue;
    }

    if (entry.isFile()) {
      if (entry.name === ".gitkeep") {
        // preserve as empty marker so the directory is created
        fs.writeFileSync(destPath, "");
        continue;
      }
      const isTemplate = entry.name.endsWith(".template");
      const raw = fs.readFileSync(srcPath, "utf8");
      const out = isTemplate ? applyTemplate(raw, vars) : raw;
      fs.writeFileSync(destPath, out);
    }
  }
}

function runNpmInstall(cwd: string): boolean {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["install"], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(
      "usage: create-bottel-app <name>\n\nScaffolds a new bottel CLI app in ./<name>\n",
    );
    process.exit(args.length === 0 ? 1 : 0);
  }

  const name = args[0]!;
  validateName(name);

  const targetDir = path.resolve(process.cwd(), name);
  if (fs.existsSync(targetDir)) {
    fail(`directory already exists: ${targetDir}`);
  }

  if (!fs.existsSync(TEMPLATES_DIR)) {
    fail(`templates directory not found at ${TEMPLATES_DIR}`);
  }

  const vars: TemplateVars = {
    NAME: name,
    PACKAGE_NAME: name,
    DESCRIPTION: "A bot-native CLI app built with @bottel/cli-app-scaffold",
    YEAR: String(new Date().getFullYear()),
  };

  fs.mkdirSync(targetDir, { recursive: true });
  process.stdout.write(`Creating ${name}/ ...\n`);
  copyTemplateTree(TEMPLATES_DIR, targetDir, vars);
  process.stdout.write(`\u2714 Created ${name}/\n`);

  process.stdout.write(`Installing dependencies (this may take a moment) ...\n`);
  const installed = runNpmInstall(targetDir);
  if (!installed) {
    process.stderr.write(
      `\nwarning: npm install failed. You can retry manually:\n  cd ${name}\n  npm install\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`\u2714 Installed dependencies\n\n`);

  process.stdout.write(
    `Next steps:\n` +
      `  cd ${name}\n` +
      `  npm run dev\n\n` +
      `Files:\n` +
      `  src/cli.tsx       \u2014 entry point\n` +
      `  src/App.tsx       \u2014 router\n` +
      `  src/screens/      \u2014 your pages\n` +
      `  src/lib/auth.ts   \u2014 Ed25519 identity\n\n` +
      `Read STRUCTURE.md for more.\n`,
  );
}

main();
