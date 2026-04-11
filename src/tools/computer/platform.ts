// macOS desktop driver via screencapture + cliclick

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, unlinkSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseKeyCombo } from "./key-mapping.js";
import type { AccessibilitySnapshot, AXElement, AppInfo } from "./accessibility.js";
import { getAccessibilityTree as queryAccessibilityTree, getElementAtPoint as queryElementAtPoint, listVisibleApps as queryListApps, activateApp as queryActivateApp } from "./accessibility.js";

export interface DesktopDriver {
  screenshot(width?: number): Promise<{ base64: string; width: number; height: number }>;
  mouseMove(x: number, y: number): Promise<void>;
  leftClick(x: number, y: number): Promise<void>;
  rightClick(x: number, y: number): Promise<void>;
  doubleClick(x: number, y: number): Promise<void>;
  drag(fx: number, fy: number, tx: number, ty: number): Promise<void>;
  typeText(text: string): Promise<void>;
  keyPress(keys: string): Promise<void>;
  scroll(direction: string, amount: number): Promise<void>;
  getScreenSize(): Promise<{ width: number; height: number }>;
  getCursorPosition(): Promise<{ x: number; y: number }>;
  /** Query the accessibility tree of an app. If appName omitted, uses frontmost app. */
  getAccessibilityTree?(appName?: string): Promise<{ snapshot: AccessibilitySnapshot; rawTree: string } | null>;
  /** Query the UI element at a specific screen coordinate. Returns null if unsupported. */
  getElementAtPoint?(x: number, y: number): Promise<AXElement | null>;
  /** List all visible applications and their windows. */
  listApps?(): Promise<AppInfo[] | null>;
  /** Activate (bring to front) a specific application. */
  activateApp?(appName: string): Promise<boolean>;
}

const CLICLICK_NOT_FOUND =
  "cliclick is required for Computer Use. Install: brew install cliclick";

function getTerminalAppName(): string {
  const termProgram = process.env.TERM_PROGRAM || "";
  if (termProgram === "iTerm.app") return "iTerm2";
  if (termProgram === "vscode") return "VS Code";
  if (termProgram === "Apple_Terminal") return "Terminal";
  if (termProgram === "WarpTerminal") return "Warp";
  return "your terminal app";
}

function detectPermissionError(err: any, command: string): string | null {
  const terminal = getTerminalAppName();
  const stderr = (err.stderr || "").toString().toLowerCase();
  const stdout = (err.stdout || "").toString().toLowerCase();
  const message = (err.message || "").toLowerCase();

  if (command === "screencapture") {
    // screencapture fails with non-zero exit when Screen Recording permission is missing
    return [
      "Screen Recording permission required for screenshots.",
      `Fix: System Settings → Privacy & Security → Screen Recording → enable ${terminal}`,
      "Then restart the terminal.",
    ].join("\n");
  }

  if (command === "cliclick") {
    const combined = stderr + stdout + message;
    if (combined.includes("accessibility") || combined.includes("trusted")) {
      return [
        "Accessibility permission required for cliclick.",
        `Fix: System Settings → Privacy & Security → Accessibility → enable ${terminal}`,
        "Then restart the terminal.",
      ].join("\n");
    }
  }

  return null;
}

