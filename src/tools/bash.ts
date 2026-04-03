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

    // Foreground fallback (used when executeStreaming is not called)
    try {
      const result = execSync(command, {
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        shell: DEFAULT_SHELL,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const output = result.trim() || "(no output)";
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
      if (result.length > 50_000) {
        return result.slice(0, 50_000) + `\n\n... (truncated, ${result.length} total chars)`;
      }
      return result;
    }
  },

  async *executeStreaming(input, signal?) {
    const command = input.command as string;
    const timeout = Math.min((input.timeout as number) || 120_000, 600_000);
    const runInBackground = input.run_in_background as boolean;

    // Background tasks don't need streaming, use the original execute path
    if (runInBackground) {
      return await this.execute(input, signal);
    }

    const child = spawn(command, {
      shell: DEFAULT_SHELL,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let exitCode: number | null = null;
    let error: Error | null = null;

    // Timeout handler
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeout);

    // AbortSignal support
    const onAbort = () => {
      child.kill("SIGTERM");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    // Queue + resolve pattern to bridge events into the async generator
    const queue: string[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    child.stdout?.on("data", (data: Buffer) => {
      const str = data.toString();
      output += str;
      queue.push(str);
      resolve?.();
    });
    child.stderr?.on("data", (data: Buffer) => {
      const str = data.toString();
      output += str;
      queue.push(str);
      resolve?.();
    });
    child.on("close", (code) => {
      exitCode = code;
      done = true;
      resolve?.();
    });
    child.on("error", (err) => {
      error = err;
      done = true;
      resolve?.();
    });

    // Line buffer for \r (carriage return) progress bar handling
    let lineBuffer = "";
    let lastYielded = "";
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    function resolveCarriageReturn(line: string): string {
      const segments = line.split("\r");
      return segments[segments.length - 1];
    }

    function processChunk(raw: string): string[] {
      const lines: string[] = [];
      const combined = lineBuffer + raw;
      const parts = combined.split("\n");

      // Last element is the incomplete line, keep in buffer
      lineBuffer = parts.pop()!;

      // Process complete lines: resolve \r, keep only the last visible segment
      for (const part of parts) {
        const visible = resolveCarriageReturn(part);
        if (visible.trim()) lines.push(visible);
      }

      return lines;
    }

    try {
      // Drain loop: yield output chunks as they arrive
      while (!done) {
        if (queue.length > 0) {
          const batch = queue.splice(0).join("");
          const lines = processChunk(batch);

          // Yield complete lines (with \r resolved)
          if (lines.length > 0) {
            yield { type: "tool" as const, content: lines.join("\n") };
            lastYielded = "";
          }

          // For incomplete lines (progress bars), throttle yield (max once per 300ms)
          const currentLine = resolveCarriageReturn(lineBuffer);
          if (currentLine.trim() && currentLine !== lastYielded && !throttleTimer) {
            throttleTimer = setTimeout(() => { throttleTimer = null; }, 300);
            lastYielded = currentLine;
            yield { type: "tool" as const, content: currentLine, progress: true };
          }
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
          resolve = null;
        }
      }
      // Drain remaining queue through processChunk
      if (queue.length > 0) {
        const batch = queue.splice(0).join("");
        const lines = processChunk(batch);
        if (lines.length > 0) {
          yield { type: "tool" as const, content: lines.join("\n") };
        }
      }
      // Flush remaining line buffer
      if (lineBuffer.trim()) {
        const final = resolveCarriageReturn(lineBuffer);
        if (final.trim()) yield { type: "tool" as const, content: final };
      }
    } finally {
      clearTimeout(timer);
      if (throttleTimer) clearTimeout(throttleTimer);
      signal?.removeEventListener("abort", onAbort);
    }

    // Build final result for API context
    if (error) {
      return `Error: ${(error as Error).message}`;
    }
    const trimmed = output.trim() || "(no output)";
    if (trimmed.length > 50_000) {
      return trimmed.slice(0, 50_000) + `\n...(truncated, ${trimmed.length} total chars)`;
    }
    if (exitCode !== 0) {
      return `Exit code: ${exitCode}\n${trimmed}`;
    }
    return trimmed;
  },
};
