import type { ToolDefinition, EngineChunk } from "../types.js";
import { QueryEngine, type EngineOptions } from "../engine.js";
import { getConfig } from "../config.js";
import { loadContext } from "../context.js";
import chalk from "chalk";

function buildEngineOpts(): EngineOptions {
  const config = getConfig();
  const context = loadContext();
  return {
    provider: config.provider,
    model: config.model || undefined,
    maxTokens: config.maxTokens,
    baseURL: config.baseURL || undefined,
    apiKey: config.apiKey,
    contextContent: context.combinedContent || undefined,
  };
}

function finalizeResult(fullOutput: string, description: string, toolsUsed: number): string {
  const result = fullOutput.trim();
  if (!result) {
    return `Agent completed task "${description}" but produced no text output. Tools used: ${toolsUsed}`;
  }
  if (result.length > 30000) {
    return result.slice(0, 30000) + `\n\n... (truncated, ${result.length} total chars)`;
  }
  return result;
}

export const AgentTool: ToolDefinition = {
  name: "Agent",
  permissionLevel: "safe",
  description:
    "Launch a sub-agent to handle a complex task autonomously. The agent has its own conversation context and can use all available tools. Use this for tasks that require multiple steps or independent research.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "The task description for the sub-agent to accomplish",
      },
      description: {
        type: "string",
        description:
          "A short (3-5 word) description of what the agent will do",
      },
    },
    required: ["prompt"],
  },

  // Non-streaming fallback: collects all streaming output then returns
  async execute(input, signal?) {
    const prompt = input.prompt as string;
    const description = (input.description as string) || "sub-agent task";
    if (!prompt) return "Error: prompt is required";

    const subEngine = new QueryEngine(buildEngineOpts());
    let fullOutput = "";
    let toolCount = 0;

    try {
      for await (const chunk of subEngine.query(prompt, signal)) {
        if (chunk.type === "text") fullOutput += chunk.content;
        else if (chunk.type === "tool") toolCount++;
      }
    } catch (err: any) {
      return `Error: Sub-agent failed: ${err.message}`;
    }

    return finalizeResult(fullOutput, description, toolCount);
  },

  // Streaming execution: yields sub-agent chunks in real-time
  async *executeStreaming(input, signal?): AsyncGenerator<EngineChunk, string> {
    const prompt = input.prompt as string;
    const description = (input.description as string) || "sub-agent task";
    if (!prompt) return "Error: prompt is required";

    const subEngine = new QueryEngine(buildEngineOpts());
    let fullOutput = "";
    let toolCount = 0;

    try {
      for await (const chunk of subEngine.query(prompt, signal)) {
        if (chunk.type === "text") {
          fullOutput += chunk.content;
          yield { type: "tool", content: chalk.dim("  │ ") + chunk.content };
        } else if (chunk.type === "tool") {
          toolCount++;
          yield { type: "tool", content: "  " + chunk.content };
        }
      }
    } catch (err: any) {
      return `Error: Sub-agent failed: ${err.message}`;
    }

    return finalizeResult(fullOutput, description, toolCount);
  },
};
