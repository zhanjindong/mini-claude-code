// Computer action handlers

import { execFileSync } from "node:child_process";
import type { ToolInput } from "../../types.js";
import { getDriver, getTerminalAppName } from "./platform.js";
import { analyzeScreenshot } from "./vlm.js";
import { tryAcquire } from "./lock.js";
import { formatTreeForLLM, isTreeSufficient, searchTree } from "./accessibility.js";
import { getConfig } from "../../config.js";

type ProgressCallback = (msg: string) => void;

let permissionsChecked = false;

/** Reset permission check state (for testing) */
export function resetPermissionsCheck(): void {
  permissionsChecked = false;
}

/** Skip permission check (for testing with mock drivers) */
export function skipPermissionsCheck(): void {
  permissionsChecked = true;
}

/**
 * One-time check that screencapture and cliclick are available and have necessary permissions.
 * Returns null if OK, or a diagnostic error string.
 */
function checkPermissions(): string | null {
  if (permissionsChecked) return null;
  permissionsChecked = true;

  const terminal = getTerminalAppName();
  const issues: string[] = [];

  // Check cliclick exists
  try {
    execFileSync("which", ["cliclick"], { encoding: "utf-8", timeout: 5000 });
  } catch {
    let installHint = "cliclick is not installed.";
    // Check if Homebrew is available
    try {
      execFileSync("which", ["brew"], { encoding: "utf-8", timeout: 3000 });
      installHint += "\nInstall with: brew install cliclick";
    } catch {
      installHint += "\nInstall Homebrew first (https://brew.sh), then: brew install cliclick";
    }
    issues.push(installHint);
  }

  // Check cliclick accessibility permission (try a harmless cursor position query)
  if (issues.length === 0) {
    try {
      execFileSync("cliclick", ["p:"], { encoding: "utf-8", timeout: 5000 });
    } catch (err: any) {
      const combined = ((err.stderr || "") + (err.stdout || "") + (err.message || "")).toLowerCase();
      if (combined.includes("accessibility") || combined.includes("trusted")) {
        issues.push(
          `Accessibility permission required for cliclick.\nFix: System Settings → Privacy & Security → Accessibility → enable ${terminal}\nThen restart the terminal.`
        );
      }
    }
  }

  // Check screencapture permission (capture to /dev/null)
  try {
    execFileSync("screencapture", ["-x", "-t", "png", "/dev/null"], {
      timeout: 5000,
      stdio: "pipe",
    });
  } catch {
    issues.push(
      `Screen Recording permission required.\nFix: System Settings → Privacy & Security → Screen Recording → enable ${terminal}\nThen restart the terminal.`
    );
  }

  return issues.length > 0 ? issues.join("\n\n") : null;
}

const TERMINAL_IGNORE_HINT =
  "IMPORTANT: The screenshot may include a terminal window running this CLI tool — ignore it completely. " +
  "Focus only on the other application windows and UI elements visible on screen.";

async function takeAndAnalyze(
  prompt: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const driver = getDriver();
  onProgress?.("  📸 Taking screenshot...");
  const { base64, width, height } = await driver.screenshot();

  onProgress?.("  🔍 Analyzing screenshot with VLM...");
  const fullPrompt = `${TERMINAL_IGNORE_HINT}\n\n${prompt}`;
  const analysis = await analyzeScreenshot(base64, fullPrompt);
  return `Screenshot (${width}x${height}):\n${analysis}`;
}

/**
 * Get screen context using accessibility tree (fast, free) with VLM fallback.
 * Strategy: "auto" = accessibility first, fallback to VLM if tree is insufficient.
 *           "accessibility" = accessibility only, no VLM.
 *           "vlm" = VLM only (original behavior).
 */
async function getScreenContext(
  prompt: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const driver = getDriver();
  const strategy = (getConfig() as any).screenStrategy || "auto";

  // Try accessibility tree first (unless forced to vlm-only)
  if (strategy !== "vlm" && driver.getAccessibilityTree) {
    onProgress?.("  🌳 Reading UI elements...");
    try {
      const result = await driver.getAccessibilityTree();
      if (result) {
        const { snapshot, rawTree } = result;
        if (strategy === "accessibility" || isTreeSufficient(snapshot, rawTree)) {
          const formatted = formatTreeForLLM(rawTree);
          return `Screen Context (accessibility, ${snapshot.elementCount} elements):\n${formatted}`;
        }
        // Tree exists but insufficient — will fallback to VLM
        onProgress?.("  ⚡ Accessibility tree too shallow, falling back to VLM...");
      }
    } catch {
      // Accessibility failed — fall through to VLM
    }
  }

  // Fallback to screenshot + VLM
  if (strategy !== "accessibility") {
    return takeAndAnalyze(prompt, onProgress);
  }

  return "No screen context available (accessibility tree was empty or insufficient).";
}

