import type { ToolDefinition } from "../types.js";
import { QueryEngine, type EngineOptions } from "../engine.js";
import { getConfig } from "../config.js";
import { loadContext } from "../context.js";

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
  async execute(input) {
    const prompt = input.prompt as string;
    const description = (input.description as string) || "sub-agent task";

    if (!prompt) {
      return "Error: prompt is required";
    }

    const config = getConfig();
    const context = loadContext();

    // Create a sub-agent engine with same config
    const engineOpts: EngineOptions = {
      provider: config.provider,
      model: config.model || undefined,
      maxTokens: config.maxTokens,
      baseURL: config.baseURL || undefined,
      apiKey: config.apiKey,
      contextContent: context.combinedContent || undefined,
    };

    const subEngine = new QueryEngine(engineOpts);

    // Collect all output from the sub-agent
    let fullOutput = "";
    const toolsUsed: string[] = [];

    try {
      for await (const chunk of subEngine.query(prompt)) {
        if (chunk.type === "text") {
          fullOutput += chunk.content;
        } else if (chunk.type === "tool") {
          // Track tool usage for summary
          toolsUsed.push(chunk.content.trim());
        }
      }
    } catch (err: any) {
      return `Error: Sub-agent failed: ${err.message}`;
    }

    // Build result summary
    const result = fullOutput.trim();
    if (!result) {
      return `Agent completed task "${description}" but produced no text output. Tools used: ${toolsUsed.length}`;
    }

    // Truncate if too long
    if (result.length > 30000) {
      return (
        result.slice(0, 30000) +
        `\n\n... (truncated, ${result.length} total chars)`
      );
    }

    return result;
  },
};
