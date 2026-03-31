import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Setup ──────────────────────────────────────────────────────────────

vi.mock("../src/config.js", () => ({
  getConfig: () => ({
    provider: "test",
    model: "test-model",
    maxTokens: 1024,
    baseURL: "http://localhost",
    apiKey: "test-key",
    permissions: {},
    toolPaths: [],
  }),
}));

vi.mock("../src/context.js", () => ({
  loadContext: () => ({ files: [], combinedContent: "" }),
}));

const mockQuery = vi.fn();

vi.mock("../src/engine.js", () => ({
  QueryEngine: vi.fn().mockImplementation(() => ({
    query: mockQuery,
  })),
}));

// Import after mocks are registered
import { AgentTool } from "../src/tools/agent.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tool Attributes ──────────────────────────────────────────────────────────

describe("AgentTool — tool attributes", () => {
  it("should_have_name_Agent_when_accessed", () => {
    expect(AgentTool.name).toBe("Agent");
  });

  it("should_have_permissionLevel_safe_when_accessed", () => {
    expect(AgentTool.permissionLevel).toBe("safe");
  });

  it("should_require_prompt_field_in_inputSchema_when_schema_is_inspected", () => {
    expect(AgentTool.inputSchema.required).toContain("prompt");
  });

  it("should_define_prompt_as_string_type_in_inputSchema_properties", () => {
    const properties = AgentTool.inputSchema.properties as Record<string, { type: string }>;
    expect(properties.prompt.type).toBe("string");
  });

  it("should_define_description_as_optional_string_in_inputSchema_properties", () => {
    const properties = AgentTool.inputSchema.properties as Record<string, { type: string }>;
    expect(properties.description.type).toBe("string");
    expect(AgentTool.inputSchema.required).not.toContain("description");
  });
});

// ─── Input Validation ─────────────────────────────────────────────────────────

describe("AgentTool — input validation", () => {
  it("should_return_error_when_prompt_is_empty_string", async () => {
    const result = await AgentTool.execute({ prompt: "" });

    expect(result).toBe("Error: prompt is required");
  });

  it("should_return_error_when_prompt_is_missing_from_input", async () => {
    const result = await AgentTool.execute({});

    expect(result).toBe("Error: prompt is required");
  });
});

// ─── Normal Execution ─────────────────────────────────────────────────────────

describe("AgentTool — normal execution", () => {
  it("should_return_text_output_when_sub_agent_yields_text_chunks", async () => {
    mockQuery.mockImplementation(async function* () {
      yield { type: "text", content: "hello " };
      yield { type: "text", content: "world" };
    });

    const result = await AgentTool.execute({ prompt: "say hello" });

    expect(result).toBe("hello world");
  });

  it("should_ignore_tool_chunks_and_return_only_text_when_sub_agent_uses_tools", async () => {
    mockQuery.mockImplementation(async function* () {
      yield { type: "tool", content: "  ReadFile  " };
      yield { type: "text", content: "file content found" };
    });

    const result = await AgentTool.execute({ prompt: "read a file" });

    expect(result).toBe("file content found");
  });

  it("should_return_no_output_notice_when_sub_agent_produces_only_tool_chunks", async () => {
    mockQuery.mockImplementation(async function* () {
      yield { type: "tool", content: "Bash" };
      yield { type: "tool", content: "ReadFile" };
    });

    const result = await AgentTool.execute({
      prompt: "do something",
      description: "run commands",
    });

    expect(result).toContain('Agent completed task "run commands"');
    expect(result).toContain("Tools used: 2");
  });

  it("should_use_default_description_in_no_output_notice_when_description_is_omitted", async () => {
    mockQuery.mockImplementation(async function* () {
      yield { type: "tool", content: "Bash" };
    });

    const result = await AgentTool.execute({ prompt: "do something" });

    expect(result).toContain('Agent completed task "sub-agent task"');
  });

  it("should_truncate_output_and_append_notice_when_result_exceeds_30000_chars", async () => {
    const longText = "x".repeat(40000);
    mockQuery.mockImplementation(async function* () {
      yield { type: "text", content: longText };
    });

    const result = await AgentTool.execute({ prompt: "generate a lot of text" });

    expect(typeof result).toBe("string");
    const text = result as string;
    expect(text.startsWith("x".repeat(30000))).toBe(true);
    expect(text).toContain("... (truncated, 40000 total chars)");
  });

  it("should_return_full_output_without_truncation_when_result_is_exactly_30000_chars", async () => {
    const exactText = "y".repeat(30000);
    mockQuery.mockImplementation(async function* () {
      yield { type: "text", content: exactText };
    });

    const result = await AgentTool.execute({ prompt: "generate exact text" });

    expect(result).toBe(exactText);
    expect(result as string).not.toContain("truncated");
  });
});

// ─── Error Handling ───────────────────────────────────────────────────────────

describe("AgentTool — error handling", () => {
  it("should_return_error_message_when_sub_agent_query_throws", async () => {
    mockQuery.mockImplementation(async function* () {
      throw new Error("API connection refused");
    });

    const result = await AgentTool.execute({ prompt: "do something risky" });

    expect(result).toBe("Error: Sub-agent failed: API connection refused");
  });

  it("should_return_error_message_when_sub_agent_throws_midway_through_stream", async () => {
    mockQuery.mockImplementation(async function* () {
      yield { type: "text", content: "partial " };
      throw new Error("stream interrupted");
    });

    const result = await AgentTool.execute({ prompt: "stream something" });

    expect(result).toBe("Error: Sub-agent failed: stream interrupted");
  });
});
