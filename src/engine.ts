// QueryEngine - OpenAI-compatible API engine
// Supports: MiniMax, DeepSeek, OpenRouter, OpenAI, and any compatible provider

import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import chalk from "chalk";
import { getToolByName, toOpenAITools } from "./tools/index.js";

export type EngineChunk =
  | { type: "text"; content: string }
  | { type: "tool"; content: string };

// Provider presets
const PROVIDERS: Record<string, { baseURL: string; defaultModel: string }> = {
  minimax: {
    baseURL: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-M2.5",
  },
  deepseek: {
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
  },
};

function buildSystemPrompt(skillsSummary?: string): string {
  let prompt = `You are a helpful AI coding assistant running in the user's terminal. You help with software engineering tasks including writing code, debugging, explaining code, running commands, and managing files.

Environment:
- Working directory: ${process.cwd()}
- Platform: ${process.platform}
- Shell: bash

Guidelines:
- Be concise and direct
- When asked to modify code, use the Edit tool for existing files and Write for new files
- Use Read to understand code before modifying it
- Use Bash for running commands, tests, git operations
- Use Glob and Grep to search the codebase
- Always use absolute paths for file operations`;

  if (skillsSummary) prompt += "\n" + skillsSummary;
  return prompt;
}

export interface EngineOptions {
  provider?: string;
  model?: string;
  maxTokens?: number;
  apiKey?: string;
  baseURL?: string;
  skillsSummary?: string;
}

export class QueryEngine {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private messages: ChatCompletionMessageParam[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  public providerName: string;
  private skillsSummary: string;

  constructor(options: EngineOptions = {}) {
    const provider = options.provider || "minimax";
    const preset = PROVIDERS[provider];
    this.providerName = provider;
    this.skillsSummary = options.skillsSummary || "";

    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.API_KEY || process.env.OPENAI_API_KEY,
      baseURL: options.baseURL || preset?.baseURL || "https://api.openai.com/v1",
    });