async function actionScreenshot(
  _input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  return takeAndAnalyze(
    "Describe the current screen content in detail. List all visible windows, UI elements, text, and their approximate positions.",
    onProgress
  );
}

async function actionMouseMove(input: ToolInput): Promise<string> {
  const x = input.x as number;
  const y = input.y as number;
  await getDriver().mouseMove(x, y);
  return `Mouse moved to (${x}, ${y})`;
}

async function actionLeftClick(
  input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const x = input.x as number;
  const y = input.y as number;
  await getDriver().leftClick(x, y);

  const screenshotAfter = input.screenshot_after !== false;
  if (screenshotAfter) {
    const analysis = await getScreenContext(
      `Describe what changed on screen after clicking at coordinates (${x}, ${y}). Focus on the area around the click point.`,
      onProgress
    );
    return `Clicked at (${x}, ${y})\n${analysis}`;
  }
  return `Clicked at (${x}, ${y})`;
}

async function actionRightClick(
  input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const x = input.x as number;
  const y = input.y as number;
  await getDriver().rightClick(x, y);

  const screenshotAfter = input.screenshot_after !== false;
  if (screenshotAfter) {
    const analysis = await getScreenContext(
      `Describe what changed on screen after right-clicking at coordinates (${x}, ${y}). Focus on any context menu that appeared.`,
      onProgress
    );
    return `Right-clicked at (${x}, ${y})\n${analysis}`;
  }
  return `Right-clicked at (${x}, ${y})`;
}

async function actionDoubleClick(
  input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const x = input.x as number;
  const y = input.y as number;
  await getDriver().doubleClick(x, y);

  const screenshotAfter = input.screenshot_after !== false;
  if (screenshotAfter) {
    const analysis = await getScreenContext(
      `Describe what changed on screen after double-clicking at coordinates (${x}, ${y}).`,
      onProgress
    );
    return `Double-clicked at (${x}, ${y})\n${analysis}`;
  }
  return `Double-clicked at (${x}, ${y})`;
}

async function actionDrag(
  input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const sx = input.start_x as number;
  const sy = input.start_y as number;
  const ex = input.end_x as number;
  const ey = input.end_y as number;
  await getDriver().drag(sx, sy, ex, ey);

  const screenshotAfter = input.screenshot_after !== false;
  if (screenshotAfter) {
    const analysis = await getScreenContext(
      `Describe what changed on screen after dragging from (${sx}, ${sy}) to (${ex}, ${ey}).`,
      onProgress
    );
    return `Dragged from (${sx}, ${sy}) to (${ex}, ${ey})\n${analysis}`;
  }
  return `Dragged from (${sx}, ${sy}) to (${ex}, ${ey})`;
}

async function actionType(input: ToolInput): Promise<string> {
  const text = input.text as string;
  await getDriver().typeText(text);
  return `Typed: "${text.length > 50 ? text.slice(0, 50) + "..." : text}"`;
}

async function actionKey(input: ToolInput): Promise<string> {
  const key = input.key as string;
  await getDriver().keyPress(key);
  return `Key pressed: ${key}`;
}

async function actionScroll(
  input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const direction = (input.direction as string) || "down";
  const amount = (input.amount as number) || 3;
  await getDriver().scroll(direction, amount);

  const screenshotAfter = input.screenshot_after !== false;
  if (screenshotAfter) {
    const analysis = await getScreenContext(
      `Describe the current screen content after scrolling ${direction}. What is now visible?`,
      onProgress
    );
    return `Scrolled ${direction} (${amount}x)\n${analysis}`;
  }
  return `Scrolled ${direction} (${amount}x)`;
}

async function actionCursorPosition(): Promise<string> {
  const { x, y } = await getDriver().getCursorPosition();
  return `Cursor position: (${x}, ${y})`;
}

