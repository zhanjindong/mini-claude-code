import { execSync, spawn } from "child_process";
import type { ToolDefinition } from "../types.js";

const IS_WINDOWS = process.platform === "win32";
const DEFAULT_SHELL = IS_WINDOWS ? "cmd.exe" : "/bin/bash";

// Background task storage
const backgroundTasks = new Map<number, { command: string; output: string; done: boolean; exitCode: number | null }>();
let nextBgId = 1;

export function getBackgroundTask(id: number) {
  return backgroundTasks.get(id);
}

export function listBackgroundTasks() {
  return [...backgroundTasks.entries()].map(([id, t]) => ({
    id,
    command: t.command,
    done: t.done,
    exitCode: t.exitCode,
  }));
}

export const BashTool: ToolDefinition = {
  name: "Bash",
  permissionLevel: "execute",
  description:
    "Execute a bash command and return its output. Use this for running shell commands, installing packages, running tests, git operations, etc. Supports background execution for long-running tasks.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 120000, max: 600000)",
      },
      description: {
        type: "string",
        description: "Short description of what this command does",
      },
      run_in_background: {
        type: "boolean",
        description: "Run the command in the background. Returns a task ID that can be checked later with TaskOutput.",
      },
    },
    required: ["command"],
  },
  async execute(input) {
    const command = input.command as string;
    const timeout = Math.min((input.timeout as number) || 120_000, 600_000);
    const runInBackground = input.run_in_background as boolean;

    if (runInBackground) {
      const bgId = nextBgId++;
      const task = { command, output: "", done: false, exitCode: null as number | null };
      backgroundTasks.set(bgId, task);

      const child = spawn(command, {
        shell: DEFAULT_SHELL,
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdout?.on("data", (data: Buffer) => {
        task.output += data.toString();
      });
      child.stderr?.on("data", (data: Buffer) => {
        task.output += data.toString();
      });
      child.on("close", (code) => {
        task.done = true;
        task.exitCode = code;
      });

      return `Background task started (ID: ${bgId}). Use TaskList or query task output to check status.`;
    }

    try {
      const result = execSync(command, {
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        shell: DEFAULT_SHELL,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = result.trim() || "(no output)";
      // Truncate very large outputs
      if (output.length > 50_000) {
        return output.slice(0, 50_000) + `\n\n... (truncated, ${output.length} total chars)`;
      }
      return output;
    } catch (err: any) {
      const stdout = err.stdout?.toString().trim() || "";
      const stderr = err.stderr?.toString().trim() || "";
      const exitCode = err.status ?? 1;
      let result = `Exit code: ${exitCode}`;
      if (stdout) result += `\nstdout:\n${stdout}`;
      if (stderr) result += `\nstderr:\n${stderr}`;
      // Truncate error output too
      if (result.length > 50_000) {
        return result.slice(0, 50_000) + `\n\n... (truncated, ${result.length} total chars)`;
      }
      return result;
    }
  },
};