function runCliclick(args: string[]): string {
  try {
    return execFileSync("cliclick", args, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(CLICLICK_NOT_FOUND);
    }
    const permError = detectPermissionError(err, "cliclick");
    if (permError) {
      throw new Error(permError);
    }
    throw err;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MOVE_SETTLE_MS = 50;
const ANIMATION_SPEED = 2000; // px per second
const ANIMATION_MAX_MS = 500;
const ANIMATION_MIN_DIST = 30; // below this, skip animation (just teleport + settle)
const ANIMATION_FPS = 60;

/** ease-out-cubic: decelerating to zero velocity */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Smoothly move the mouse from (fromX, fromY) to (toX, toY) with ease-out-cubic.
 * Short distances degrade to instant move + settle.
 */
async function animatedMove(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < ANIMATION_MIN_DIST) {
    runCliclick([`m:${toX},${toY}`]);
    await sleep(MOVE_SETTLE_MS);
    return;
  }

  const durationMs = Math.min(ANIMATION_MAX_MS, (dist / ANIMATION_SPEED) * 1000);
  const frameInterval = 1000 / ANIMATION_FPS;
  const totalFrames = Math.max(1, Math.round(durationMs / frameInterval));

  for (let i = 1; i <= totalFrames; i++) {
    const t = easeOutCubic(i / totalFrames);
    const x = Math.round(fromX + dx * t);
    const y = Math.round(fromY + dy * t);
    runCliclick([`m:${x},${y}`]);
    if (i < totalFrames) {
      await sleep(frameInterval);
    }
  }

  await sleep(MOVE_SETTLE_MS);
}

// Characters that cliclick `t:` cannot reliably handle
const NEEDS_CLIPBOARD_RE = /[^\x20-\x7E]|[\n\r\t]/;

/**
 * Type text via clipboard: pbcopy → pbpaste verify → Cmd+V paste → restore original clipboard.
 * Safer for CJK, emoji, newlines, and other special characters.
 */
function typeViaClipboard(text: string): void {
  // Save current clipboard
  let savedClipboard = "";
  try {
    savedClipboard = execSync("pbpaste", { encoding: "utf-8", timeout: 3000 });
  } catch {
    // empty or binary clipboard
  }

  try {
    // Write text to clipboard
    execSync("pbcopy", { input: text, timeout: 3000 });

    // Verify round-trip
    const verify = execSync("pbpaste", { encoding: "utf-8", timeout: 3000 });
    if (verify !== text) {
      throw new Error("Clipboard round-trip verification failed");
    }

    // Paste with Cmd+V
    runCliclick(["kd:cmd", "kp:v", "ku:cmd"]);
  } finally {
    // Restore original clipboard
    try {
      execSync("pbcopy", { input: savedClipboard, timeout: 3000 });
    } catch {
      // ignore restore errors
    }
  }
}

export class MacOSDriver implements DesktopDriver {
  private tmpDir: string;
  private cachedWidth = 0;
  private cachedHeight = 0;

  constructor() {
    this.tmpDir = mkdtempSync(join(tmpdir(), "mcc-screen-"));
  }

  async screenshot(width?: number): Promise<{ base64: string; width: number; height: number }> {
    const targetWidth = width || parseInt(process.env.MCC_SCREENSHOT_WIDTH || "1280", 10);
    const tmpFile = join(this.tmpDir, `screenshot-${Date.now()}.png`);

    try {
      // Capture screenshot (silent, no sound)
      try {
        execFileSync("screencapture", ["-x", "-t", "png", tmpFile], { timeout: 10000 });
      } catch (err: any) {
        const permError = detectPermissionError(err, "screencapture");
        if (permError) {
          throw new Error(permError);
        }
        throw err;
      }

      // Check for empty screenshot (some macOS versions produce empty file without error)
      try {
        const stat = statSync(tmpFile);
        if (stat.size === 0) {
          const terminal = getTerminalAppName();
          throw new Error(
            [
              "Screenshot file is empty — likely a Screen Recording permission issue.",
              `Fix: System Settings → Privacy & Security → Screen Recording → enable ${terminal}`,
              "Then restart the terminal.",
            ].join("\n")
          );
        }
      } catch (err: any) {
        if (err.message.includes("Screen Recording permission") || err.message.includes("Screenshot file is empty")) {
          throw err;
        }
        // File doesn't exist at all — screencapture failed silently
        const terminal = getTerminalAppName();
        throw new Error(
          [
            "Screen Recording permission required for screenshots.",
            `Fix: System Settings → Privacy & Security → Screen Recording → enable ${terminal}`,
            "Then restart the terminal.",
          ].join("\n")
        );
      }

      // Resize with sips
      execFileSync("sips", ["-Z", String(targetWidth), tmpFile], {
        timeout: 10000,
        stdio: "pipe",
      });

      // Get dimensions after resize
      const sipsOutput = execFileSync(
        "sips",
        ["-g", "pixelWidth", "-g", "pixelHeight", tmpFile],
        { encoding: "utf-8", timeout: 5000 }
      );

      let w = targetWidth;
      let h = 0;
      const wMatch = sipsOutput.match(/pixelWidth:\s*(\d+)/);
      const hMatch = sipsOutput.match(/pixelHeight:\s*(\d+)/);
      if (wMatch) w = parseInt(wMatch[1], 10);
      if (hMatch) h = parseInt(hMatch[1], 10);

      // Cache dimensions for getScreenSize()
      if (w && h) {
        this.cachedWidth = w;
        this.cachedHeight = h;
      }

      // Read and encode
      const buffer = readFileSync(tmpFile);
      const base64 = buffer.toString("base64");

      return { base64, width: w, height: h };
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  async mouseMove(x: number, y: number): Promise<void> {
    runCliclick([`m:${x},${y}`]);
    await sleep(MOVE_SETTLE_MS);
  }

  async leftClick(x: number, y: number): Promise<void> {
    runCliclick([`c:${x},${y}`]);
  }

  async rightClick(x: number, y: number): Promise<void> {
    runCliclick([`rc:${x},${y}`]);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    runCliclick([`dc:${x},${y}`]);
  }

  async drag(fx: number, fy: number, tx: number, ty: number): Promise<void> {
    // Press down at start point
    runCliclick([`dd:${fx},${fy}`]);
    // Animate to target
    await animatedMove(fx, fy, tx, ty);
    // Release at target
    runCliclick([`du:${tx},${ty}`]);
  }

  async typeText(text: string): Promise<void> {
    if (NEEDS_CLIPBOARD_RE.test(text)) {
      typeViaClipboard(text);
    } else {
      runCliclick([`t:${text}`]);
    }
  }

  async keyPress(keys: string): Promise<void> {
    const commands = parseKeyCombo(keys);

    // Separate modifier downs (kd:), main key press (kp:), and modifier ups (ku:)
    const downs = commands.filter((c) => c.startsWith("kd:"));
    const ups = commands.filter((c) => c.startsWith("ku:"));
    const presses = commands.filter((c) => c.startsWith("kp:"));

    if (downs.length === 0) {
      // No modifiers — simple key press, safe to batch
      runCliclick(presses);
      return;
    }

    // Press modifiers one by one, track pressed for LIFO cleanup
    const pressed: string[] = [];
    try {
      for (const down of downs) {
        runCliclick([down]);
        pressed.push(down.replace("kd:", "ku:"));
      }
      // Press main key(s)
      for (const press of presses) {
        runCliclick([press]);
      }
    } finally {
      // LIFO release — even if main key press fails, modifiers get released
      for (let i = pressed.length - 1; i >= 0; i--) {
        try {
          runCliclick([pressed[i]]);
        } catch {
          // best-effort release
        }
      }
    }
  }

  async scroll(direction: string, amount: number): Promise<void> {
    // Use real scroll wheel events via CoreGraphics (JXA bridge)
    // CGEventCreateScrollWheelEvent(source, unitType, wheelCount, deltaY, deltaX)
    // unitType 0 = kCGScrollEventUnitLine; positive = up/left, negative = down/right
    let deltaY = 0;
    let deltaX = 0;
    if (direction === "up") deltaY = amount;
    else if (direction === "down") deltaY = -amount;
    else if (direction === "left") deltaX = amount;
    else if (direction === "right") deltaX = -amount;

    try {
      const script = deltaX !== 0
        ? `ObjC.import("CoreGraphics"); var e = $.CGEventCreateScrollWheelEvent(null, 0, 2, ${deltaY}, ${deltaX}); $.CGEventPost(0, e);`
        : `ObjC.import("CoreGraphics"); var e = $.CGEventCreateScrollWheelEvent(null, 0, 1, ${deltaY}); $.CGEventPost(0, e);`;
      execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
        timeout: 5000,
        stdio: "pipe",
      });
    } catch {
      // Fallback to arrow keys if CoreGraphics scroll fails
      const keyName =
        direction === "up" ? "arrow-up"
          : direction === "left" ? "arrow-left"
            : direction === "right" ? "arrow-right"
              : "arrow-down";
      const commands: string[] = [];
      for (let i = 0; i < amount; i++) {
        commands.push(`kp:${keyName}`);
      }
      runCliclick(commands);
    }
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    // Use cached dimensions from last screenshot if available
    if (this.cachedWidth && this.cachedHeight) {
      return { width: this.cachedWidth, height: this.cachedHeight };
    }

    try {
      const output = execFileSync(
        "system_profiler",
        ["SPDisplaysDataType"],
        { encoding: "utf-8", timeout: 10000 }
      );
      const match = output.match(/Resolution:\s*(\d+)\s*x\s*(\d+)/);
      if (match) {
        return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
      }
    } catch {
      // fallback
    }
    return { width: 1920, height: 1080 };
  }

  async getCursorPosition(): Promise<{ x: number; y: number }> {
    const output = runCliclick(["p:"]);
    // Output format: "x,y" or similar
    const match = output.match(/(\d+),\s*(\d+)/);
    if (match) {
      return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
    }
    return { x: 0, y: 0 };
  }

  async getAccessibilityTree(appName?: string): Promise<{ snapshot: AccessibilitySnapshot; rawTree: string } | null> {
    return queryAccessibilityTree(appName);
  }

  async getElementAtPoint(x: number, y: number): Promise<AXElement | null> {
    return queryElementAtPoint(x, y);
  }

  async listApps(): Promise<AppInfo[] | null> {
    return queryListApps();
  }

  async activateApp(appName: string): Promise<boolean> {
    return queryActivateApp(appName);
  }
}

let _driver: DesktopDriver | null = null;

export function getDriver(): DesktopDriver {
  if (!_driver) {
    _driver = new MacOSDriver();
  }
  return _driver;
}

/** For testing: inject a mock driver */
export function setDriver(driver: DesktopDriver): void {
  _driver = driver;
}

/** Exported for testing */
export { getTerminalAppName, detectPermissionError };