async function actionListApps(
  _input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const driver = getDriver();
  if (!driver.listApps) {
    return "App listing not supported on this platform.";
  }
  onProgress?.("  📋 Listing visible applications...");
  const apps = await driver.listApps();
  if (!apps || apps.length === 0) {
    return "No visible applications found.";
  }
  const lines = apps.map((app) => {
    const winStr = app.windows.length > 0
      ? `: ${app.windows.map((w) => `"${w}"`).join(", ")}`
      : "";
    return `- ${app.name} (${app.windowCount} window${app.windowCount !== 1 ? "s" : ""})${winStr}`;
  });
  return `Visible Applications (${apps.length}):\n${lines.join("\n")}`;
}

async function actionActivateApp(input: ToolInput): Promise<string> {
  const appName = input.app_name as string;
  if (!appName) {
    return "Error: 'app_name' parameter is required for activate_app action.";
  }
  const driver = getDriver();
  if (!driver.activateApp) {
    return "App activation not supported on this platform.";
  }
  const ok = await driver.activateApp(appName);
  if (!ok) {
    return `Error: Could not activate app "${appName}". It may not be running. Use list_apps to see available apps.`;
  }
  return `Activated app: ${appName}`;
}

async function actionInspect(
  input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const driver = getDriver();
  if (!driver.getAccessibilityTree) {
    return "Accessibility inspection not supported on this platform.";
  }
  const appName = input.app_name as string | undefined;
  onProgress?.(`  🌳 Inspecting UI elements${appName ? ` of ${appName}` : ""}...`);
  const result = await driver.getAccessibilityTree(appName);
  if (!result) {
    return `No accessibility data available${appName ? ` for "${appName}"` : " for the frontmost application"}.`;
  }
  const { snapshot, rawTree } = result;
  return `UI Inspection (${snapshot.frontmostApp}, ${snapshot.elementCount} elements):\n${formatTreeForLLM(rawTree)}`;
}

async function actionFindElement(input: ToolInput): Promise<string> {
  const query = input.query as string;
  if (!query) {
    return "Error: 'query' parameter is required for find_element action.";
  }
  const driver = getDriver();
  if (!driver.getAccessibilityTree) {
    return "Accessibility not supported on this platform.";
  }
  const appName = input.app_name as string | undefined;
  const result = await driver.getAccessibilityTree(appName);
  if (!result) {
    return `No accessibility data available${appName ? ` for "${appName}"` : ""}.`;
  }
  const matches = searchTree(result.rawTree, query);
  if (matches.length === 0) {
    return `No UI element found matching "${query}"${appName ? ` in ${appName}` : ""}.`;
  }
  const top = matches.slice(0, 10);
  return `Found ${matches.length} element(s) matching "${query}":\n${top.join("\n")}`;
}

const ACTIONS: Record<
  string,
  (input: ToolInput, onProgress?: ProgressCallback) => Promise<string>
> = {
  screenshot: actionScreenshot,
  mouse_move: actionMouseMove,
  left_click: actionLeftClick,
  right_click: actionRightClick,
  double_click: actionDoubleClick,
  drag: actionDrag,
  type: actionType,
  key: actionKey,
  scroll: actionScroll,
  cursor_position: actionCursorPosition,
  list_apps: actionListApps,
  activate_app: actionActivateApp,
  inspect: actionInspect,
  find_element: actionFindElement,
};

export async function dispatch(
  input: ToolInput,
  onProgress?: ProgressCallback
): Promise<string> {
  const action = input.action as string;
  if (!action) {
    return "Error: 'action' parameter is required";
  }

  const handler = ACTIONS[action];
  if (!handler) {
    return `Error: Unknown action '${action}'. Valid actions: ${Object.keys(ACTIONS).join(", ")}`;
  }

  // One-time permission check
  const permError = checkPermissions();
  if (permError) {
    return `Error: Computer Use prerequisites not met:\n\n${permError}`;
  }

  // Acquire session lock (prevents multiple instances from controlling desktop)
  const lockError = tryAcquire();
  if (lockError) {
    return `Error: ${lockError}`;
  }

  try {
    return await handler(input, onProgress);
  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes("cliclick is required")) {
      return msg;
    }
    return `Error [${action}]: ${msg}`;
  }
}
