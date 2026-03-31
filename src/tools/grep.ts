import { execSync } from "child_process";
import { resolve, relative } from "path";
import type { ToolDefinition } from "../types.js";

export const GrepTool: ToolDefinition = {
  name: "Grep",
  permissionLevel: "safe",
  description:
    "Search file contents using ripgrep (rg). Supports regex patterns. Falls back to grep if rg is not installed.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Regex pattern to search for",
      },
      path: {
        type: "string",
        description: "File or directory to search (defaults to cwd)",
      },
      glob: {
        type: "string",
        description: "File glob filter (e.g., '*.ts')",
      },
      case_insensitive: {
        type: "boolean",
        description: "Case insensitive search",
      },
    },
    required: ["pattern"],
  },
  async execute(input) {
    const pattern = input.pattern as string;
    const searchPath = resolve((input.path as string) || process.cwd());
    const fileGlob = input.glob as string | undefined;
    const caseInsensitive = input.case_insensitive as boolean | undefined;

    // Try ripgrep first, fallback to grep
    const useRg = hasCommand("rg");
    const MAX_LINES = 200;

    try {
      let cmd: string;
      if (useRg) {
        const args = ["rg", "--hidden", "--no-heading", "--line-number"];
        args.push("--max-count", "100");
        args.push("--max-columns", "500");
        args.push("--glob", "!.git");
        args.push("--glob", "!node_modules");
        if (fileGlob) args.push("--glob", fileGlob);
        if (caseInsensitive) args.push("-i");
        args.push("--", JSON.stringify(pattern).slice(1, -1));
        args.push(JSON.stringify(searchPath));
        cmd = args.join(" ");
      } else {
        const args = ["grep", "-rn", "--include='*'"];
        if (fileGlob) args.push(`--include='${fileGlob}'`);
        if (caseInsensitive) args.push("-i");
        args.push(`'${pattern}'`);
        args.push(JSON.stringify(searchPath));
        cmd = args.join(" ");
      }

      const result = execSync(cmd, {
        encoding: "utf-8",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 30_000,
      });

      const lines = result.trim().split("\n");
      // Relativize paths
      const relativized = lines.map((line) => {
        if (line.startsWith(searchPath)) {
          return relative(process.cwd(), line.replace(/^/, ""));
        }
        return line;
      });

      if (relativized.length > MAX_LINES) {
        return (
          relativized.slice(0, MAX_LINES).join("\n") +
          `\n\n(Showing ${MAX_LINES} of ${relativized.length} matches)`
        );
      }

      return relativized.join("\n") || "No matches found.";
    } catch (err: any) {
      if (err.status === 1) return "No matches found.";
      return `Error: ${err.message}`;
    }
  },
};

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
