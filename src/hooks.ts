import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import chalk from "chalk";

// Hook types
export type HookEvent = "beforeToolUse" | "afterToolResult";

// Single hook definition
export interface HookDefinition {
  event: HookEvent;
  toolName?: string;        // Match specific tool, omit to match all
  command: string;           // Shell command to execute
  timeout?: number;          // Timeout in ms, default 10000
}

// Hook config file structure (.claude/hooks.json)
export interface HooksConfig {
  hooks: HookDefinition[];
}

// Hook execution result
export interface HookResult {
  hook: HookDefinition;
  exitCode: number;
  stdout: string;
  stderr: string;
  blocked: boolean;  // beforeToolUse with non-zero exit blocks tool execution
  error?: string;
}

// Loaded hooks
let loadedHooks: HookDefinition[] = [];

// settings.json hook structures
interface SettingsHookEntry {
  type: string;
  command: string;
}

interface SettingsHookMatcher {
  matcher: string;
  hooks: SettingsHookEntry[];
  description?: string;
}

interface SettingsJson {
  hooks?: Record<string, SettingsHookMatcher[]>;
}

/** Map settings.json event names to our HookEvent type */
function mapSettingsEvent(event: string): HookEvent | null {
  switch (event) {
    case "PreToolUse": return "beforeToolUse";
    case "PostToolUse": return "afterToolResult";
    default: return null;
  }
}

/** Extract tool name from a settings.json matcher string (e.g. "Bash" from "Bash(command matches ...)") */
function extractToolName(matcher: string): string | undefined {
  if (!matcher) return undefined;
  const match = matcher.match(/^(\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Load hooks from settings.json and convert to HookDefinition[]
 */
function loadSettingsHooks(cwd: string): HookDefinition[] {
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  const hooks: HookDefinition[] = [];

  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as SettingsJson;
    if (!settings.hooks) return hooks;

    for (const [eventName, matchers] of Object.entries(settings.hooks)) {
      const event = mapSettingsEvent(eventName);
      if (!event || !Array.isArray(matchers)) continue;

      for (const matcher of matchers) {
        if (!Array.isArray(matcher.hooks)) continue;
        const toolName = extractToolName(matcher.matcher);

        for (const hookEntry of matcher.hooks) {
          if (hookEntry.type === "command" && hookEntry.command) {
            hooks.push({
              event,
              toolName,
              command: hookEntry.command,
            });
          }
        }
      }
    }
  } catch {
    // File doesn't exist or is invalid
  }

  return hooks;
}

/**
 * Load hooks from config files.
 * Search order: .claude/hooks.json -> ~/.claude/hooks.json -> .claude/settings.json (lowest priority)
 */
export function loadHooks(cwd?: string): HookDefinition[] {
  const resolvedCwd = cwd ?? process.cwd();
  const candidates = [
    path.join(resolvedCwd, ".claude", "hooks.json"),
    path.join(os.homedir(), ".claude", "hooks.json"),
  ];

  const hooks: HookDefinition[] = [];

  for (const filePath of candidates) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const config = JSON.parse(raw) as HooksConfig;
      if (Array.isArray(config.hooks)) {
        hooks.push(...config.hooks);
      }
    } catch {
      // File doesn't exist or is invalid
    }
  }

  // Also load hooks from settings.json (lower priority, appended after hooks.json)
  const settingsHooks = loadSettingsHooks(resolvedCwd);
  hooks.push(...settingsHooks);

  loadedHooks = hooks;
  return hooks;
}

/**
 * Get loaded hooks.
 */
export function getHooks(): HookDefinition[] {
  return loadedHooks;
}

/**
 * Find hooks matching a given event and tool name.
 */
export function findMatchingHooks(event: HookEvent, toolName: string): HookDefinition[] {
  return loadedHooks.filter(h => {
    if (h.event !== event) return false;
    if (h.toolName && h.toolName.toLowerCase() !== toolName.toLowerCase()) return false;
    return true;
  });
}

/**
 * Execute a single hook.
 * Environment variables injected: TOOL_NAME, TOOL_INPUT (JSON string), TOOL_RESULT (afterToolResult only)
 */
export function executeHook(
  hook: HookDefinition,
  env: Record<string, string>
): HookResult {
  const timeout = hook.timeout || 10000;

  try {
    const stdout = execSync(hook.command, {
      encoding: "utf-8",
      timeout,
      env: { ...process.env, ...env },
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
    });

    return {
      hook,
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: "",
      blocked: false,
    };
  } catch (err: any) {
    const exitCode = err.status ?? 1;
    return {
      hook,
      exitCode,
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || "").trim(),
      blocked: hook.event === "beforeToolUse" && exitCode !== 0,
      error: err.message,
    };
  }
}

/**
 * Run all matching hooks for a given event.
 * For beforeToolUse: any hook returning blocked=true stops tool execution.
 */
export function runHooks(
  event: HookEvent,
  toolName: string,
  env: Record<string, string>
): { blocked: boolean; results: HookResult[]; blockMessage?: string } {
  const matching = findMatchingHooks(event, toolName);
  if (matching.length === 0) {
    return { blocked: false, results: [] };
  }

  const results: HookResult[] = [];

  for (const hook of matching) {
    const result = executeHook(hook, { ...env, TOOL_NAME: toolName });
    results.push(result);

    if (result.blocked) {
      const message = result.stderr || result.stdout || `Hook blocked: ${hook.command}`;
      return { blocked: true, results, blockMessage: message };
    }
  }

  return { blocked: false, results };
}

/**
 * Prompt the user to override a hook block.
 * Returns true if the user chooses to proceed (override), false to respect the block.
 */
export async function promptHookOverride(
  toolName: string,
  blockMessage: string
): Promise<boolean> {
  const warnLine = chalk.bold.yellow(`  ⚠ Hook blocked: ${blockMessage}`);
  const toolLine = chalk.dim(`    Tool: ${toolName}`);
  const choiceLine = `    ${chalk.green("y")}${chalk.dim("(es)")} / ${chalk.red("n")}${chalk.dim("(o, default)")} `;

  process.stdout.write(`\n${warnLine}\n`);
  process.stdout.write(`${toolLine}\n`);
  process.stdout.write(choiceLine);

  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;

    const savedData = process.stdin.rawListeners("data");
    const savedKeypress = process.stdin.rawListeners("keypress");
    process.stdin.removeAllListeners("data");
    process.stdin.removeAllListeners("keypress");

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (buf: Buffer) => {
      process.stdin.setRawMode(wasRaw ?? false);

      for (const fn of savedData) process.stdin.on("data", fn as (...args: any[]) => void);
      for (const fn of savedKeypress) process.stdin.on("keypress", fn as (...args: any[]) => void);

      const char = buf.toString();

      // Ctrl+C → deny
      if (char === "\x03") {
        process.stdout.write("\n");
        resolve(false);
        return;
      }

      process.stdout.write("\n");
      const lower = char.toLowerCase();
      // Only explicit 'y' overrides; everything else (n, Enter, Esc, etc.) respects the block
      resolve(lower === "y");
    });
  });
}
