import { glob } from "glob";
import { resolve, relative } from "path";
import type { ToolDefinition } from "../types.js";

export const GlobTool: ToolDefinition = {
  name: "Glob",
  permissionLevel: "safe",
  description:
    "Find files matching a glob pattern. Returns matching file paths sorted by modification time. Use patterns like '**/*.ts' or 'src/**/*.js'.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match files (e.g., '**/*.ts')",
      },
      path: {
        type: "string",
        description: "Directory to search in (defaults to cwd)",
      },
    },
    required: ["pattern"],
  },
  async execute(input) {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) || process.cwd();
    const cwd = resolve(searchPath);
    const MAX_FILES = 100;

    try {
      const files = await glob(pattern, {
        cwd,
        nodir: true,
        dot: true,
        ignore: ["**/node_modules/**", "**/.git/**"],
      });

      if (files.length === 0) {
        return "No files found matching the pattern.";
      }

      const limited = files.slice(0, MAX_FILES);
      const relativePaths = limited.map((f) => relative(process.cwd(), resolve(cwd, f)));
      let result = relativePaths.join("\n");

      if (files.length > MAX_FILES) {
        result += `\n\n(Showing ${MAX_FILES} of ${files.length} matches)`;
      }

      return result;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
