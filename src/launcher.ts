/**
 * launcher — runs an external CLI as a fullscreen child process,
 * preserving bottel.ai's React state across the launch.
 *
 * Flow:
 *   1. Save the current store state to a module-level checkpoint
 *   2. Unmount ink (releases raw mode)
 *   3. Exit alt screen buffer + disable mouse tracking
 *   4. spawnSync the child with inherited stdio (child runs fullscreen)
 *   5. When child exits, re-enter alt screen + remount ink
 *   6. StoreProvider reads from the checkpoint on init, so the user
 *      lands back exactly where they left off.
 */
import { spawnSync } from "node:child_process";
import { render } from "ink";
import type React from "react";
import type { AppState } from "./state.js";

let _renderInstance: ReturnType<typeof render> | null = null;
let _appElement: React.ReactElement | null = null;
let _checkpoint: AppState | null = null;

export function registerInk(instance: ReturnType<typeof render>, app: React.ReactElement): void {
  _renderInstance = instance;
  _appElement = app;
}

export function setCheckpoint(state: AppState): void {
  _checkpoint = state;
}

export function takeCheckpoint(): AppState | null {
  const c = _checkpoint;
  _checkpoint = null; // consume — don't reuse on subsequent mounts
  return c;
}

export function launchExternal(command: string, args: string[]): void {
  if (!_renderInstance || !_appElement) {
    throw new Error("Ink not registered — call registerInk first");
  }

  const instance = _renderInstance;
  const app = _appElement;

  // 1. Unmount ink (releases raw mode + clears the React render)
  instance.unmount();

  // 2. Disable mouse tracking so child doesn't see escape codes,
  //    but KEEP the alt screen buffer active so the child renders fullscreen
  process.stdout.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[2J\x1b[H");

  // 3. Run the child synchronously with inherited stdio.
  //    Child inherits our alt screen buffer → renders fullscreen.
  spawnSync(command, args, { stdio: "inherit", shell: false });

  // 4. Clear + re-enable mouse tracking for our own use
  process.stdout.write("\x1b[2J\x1b[H\x1b[?1000h\x1b[?1002h\x1b[?1006h");

  // 5. Re-mount ink with the same App element — StoreProvider will
  //    read the checkpoint from takeCheckpoint() and hydrate state
  const newInstance = render(app, { exitOnCtrlC: true });
  registerInk(newInstance, app);
}
