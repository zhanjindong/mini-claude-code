import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

// Hook types
export type HookEvent = "beforeToolUse" | "afterToolResult";

// Single hook definition
export interface HookDefinition {
  event: HookEvent;
  toolName?: string;        // Match specific tool, omit to match all
  command: string;           // Shell command to execute
  timeout?: number;          // Timeout in ms, default 10000
}

// Hook config file structure (.mcc/hooks.json)
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

/**
 * Load hooks from config files.
 * Search order: .mcc/hooks.json -> ~/.mcc/hooks.json
 */
export function loadHooks(cwd?: string): HookDefinition[] {
  const resolvedCwd = cwd ?? process.cwd();
  const candidates = [
    path.join(resolvedCwd, ".mcc", "hooks.json"),
    path.join(os.homedir(), ".mcc", "hooks.json"),
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
