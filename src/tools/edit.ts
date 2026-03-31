import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { ToolDefinition } from "../types.js";

export const EditTool: ToolDefinition = {
  name: "Edit",
  description:
    "Perform exact string replacement in a file. Finds old_string and replaces it with new_string. The old_string must be unique in the file unless replace_all is true.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Absolute path to the file to edit",
      },
      old_string: {
        type: "string",
        description: "The exact string to find and replace",
      },
      new_string: {
        type: "string",
        description: "The replacement string",
      },
      replace_all: {
        type: "boolean",
        description: "Replace all occurrences (default: false)",
      },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  async execute(input) {
    const filePath = resolve(input.file_path as string);
    const oldStr = input.old_string as string;
    const newStr = input.new_string as string;
    const replaceAll = (input.replace_all as boolean) || false;

    if (oldStr === newStr) {
      return "Error: old_string and new_string are identical.";
    }

    try {
      if (!existsSync(filePath)) {
        return `Error: File not found: ${filePath}`;
      }

      const content = readFileSync(filePath, "utf-8");
      const occurrences = content.split(oldStr).length - 1;

      if (occurrences === 0) {
        return `Error: old_string not found in ${filePath}`;
      }

      if (occurrences > 1 && !replaceAll) {
        return `Error: Found ${occurrences} occurrences of old_string. Use replace_all=true to replace all, or provide more context to make the match unique.`;
      }

      const newContent = replaceAll
        ? content.replaceAll(oldStr, newStr)
        : content.replace(oldStr, newStr);

      writeFileSync(filePath, newContent, "utf-8");

      const count = replaceAll ? occurrences : 1;
      return `Replaced ${count} occurrence(s) in ${filePath}`;
    } catch (err: any) {
      return `Error editing file: ${err.message}`;
    }
  },
};
