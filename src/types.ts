// Tool type system - inspired by claude-code's Tool.ts

export interface ToolInput {
  [key: string]: unknown;
}

export type EngineChunk =
  | { type: "text"; content: string }
  | { type: "tool"; content: string; progress?: boolean };

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute(input: ToolInput, abortSignal?: AbortSignal): Promise<string>;
  /** Optional streaming execution — yields chunks in real-time instead of buffering */
  executeStreaming?(input: ToolInput, abortSignal?: AbortSignal): AsyncGenerator<EngineChunk, string>;
  permissionLevel?: "safe" | "write" | "execute";  // default: "execute"
}

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };
