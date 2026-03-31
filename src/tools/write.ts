import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import type { ToolDefinition } from "../types.js";

export const WriteTool: ToolDefinition = {
  name: "Write",
  description:
    "Write content to a file. Creates the file if it doesn't exist, or overwrites if it does. Creates parent directories as needed.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Absolute path to the file to write",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["file_path", "content"],
  },
  async execute(input) {
    const filePath = resolve(input.file_path as string);
    const content = input.content as string;

    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const existed = existsSync(filePath);
      writeFileSync(filePath, content, "utf-8");

      const lines = content.split("\n").length;
      return existed
        ? `Updated ${filePath} (${lines} lines)`
        : `Created ${filePath} (${lines} lines)`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
};
