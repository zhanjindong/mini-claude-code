import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/markdown.js";

describe("smoke test", () => {
  it("should confirm vitest is working", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("renderMarkdown", () => {
  it("should return a string for plain text input", () => {
    const result = renderMarkdown("Hello world");
    expect(typeof result).toBe("string");
    expect(result).toContain("Hello world");
  });

  it("should render unordered list items with bullet character", () => {
    const result = renderMarkdown("- item one\n- item two");
    expect(result).toContain("\u2022");
    expect(result).toContain("item one");
    expect(result).toContain("item two");
  });

  it("should render code blocks with language label", () => {
    const input = "```typescript\nconst x = 1;\n```";
    const result = renderMarkdown(input);
    expect(result).toContain("typescript");
    expect(result).toContain("const x = 1;");
  });

  it("should handle empty input", () => {
    const result = renderMarkdown("");
    expect(typeof result).toBe("string");
  });

  it("should render multiple lines correctly", () => {
    const input = "line one\nline two\nline three";
    const result = renderMarkdown(input);
    expect(result).toContain("line one");
    expect(result).toContain("line two");
    expect(result).toContain("line three");
  });

  it("should handle unclosed code block gracefully", () => {
    const input = "```js\nconst x = 1;";
    const result = renderMarkdown(input);
    expect(result).toContain("const x = 1;");
  });
});
