import { describe, it, expect } from "vitest";
import { BashTool } from "../src/tools/bash.js";

describe("BashTool", () => {
  describe("execute", () => {
    it("should run a simple command", async () => {
      const result = await BashTool.execute({ command: "echo hello" });
      expect(result).toBe("hello");
    });

    it("should return exit code on failure", async () => {
      const result = await BashTool.execute({ command: "exit 1" });
      expect(result).toContain("Exit code: 1");
    });

    it("should return (no output) for empty output", async () => {
      const result = await BashTool.execute({ command: "true" });
      expect(result).toBe("(no output)");
    });
  });

  describe("executeStreaming", () => {
    it("should exist as a method", () => {
      expect(BashTool.executeStreaming).toBeDefined();
      expect(typeof BashTool.executeStreaming).toBe("function");
    });

    it("should stream output for a simple command", async () => {
      const gen = BashTool.executeStreaming!({ command: "echo streaming-test" });
      const chunks: string[] = [];
      let result: string | undefined;

      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          result = value as string;
          break;
        }
        chunks.push((value as { type: string; content: string }).content);
      }

      // Final result should contain the output
      expect(result).toBe("streaming-test");
      // At least one chunk should have been yielded with the output
      const allChunks = chunks.join("");
      expect(allChunks).toContain("streaming-test");
    });

    it("should return exit code on non-zero exit", async () => {
      const gen = BashTool.executeStreaming!({ command: "echo fail-output && exit 42" });
      let result: string | undefined;

      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          result = value as string;
          break;
        }
      }

      expect(result).toContain("Exit code: 42");
      expect(result).toContain("fail-output");
    });

    it("should handle stderr output", async () => {
      const gen = BashTool.executeStreaming!({ command: "echo err-msg >&2" });
      const chunks: string[] = [];
      let result: string | undefined;

      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          result = value as string;
          break;
        }
        chunks.push((value as { type: string; content: string }).content);
      }

      const allChunks = chunks.join("");
      expect(allChunks).toContain("err-msg");
      // stderr with exit 0 still returns the output
      expect(result).toContain("err-msg");
    });

    it("should fall back to execute for background tasks", async () => {
      const gen = BashTool.executeStreaming!({
        command: "echo bg-test",
        run_in_background: true,
      });

      let result: string | undefined;
      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          result = value as string;
          break;
        }
      }

      expect(result).toContain("Background task started");
    });

    it("should resolve carriage returns in progress-bar output", async () => {
      // Simulate curl-like progress: \r overwrites the current line
      const gen = BashTool.executeStreaming!({
        command: 'printf "progress 25%%\\rprogress 50%%\\rprogress 100%%\\n"',
      });
      const chunks: string[] = [];
      let result: string | undefined;
      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          result = value as string;
          break;
        }
        chunks.push((value as { type: string; content: string }).content);
      }
      const allOutput = chunks.join("\n");
      // Should contain the final progress, not intermediate \r-overwritten ones
      expect(allOutput).toContain("progress 100%");
    });

    it("should only show final visible text after \\r resolution", async () => {
      // printf "a\rb\rc\n" should resolve to just "c"
      const gen = BashTool.executeStreaming!({
        command: 'printf "a\\rb\\rc\\n"',
      });
      const chunks: string[] = [];
      while (true) {
        const { value, done } = await gen.next();
        if (done) break;
        chunks.push((value as { type: string; content: string }).content);
      }
      const allOutput = chunks.join("\n");
      expect(allOutput).toContain("c");
      // Should not contain intermediate values as separate visible lines
      expect(allOutput).not.toMatch(/^a$/m);
      expect(allOutput).not.toMatch(/^b$/m);
    });

    it("should yield chunks with type 'tool'", async () => {
      const gen = BashTool.executeStreaming!({ command: "echo chunk-type-test" });

      while (true) {
        const { value, done } = await gen.next();
        if (done) break;
        const chunk = value as { type: string; content: string };
        expect(chunk.type).toBe("tool");
        expect(typeof chunk.content).toBe("string");
      }
    });
  });
});
