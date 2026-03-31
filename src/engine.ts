// QueryEngine - OpenAI-compatible API engine
// Supports: MiniMax, DeepSeek, OpenRouter, OpenAI, and any compatible provider

import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import chalk from "chalk";
import { getToolByName, toOpenAITools } from "./tools/index.js";
import { checkPermission } from "./permissions.js";
import { getConfig } from "./config.js";
import { runHooks } from "./hooks.js";

export type EngineChunk =
  | { type: "text"; content: string }
  | { type: "tool"; content: string };

// Provider presets
const PROVIDERS: Record<string, { baseURL: string; defaultModel: string; contextWindow: number }> = {
  minimax: {
    baseURL: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-M2.5",
    contextWindow: 128000,
  },
  deepseek: {
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    contextWindow: 64000,
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    contextWindow: 128000,
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
    contextWindow: 200000,
  },
};

function buildSystemPrompt(skillsSummary?: string, contextContent?: string): string {
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
  if (contextContent) prompt += "\n\n---\n\n" + contextContent;
  return prompt;
}

export interface EngineOptions {
  provider?: string;
  model?: string;
  maxTokens?: number;
  apiKey?: string;
  baseURL?: string;
  skillsSummary?: string;
  contextContent?: string;
  contextWindow?: number;
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
  private contextContent: string;
  private contextWindow: number;

