import type { ToolDefinition } from "../types.js";
import { renderMarkdown } from "../markdown.js";

/**
 * AskUserQuestion - allows the model to ask the user a question and wait for response.
 * Uses stdin raw mode to read input without interfering with readline.
 */
export const AskUserQuestionTool: ToolDefinition = {
  name: "AskUserQuestion",
  permissionLevel: "safe",
  description:
    "Ask the user a question and wait for their response. Use this when you need clarification, confirmation, or additional information from the user before proceeding. Do not use this for yes/no tool permission prompts.",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to ask the user",
      },
    },
    required: ["question"],
  },
  async execute(input) {
    const question = input.question as string;
    if (!question) return "Error: question is required";

    // Import readline dynamically to create a temporary interface
    const readline = await import("readline");

    return new Promise<string>((resolve) => {
      // Create a temporary readline interface for this question
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      const rendered = renderMarkdown(question).trimEnd();
      process.stdout.write(`\n\x1b[33m?\x1b[0m ${rendered}\n\x1b[36m❯ \x1b[0m`);

      rl.once("line", (answer) => {
        rl.close();
        resolve(answer.trim() || "(no response)");
      });
    });
  },
};
