// macOS desktop driver via screencapture + cliclick

import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseKeyCombo } from "./key-mapping.js";

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

export class MacOSDriver implements DesktopDriver {
  private tmpDir: string;

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
    runCliclick([`dd:${fx},${fy}`, `du:${tx},${ty}`]);
  }

  async typeText(text: string): Promise<void> {
    runCliclick([`t:${text}`]);
  }

  async keyPress(keys: string): Promise<void> {
    const commands = parseKeyCombo(keys);
    runCliclick(commands);
  }

  async scroll(direction: string, amount: number): Promise<void> {
    const keyName =
      direction === "up"
        ? "arrow-up"
        : direction === "left"
          ? "arrow-left"
          : direction === "right"
            ? "arrow-right"
            : "arrow-down";
    const commands: string[] = [];
    for (let i = 0; i < amount; i++) {
      commands.push(`kp:${keyName}`);
    }
    runCliclick(commands);
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    try {
      const output = execFileSync(
        "system_profiler",
        ["SPDisplaysDataType"],
        { encoding: "utf-8", timeout: 10000 }
      );
      // Parse resolution like "Resolution: 2560 x 1600 Retina"
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