    this.model = options.model || preset?.defaultModel || "gpt-4o";
    this.maxTokens = options.maxTokens || 8192;
  }

  get tokenUsage() {
    return { input: this.totalInputTokens, output: this.totalOutputTokens };
  }

  get modelName() {
    return this.model;
  }

  // Core query loop: send → stream → execute tools → repeat
  async *query(userMessage: string): AsyncGenerator<EngineChunk> {
    this.messages.push({ role: "user", content: userMessage });

    while (true) {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        stream: true,
        messages: [
          { role: "system", content: buildSystemPrompt(this.skillsSummary) },
          ...this.messages,
        ],
        tools: toOpenAITools(),
      });

      let assistantContent = "";
      let inThinkTag = false; // Filter <think>...</think> tags from some models
      const toolCalls: Array<{
        index: number;
        id: string;
        function: { name: string; arguments: string };
      }> = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Stream text (filter out <think> blocks)
        if (delta.content) {
          assistantContent += delta.content;
          let text = delta.content;

          // Handle <think> tag filtering
          if (text.includes("<think>")) inThinkTag = true;
          if (inThinkTag) {
            if (text.includes("</think>")) {
              inThinkTag = false;
              text = text.split("</think>").slice(1).join("");
            } else {
              text = "";
            }
          }
          if (text) yield { type: "text", content: text };
        }

        // Accumulate tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            let existing = toolCalls.find((t) => t.index === idx);
            if (!existing) {
              existing = {
                index: idx,
                id: tc.id || "",
                function: { name: "", arguments: "" },
              };
              toolCalls.push(existing);
            }
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments)
              existing.function.arguments += tc.function.arguments;
          }
        }

        // Track usage
        if (chunk.usage) {
          this.totalInputTokens += chunk.usage.prompt_tokens || 0;
          this.totalOutputTokens += chunk.usage.completion_tokens || 0;
        }
      }

      // Build assistant message for history
      const assistantMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: assistantContent || null,
      };
      if (toolCalls.length > 0) {
        (assistantMsg as any).tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
      }
      this.messages.push(assistantMsg);

      // No tool calls → done
      if (toolCalls.length === 0) break;

      // Execute each tool
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        let parsedInput: Record<string, unknown>;

        try {
          parsedInput = JSON.parse(tc.function.arguments);
        } catch {
          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: Invalid JSON in tool arguments`,
          });
          yield { type: "tool", content: `\n${chalk.red("✗")} ${chalk.bold(toolName)} ${chalk.red("Invalid JSON arguments")}\n` };
          continue;
        }

        // Show tool invocation header
        const inputSummary = formatToolInput(toolName, parsedInput);
        yield { type: "tool", content: `\n${chalk.cyan("⚡")} ${chalk.bold(toolName)}${inputSummary ? chalk.dim(` ${inputSummary}`) : ""}\n` };

        // Execute
        const tool = getToolByName(toolName);
        let result: string;

        if (!tool) {
          result = `Error: Unknown tool '${toolName}'`;
        } else {
          try {
            result = await tool.execute(parsedInput);
          } catch (err: any) {
            result = `Error executing ${toolName}: ${err.message}`;
          }
        }

        // Truncate for API
        if (result.length > 30_000) {
          result =
            result.slice(0, 30_000) +
            `\n\n... (truncated, ${result.length} total chars)`;
        }

        // Show tool result summary (Claude Code style with ⎿)
        const resultPreview = formatToolResult(toolName, result);
        if (resultPreview) {
          yield { type: "tool", content: chalk.dim(`  ⎿ ${resultPreview}\n`) };
        }

        this.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      // Loop back to API with tool results
    }
  }

  clearHistory() {
    this.messages = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }
}

function formatToolInput(
  toolName: string,
  input: Record<string, unknown>
): string {
  switch (toolName.toLowerCase()) {
    case "bash":
      return `\`${input.command}\``;
    case "read":
      return `${input.file_path}`;
    case "write":
      return `${input.file_path}`;
    case "edit":
      return `${input.file_path}`;
    case "glob":
      return `${input.pattern}${input.path ? ` in ${input.path}` : ""}`;
    case "grep":
      return `/${input.pattern}/${input.path ? ` in ${input.path}` : ""}`;
    case "skill":
      return `${input.skill}${input.args ? ` ${input.args}` : ""}`;
    default:
      return "";
  }
}

const MAX_RESULT_LINES = 5;
const MAX_RESULT_LINE_LEN = 120;

function truncLine(line: string): string {
  return line.length > MAX_RESULT_LINE_LEN
    ? line.slice(0, MAX_RESULT_LINE_LEN) + "…"
    : line;
}

function formatToolResult(toolName: string, result: string): string {
  if (!result) return "";
  const isError = result.startsWith("Error");

  // For errors, show the first line
  if (isError) return chalk.red(truncLine(result.split("\n")[0]));

  const lines = result.split("\n").filter((l) => l.trim());
  const name = toolName.toLowerCase();

  switch (name) {
    case "bash": {
      // Show first few lines of output
      if (lines.length === 0) return "(no output)";
      const preview = lines
        .slice(0, MAX_RESULT_LINES)
        .map(truncLine)
        .join("\n    ");
      const more =
        lines.length > MAX_RESULT_LINES
          ? `\n    … +${lines.length - MAX_RESULT_LINES} lines`
          : "";
      return preview + more;
    }
    case "read":
      return `${lines.length} lines`;
    case "write":
      return result.includes("successfully") ? "✓" : truncLine(lines[0]);
    case "edit":
      return result.includes("successfully") ? "✓" : truncLine(lines[0]);
    case "glob":
      if (lines.length === 0) return "no matches";
      return lines.length <= 3
        ? lines.map(truncLine).join(", ")
        : `${lines.slice(0, 3).map(truncLine).join(", ")} … +${lines.length - 3} more`;
    case "grep":
      if (lines.length === 0) return "no matches";
      return `${lines.length} match${lines.length > 1 ? "es" : ""}`;
    case "skill":
      // Don't preview skill body expansion
      return "✓ expanded";
    default: {
      if (lines.length === 0) return "(empty)";
      return truncLine(lines[0]);
    }
  }
}
