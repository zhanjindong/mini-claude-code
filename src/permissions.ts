// Permission system — session-level tool authorization with interactive prompts

import chalk from "chalk";
import { saveUserConfig, getConfig } from "./config.js";

// --- Type definitions ---

/** Permission classification declared by each tool. */
export type PermissionLevel = "safe" | "write" | "execute";

/** User response to a permission prompt. */
export type UserDecision = "allow-once" | "allow-always" | "deny" | "deny-always";

/** Result of a permission check. */
export interface PermissionResult {
  granted: boolean;
  reason?: string;
}

// --- Session rules (in-memory, not persisted) ---

/** Key: tool name (lowercase), value: session-level decision. */
const sessionRules: Map<string, "allow" | "deny"> = new Map();

/**
 * Initialize permission session rules from config presets.
 * Called once at startup from index.ts after loadConfig().
 */
export function initPermissions(
  configPermissions: Record<string, "allow" | "deny" | "ask">
): void {
  sessionRules.clear();
  for (const [tool, action] of Object.entries(configPermissions)) {
    if (action === "allow" || action === "deny") {
      sessionRules.set(tool.toLowerCase(), action);
    }
    // "ask" entries are intentionally not pre-loaded — they fall through to prompting
  }
}

/**
 * Clear all session rules. Intended for testing only.
 */
export function resetPermissions(): void {
  sessionRules.clear();
}

// --- User interaction via stdin raw mode ---

/**
 * Prompt the user for a single-character permission decision.
 * Uses stdin raw mode to read one keypress, then restores the original mode.
 */
async function promptUser(
  toolName: string,
  inputSummary: string
): Promise<UserDecision> {
  const toolLine = chalk.bold.yellow(`  ⚠ ${toolName}`);
  const detailLine = inputSummary ? chalk.dim(`    ${inputSummary}`) : "";
  const choiceLine = `    ${chalk.green("y")}${chalk.dim("es")} / ${chalk.cyan("a")}${chalk.dim("lways")} / ${chalk.red("n")}${chalk.dim("o")} / ${chalk.red("d")}${chalk.dim("eny-always")} `;

  process.stdout.write(`\n${toolLine}\n`);
  if (detailLine) process.stdout.write(`${detailLine}\n`);
  process.stdout.write(choiceLine);

  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;

    // Temporarily remove other stdin listeners to prevent keystroke leaking
    // into readline's input buffer (which would echo y/n/a/d into the prompt)
    const savedData = process.stdin.rawListeners("data");
    const savedKeypress = process.stdin.rawListeners("keypress");
    process.stdin.removeAllListeners("data");
    process.stdin.removeAllListeners("keypress");

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (buf: Buffer) => {
      process.stdin.setRawMode(wasRaw ?? false);

      // Restore other listeners
      for (const fn of savedData) process.stdin.on("data", fn as (...args: any[]) => void);
      for (const fn of savedKeypress) process.stdin.on("keypress", fn as (...args: any[]) => void);

      const char = buf.toString();

      // Handle Ctrl+C gracefully
      if (char === "\x03") {
        process.stdout.write("\n");
        resolve("deny");
        return;
      }

      const lower = char.toLowerCase();
      process.stdout.write("\n");

      if (lower === "a") {
        resolve("allow-always");
      } else if (lower === "d") {
        resolve("deny-always");
      } else if (lower === "n" || char === "\x1b") {
        resolve("deny");
      } else {
        // y, Y, Enter, or any other key defaults to allow-once
        resolve("allow-once");
      }
    });
  });
}

// --- Main permission check ---

/**
 * Check whether a tool invocation is permitted.
 *
 * Decision tree:
 * 1. Config preset (allow/deny) — immediate answer
 * 2. Session rules (allow-always / deny from earlier prompt) — immediate answer
 * 3. Permission level "safe" — auto-allow
 * 4. Interactive prompt for "write" / "execute" tools
 *
 * allow-always results are persisted in sessionRules for the remainder of the session.
 */
export async function checkPermission(
  toolName: string,
  permissionLevel: PermissionLevel,
  inputSummary: string,
  configPermissions: Record<string, "allow" | "deny" | "ask">
): Promise<PermissionResult> {
  const key = toolName.toLowerCase();

  // Step 1: Check config presets
  const preset = configPermissions[key];
  if (preset === "allow") {
    return { granted: true, reason: "config preset: allow" };
  }
  if (preset === "deny") {
    return { granted: false, reason: "config preset: deny" };
  }
  // preset === "ask" or undefined — fall through

  // Step 2: Check session rules
  const sessionRule = sessionRules.get(key);
  if (sessionRule === "allow") {
    return { granted: true, reason: "session rule: allow-always" };
  }
  if (sessionRule === "deny") {
    return { granted: false, reason: "session rule: deny" };
  }

  // Step 3: Safe tools pass without prompting
  if (permissionLevel === "safe") {
    return { granted: true, reason: "permission level: safe" };
  }

  // Step 4: Prompt user for write/execute tools
  const decision = await promptUser(toolName, inputSummary);

  switch (decision) {
    case "allow-once":
      return { granted: true, reason: "user: allow-once" };

    case "allow-always":
      sessionRules.set(key, "allow");
      // Persist to user config for cross-session memory
      try {
        const currentConfig = getConfig();
        const permissions = { ...currentConfig.permissions, [key]: "allow" as const };
        saveUserConfig({ permissions });
      } catch {
        // Persistence failure should not block current session
      }
      return { granted: true, reason: "user: allow-always (persisted)" };

    case "deny":
      return { granted: false, reason: "user: deny" };

    case "deny-always":
      sessionRules.set(key, "deny");
      // Persist to user config for cross-session memory
      try {
        const currentConfig = getConfig();
        const permissions = { ...currentConfig.permissions, [key]: "deny" as const };
        saveUserConfig({ permissions });
      } catch {
        // Persistence failure should not block current session
      }
      return { granted: false, reason: "user: deny-always (persisted)" };
  }
}
