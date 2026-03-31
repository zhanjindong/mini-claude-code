import { readFileSync, statSync } from "fs";
import { resolve } from "path";
import type { ToolDefinition } from "../types.js";

export const ReadTool: ToolDefinition = {
  name: "Read",
  permissionLevel: "safe",
  description:
    "Read a file from the filesystem. Returns file content with line numbers. The file_path must be an absolute path.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Absolute path to the file to read",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (1-indexed)",
      },
      limit: {
        type: "number",
        description: "Number of lines to read (default: 2000)",
      },
    },
    required: ["file_path"],
  },
  async execute(input) {
    const filePath = resolve(input.file_path as string);
    const offset = ((input.offset as number) || 1) - 1;
    const limit = (input.limit as number) || 2000;

    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return `Error: ${filePath} is a directory, not a file.`;
      }

      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const selected = lines.slice(offset, offset + limit);
      const numbered = selected.map(
        (line, i) => `${String(offset + i + 1).padStart(6)}\t${line}`
      );

      let result = numbered.join("\n");
      if (offset + limit < lines.length) {
        result += `\n\n... (${lines.length - offset - limit} more lines)`;
      }
      return result;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
};