  constructor(options: EngineOptions = {}) {
    const provider = options.provider || "minimax";
    const preset = PROVIDERS[provider];
    this.providerName = provider;
    this.skillsSummary = options.skillsSummary || "";
    this.contextContent = options.contextContent || "";

    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.API_KEY || process.env.OPENAI_API_KEY,
      baseURL: options.baseURL || preset?.baseURL || "https://api.openai.com/v1",
    });

    this.model = options.model || preset?.defaultModel || "gpt-4o";
    this.maxTokens = options.maxTokens || 8192;
    this.contextWindow = options.contextWindow || preset?.contextWindow || 128000;
  }

  get tokenUsage() {
    return { input: this.totalInputTokens, output: this.totalOutputTokens };
  }

  get modelName() {
    return this.model;
  }

  /** Estimate total tokens in conversation history */
  estimateHistoryTokens(): number {
    let chars = 0;
    for (const msg of this.messages) {
      if (typeof msg.content === "string") {
        chars += (msg.content || "").length;
      }
    }
    // Rough estimate: 1 token ≈ 3 chars (balances English ~4 and CJK ~2)
    return Math.ceil(chars / 3);
  }

  // Core query loop: send → stream → execute tools → repeat
  async *query(userMessage: string, signal?: AbortSignal): AsyncGenerator<EngineChunk> {
    this.messages.push({ role: "user", content: userMessage });

    while (true) {
      if (signal?.aborted) break;

      // Auto-compact when approaching context window limit
      const estimatedTokens = this.estimateHistoryTokens();
      const threshold = this.contextWindow * 0.75;

      if (estimatedTokens > threshold && this.messages.length > 6) {
        yield { type: "tool", content: chalk.dim(`  \u27F3 Auto-compacting conversation (${estimatedTokens} est. tokens, limit: ${this.contextWindow})...\n`) };
        try {
          const result = await this.compactHistory();
          yield { type: "tool", content: chalk.dim(`  \u23BF Compacted: removed ${result.removed} messages, kept ${result.kept}\n`) };
        } catch {
          // compact failure should not block the query
        }
      }

      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: buildSystemPrompt(this.skillsSummary, this.contextContent) },
            ...this.messages,
          ],
          tools: toOpenAITools(),
        },
        { signal }
      );

      let assistantContent = "";
      let inThinkTag = false; // Filter <think>...</think> tags from some models
      const toolCalls: Array<{
        index: number;
        id: string;
        function: { name: string; arguments: string };
      }> = [];

      for await (const chunk of stream) {
        if (signal?.aborted) break;
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
      if (signal?.aborted) break;

      // Execute each tool
      for (const tc of toolCalls) {
        if (signal?.aborted) break;
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
          yield { type: "tool", content: `${chalk.red("✗")} ${chalk.bold(toolName)} ${chalk.red("Invalid JSON arguments")}\n` };
          continue;
        }

        // Compute input summary and resolve tool
        const inputSummary = formatToolInput(toolName, parsedInput);
        const tool = getToolByName(toolName);

        // Permission check
        const permLevel = tool?.permissionLevel || "execute";
        const permission = await checkPermission(toolName, permLevel, inputSummary, getConfig().permissions);
        if (!permission.granted) {
          yield { type: "tool", content: `${chalk.yellow("⊘")} ${chalk.bold(toolName)} ${chalk.yellow(permission.reason || "denied")}\n` };
          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: Tool execution denied by user`,
          });
          continue;
        }

        // beforeToolUse hooks
        const beforeResult = runHooks("beforeToolUse", toolName, {
          TOOL_INPUT: JSON.stringify(parsedInput),
        });
        if (beforeResult.blocked) {
          yield { type: "tool", content: `${chalk.yellow("⊘")} ${chalk.bold(toolName)} ${chalk.yellow("blocked by hook: " + beforeResult.blockMessage)}\n` };
          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: Tool execution blocked by hook: ${beforeResult.blockMessage}`,
          });
          continue;
        }

        // Show tool invocation header
        yield { type: "tool", content: `${chalk.cyan("⚡")} ${chalk.bold(toolName)}${inputSummary ? chalk.dim(` ${inputSummary}`) : ""}\n` };

        // Execute
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

        // afterToolResult hooks
        runHooks("afterToolResult", toolName, {
          TOOL_INPUT: JSON.stringify(parsedInput),
          TOOL_RESULT: result.slice(0, 10000),
        });

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

  /** Get current messages for serialization */
  getMessages(): ChatCompletionMessageParam[] {
    return [...this.messages];
  }

  /** Restore messages from a saved session */
  restoreMessages(messages: ChatCompletionMessageParam[]): void {
    this.messages = [...messages];
  }

  /**
   * Compact conversation history by summarizing old messages.
   * Keeps recent messages intact, replaces older ones with a concise summary.
   */
  async compactHistory(keepRecent: number = 4): Promise<{ removed: number; kept: number }> {
    if (this.messages.length <= keepRecent + 1) {
      return { removed: 0, kept: this.messages.length };
    }

    // Split messages: old (to summarize) and recent (to keep)
    const oldMessages = this.messages.slice(0, -keepRecent);
    const recentMessages = this.messages.slice(-keepRecent);

    // Ask LLM to summarize the old conversation
    const summaryRequest: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "Summarize the following conversation concisely. Focus on: key decisions made, files modified, problems encountered and resolved, current task state. Output a structured summary in markdown.",
      },
      ...oldMessages,
      {
        role: "user",
        content:
          "Please provide a concise summary of the above conversation, focusing on what was accomplished and the current state.",
      },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 2048,
      messages: summaryRequest,
    });

    const summary = response.choices[0]?.message?.content || "(no summary generated)";

    // Replace old messages with summary
    this.messages = [
      {
        role: "user",
        content: `[Conversation Summary]\n${summary}`,
      },
      {
        role: "assistant",
        content:
          "I've reviewed the conversation summary and I'm ready to continue. What would you like to do next?",
      },
      ...recentMessages,
    ];

    // Track token usage from summary request
    if (response.usage) {
      this.totalInputTokens += response.usage.prompt_tokens || 0;
      this.totalOutputTokens += response.usage.completion_tokens || 0;
    }

    return { removed: oldMessages.length, kept: recentMessages.length + 2 };
  }

  /** Get current message count */
  get messageCount(): number {
    return this.messages.length;
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
    case "webfetch":
      return `${input.url}`;
    case "agent":
      return input.description
        ? `${input.description}`
        : `${((input.prompt as string) || "").slice(0, 60)}...`;
    case "taskcreate":
      return `${input.description}`;
    case "taskupdate":
      return `#${input.id}${input.status ? ` → ${input.status}` : ""}`;
    case "tasklist":
      return "";
    default:
      if (toolName.startsWith("mcp_")) {
        const args = Object.entries(input)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
        return args.length > 100 ? args.slice(0, 100) + "..." : args;
      }
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
    case "webfetch":
      if (lines.length === 0) return "(empty)";
      return `${lines.length} lines fetched`;
    case "agent":
      if (lines.length === 0) return "(no output)";
      return `${lines.length} lines from sub-agent`;
    case "taskcreate":
    case "taskupdate":
      return truncLine(lines[0]);
    case "tasklist":
      return `${lines.length} task${lines.length !== 1 ? "s" : ""}`;
    default: {
      if (lines.length === 0) return "(empty)";
      return truncLine(lines[0]);
    }
  }
}
