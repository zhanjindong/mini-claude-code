import { describe, it, expect } from "vitest";
import { renderDiff } from "../src/markdown.js";

// chalk strips ANSI by default in test environments depending on chalk level;
// we check color names via chalk's output by searching for ANSI escape codes,
// or we rely on the fact that chalk encodes colors as ANSI sequences.
// Strategy: use chalk's actual color codes, or enable chalk in tests.
// chalk v5 respects NO_COLOR / FORCE_COLOR env vars and chalk.level.
// We set FORCE_COLOR=1 via vitest or check the raw ANSI sequences.

// ANSI escape sequences for the colors used by renderDiff:
//   green  \x1b[32m
//   red    \x1b[31m
//   yellow \x1b[33m
//   cyan   \x1b[36m
//   bold   \x1b[1m
//   dim    \x1b[2m

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

describe("renderDiff", () => {
  it("should_contain_green_ansi_code_when_line_starts_with_plus", () => {
    const diff = "+added line";

    const result = renderDiff(diff);

    expect(result).toContain(GREEN);
    expect(result).toContain("added line");
  });

  it("should_contain_red_ansi_code_when_line_starts_with_minus", () => {
    const diff = "-removed line";

    const result = renderDiff(diff);

    expect(result).toContain(RED);
    expect(result).toContain("removed line");
  });

  it("should_contain_yellow_ansi_code_when_line_starts_with_diff_git_header", () => {
    const diff = "diff --git a/foo.ts b/foo.ts";

    const result = renderDiff(diff);

    expect(result).toContain(YELLOW);
    expect(result).toContain("foo.ts");
  });

  it("should_contain_cyan_ansi_code_when_line_starts_with_hunk_header", () => {
    const diff = "@@ -1,4 +1,6 @@";

    const result = renderDiff(diff);

    expect(result).toContain(CYAN);
    expect(result).toContain("-1,4 +1,6");
  });

  it("should_return_empty_string_when_input_is_empty", () => {
    const result = renderDiff("");

    expect(result).toBe("");
  });

  it("should_color_each_line_correctly_when_diff_contains_mixed_line_types", () => {
    const diff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "@@ -1,3 +1,4 @@",
      " context line",
      "-old line",
      "+new line",
    ].join("\n");

    const result = renderDiff(diff);

    // Split rendered output back into lines for per-line assertions
    const lines = result.split("\n");

    // Line 0: diff --git header → bold yellow (contains yellow code)
    expect(lines[0]).toContain(YELLOW);

    // Line 1: @@ hunk header → cyan
    expect(lines[1]).toContain(CYAN);

    // Line 3: removed line → red
    expect(lines[3]).toContain(RED);

    // Line 4: added line → green
    expect(lines[4]).toContain(GREEN);
  });
});
