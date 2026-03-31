import { execSync, spawn } from "child_process";
import type { ToolDefinition } from "../types.js";

export const BashTool: ToolDefinition = {
  name: "Bash",
  description:
    "Execute a bash command and return its output. Use this for running shell commands, installing packages, running tests, git operations, etc.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 120000)",
      },
    },
    required: ["command"],
  },
  async execute(input) {
    const command = input.command as string;
    const timeout = (input.timeout as number) || 120_000;

    try {
      const result = execSync(command, {
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        shell: "/bin/bash",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.trim() || "(no output)";
    } catch (err: any) {
      const stdout = err.stdout?.toString().trim() || "";
      const stderr = err.stderr?.toString().trim() || "";
      const exitCode = err.status ?? 1;
      let result = `Exit code: ${exitCode}`;
      if (stdout) result += `\nstdout:\n${stdout}`;
      if (stderr) result += `\nstderr:\n${stderr}`;
      return result;
    }
  },
};
