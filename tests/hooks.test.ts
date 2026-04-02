import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock node:fs before importing the module under test so that readFileSync
// calls never touch the real filesystem.
vi.mock("node:fs", () => {
  return {
    default: {
      readFileSync: vi.fn(),
    },
  };
});

// Mock node:child_process so that execSync calls never spawn real processes.
vi.mock("node:child_process", () => {
  return {
    execSync: vi.fn(),
  };
});

import fs from "node:fs";
import { execSync } from "node:child_process";
import {
  loadHooks,
  findMatchingHooks,
  executeHook,
  runHooks,
  type HookDefinition,
} from "../src/hooks.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Make readFileSync throw ENOENT for every path (simulates no config files). */
function noConfigFiles() {
  vi.mocked(fs.readFileSync).mockImplementation(() => {
    const err: NodeJS.ErrnoException = new Error("ENOENT: no such file");
    err.code = "ENOENT";
    throw err;
  });
}

/** Make readFileSync return valid hooks JSON for any path. */
function withHooksFile(hooks: HookDefinition[]) {
  vi.mocked(fs.readFileSync).mockImplementation(() =>
    JSON.stringify({ hooks })
  );
}

/**
 * Make readFileSync return different JSON objects depending on which path is
 * requested. Paths are matched via substring inclusion.
 */
function withHooksFiles(map: Record<string, HookDefinition[]>) {
  vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
    const p = String(filePath);
    for (const [key, hooks] of Object.entries(map)) {
      if (p.includes(key)) {
        return JSON.stringify({ hooks });
      }
    }
    const err: NodeJS.ErrnoException = new Error("ENOENT: no such file");
    err.code = "ENOENT";
    throw err;
  });
}

/** Make execSync succeed and return the given stdout string. */
function execSucceeds(stdout = "") {
  vi.mocked(execSync).mockReturnValue(stdout as any);
}

/** Make execSync throw a child-process-style error (non-zero exit). */
function execFails(opts: { status?: number; stdout?: string; stderr?: string; message?: string } = {}) {
  const err: any = new Error(opts.message ?? "Command failed");
  err.status = opts.status ?? 1;
  err.stdout = opts.stdout ?? "";
  err.stderr = opts.stderr ?? "";
  vi.mocked(execSync).mockImplementation(() => {
    throw err;
  });
}

// ─── beforeEach reset ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(fs.readFileSync).mockReset();
  vi.mocked(execSync).mockReset();
});

// ─── loadHooks ───────────────────────────────────────────────────────────────

describe("loadHooks", () => {
  describe("should_return_empty_array_when_no_config_files_exist", () => {
    it("returns an empty array", () => {
      noConfigFiles();
      const hooks = loadHooks("/fake/cwd");
      expect(hooks).toEqual([]);
    });
  });

  describe("should_load_hooks_when_valid_config_file_exists", () => {
    it("returns parsed hook definitions", () => {
      const hookDef: HookDefinition = {
        event: "beforeToolUse",
        toolName: "bash",
        command: "echo hello",
      };
      withHooksFile([hookDef]);
      const hooks = loadHooks("/fake/cwd");
      expect(hooks).toHaveLength(2); // Both candidate paths match the same mock
      // At least one entry must match our definition
      expect(hooks).toEqual(
        expect.arrayContaining([expect.objectContaining(hookDef)])
      );
    });

    it("returns hooks with all defined fields intact", () => {
      const hookDef: HookDefinition = {
        event: "afterToolResult",
        toolName: "read",
        command: "logger",
        timeout: 5000,
      };
      withHooksFile([hookDef]);
      const hooks = loadHooks("/fake/cwd");
      const found = hooks.find((h) => h.command === "logger");
      expect(found).toBeDefined();
      expect(found!.timeout).toBe(5000);
    });
  });

  describe("should_silently_skip_invalid_json_in_config_file", () => {
    it("returns empty array when config contains invalid JSON", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => "{ not valid json }");
      const hooks = loadHooks("/fake/cwd");
      expect(hooks).toEqual([]);
    });

    it("returns empty array when hooks field is not an array", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() =>
        JSON.stringify({ hooks: "not-an-array" })
      );
      const hooks = loadHooks("/fake/cwd");
      expect(hooks).toEqual([]);
    });
  });

  describe("should_merge_project_and_user_level_hooks", () => {
    it("combines hooks from both config file candidates", () => {
      const projectHook: HookDefinition = {
        event: "beforeToolUse",
        command: "project-hook",
      };
      const userHook: HookDefinition = {
        event: "afterToolResult",
        command: "user-hook",
      };

      // The project-level path contains ".claude/hooks.json" relative to cwd,
      // and the user-level path contains the home dir. We use the home dir
      // segment to distinguish them. Since os.homedir() is real here we match
      // the last segment of each candidate.
      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        // home-dir candidate: path starts with os.homedir()
        const home = require("os").homedir();
        if (p.startsWith(home)) {
          return JSON.stringify({ hooks: [userHook] });
        }
        // project-level candidate
        return JSON.stringify({ hooks: [projectHook] });
      });

      const hooks = loadHooks("/fake/cwd");
      const commands = hooks.map((h) => h.command);
      expect(commands).toContain("project-hook");
      expect(commands).toContain("user-hook");
    });
  });
});

// ─── findMatchingHooks ───────────────────────────────────────────────────────

describe("findMatchingHooks", () => {
  const bashBeforeHook: HookDefinition = {
    event: "beforeToolUse",
    toolName: "bash",
    command: "check-bash",
  };
  const readAfterHook: HookDefinition = {
    event: "afterToolResult",
    toolName: "read",
    command: "log-read",
  };
  const globalBeforeHook: HookDefinition = {
    event: "beforeToolUse",
    command: "global-before",
  };

  beforeEach(() => {
    withHooksFile([bashBeforeHook, readAfterHook, globalBeforeHook]);
    loadHooks("/fake/cwd");
  });

  describe("should_match_hook_when_event_and_toolName_both_match", () => {
    it("returns only the matching hook", () => {
      const result = findMatchingHooks("beforeToolUse", "bash");
      expect(result).toEqual(
        expect.arrayContaining([expect.objectContaining({ command: "check-bash" })]
        )
      );
    });

    it("does not return hooks for a different event", () => {
      const result = findMatchingHooks("beforeToolUse", "read");
      const commands = result.map((h) => h.command);
      expect(commands).not.toContain("log-read");
    });
  });

  describe("should_match_hook_when_toolName_is_undefined_meaning_match_all_tools", () => {
    it("returns the global hook for any tool name", () => {
      const result = findMatchingHooks("beforeToolUse", "write");
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ command: "global-before" }),
        ])
      );
    });

    it("global hook is included together with tool-specific hook", () => {
      const result = findMatchingHooks("beforeToolUse", "bash");
      const commands = result.map((h) => h.command);
      expect(commands).toContain("check-bash");
      expect(commands).toContain("global-before");
    });
  });

  describe("should_match_toolName_case_insensitively", () => {
    it("uppercase toolName matches lowercase hook toolName", () => {
      const result = findMatchingHooks("beforeToolUse", "BASH");
      const commands = result.map((h) => h.command);
      expect(commands).toContain("check-bash");
    });

    it("mixed-case toolName matches lowercase hook toolName", () => {
      const result = findMatchingHooks("afterToolResult", "Read");
      const commands = result.map((h) => h.command);
      expect(commands).toContain("log-read");
    });
  });

  describe("should_not_return_hooks_when_event_does_not_match", () => {
    it("returns empty array when no hook has the given event", () => {
      // None of our hooks have event "afterToolResult" for "bash"
      const result = findMatchingHooks("afterToolResult", "bash");
      const commands = result.map((h) => h.command);
      expect(commands).not.toContain("check-bash");
      expect(commands).not.toContain("global-before");
    });
  });
});

// ─── executeHook ─────────────────────────────────────────────────────────────

describe("executeHook", () => {
  const baseHook: HookDefinition = {
    event: "beforeToolUse",
    command: "echo test",
  };

  describe("should_return_exitCode_0_when_command_succeeds", () => {
    it("exitCode is 0 and blocked is false", () => {
      execSucceeds("some output");
      const result = executeHook(baseHook, {});
      expect(result.exitCode).toBe(0);
      expect(result.blocked).toBe(false);
    });

    it("stdout is trimmed output from execSync", () => {
      execSucceeds("  hello world  ");
      const result = executeHook(baseHook, {});
      expect(result.stdout).toBe("hello world");
    });

    it("hook reference is preserved in result", () => {
      execSucceeds();
      const result = executeHook(baseHook, {});
      expect(result.hook).toBe(baseHook);
    });
  });

  describe("should_return_non_zero_exitCode_when_command_fails", () => {
    it("exitCode matches the error status", () => {
      execFails({ status: 2 });
      const result = executeHook(baseHook, {});
      expect(result.exitCode).toBe(2);
    });

    it("defaults to exitCode 1 when error has no status", () => {
      execFails({ status: undefined });
      const result = executeHook(baseHook, {});
      expect(result.exitCode).toBe(1);
    });

    it("stderr is captured from error object", () => {
      execFails({ stderr: "permission denied" });
      const result = executeHook(baseHook, {});
      expect(result.stderr).toBe("permission denied");
    });

    it("stdout is captured from error object", () => {
      execFails({ stdout: "partial output" });
      const result = executeHook(baseHook, {});
      expect(result.stdout).toBe("partial output");
    });

    it("error message is included in result", () => {
      execFails({ message: "Command failed: exit 1" });
      const result = executeHook(baseHook, {});
      expect(result.error).toBe("Command failed: exit 1");
    });
  });

  describe("should_set_blocked_true_when_beforeToolUse_hook_fails", () => {
    it("blocked is true for beforeToolUse with non-zero exit", () => {
      execFails({ status: 1 });
      const hook: HookDefinition = { event: "beforeToolUse", command: "guard" };
      const result = executeHook(hook, {});
      expect(result.blocked).toBe(true);
    });
  });

  describe("should_set_blocked_false_when_afterToolResult_hook_fails", () => {
    it("blocked is false for afterToolResult even with non-zero exit", () => {
      execFails({ status: 1 });
      const hook: HookDefinition = { event: "afterToolResult", command: "log" };
      const result = executeHook(hook, {});
      expect(result.blocked).toBe(false);
    });
  });

  describe("should_handle_timeout_when_command_exceeds_limit", () => {
    it("passes hook timeout to execSync", () => {
      execSucceeds();
      const hook: HookDefinition = {
        event: "beforeToolUse",
        command: "slow-cmd",
        timeout: 3000,
      };
      executeHook(hook, {});
      expect(vi.mocked(execSync)).toHaveBeenCalledWith(
        "slow-cmd",
        expect.objectContaining({ timeout: 3000 })
      );
    });

    it("uses default timeout of 10000 when hook has no timeout", () => {
      execSucceeds();
      executeHook(baseHook, {});
      expect(vi.mocked(execSync)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it("returns non-zero exitCode when execSync throws a timeout error", () => {
      const timeoutErr: any = new Error("spawnSync /bin/sh ETIMEDOUT");
      timeoutErr.status = null;
      timeoutErr.stdout = "";
      timeoutErr.stderr = "";
      vi.mocked(execSync).mockImplementation(() => { throw timeoutErr; });

      const result = executeHook(baseHook, {});
      expect(result.exitCode).toBe(1); // status null → 1
    });
  });
});

// ─── runHooks ────────────────────────────────────────────────────────────────

describe("runHooks", () => {
  describe("should_return_blocked_false_when_no_hooks_match", () => {
    it("returns blocked=false with empty results array", () => {
      noConfigFiles();
      loadHooks("/fake/cwd");
      const outcome = runHooks("beforeToolUse", "bash", {});
      expect(outcome.blocked).toBe(false);
      expect(outcome.results).toEqual([]);
    });
  });

  describe("should_return_blocked_true_when_beforeToolUse_hook_blocks", () => {
    it("blocked is true and blockMessage is set", () => {
      const hook: HookDefinition = {
        event: "beforeToolUse",
        toolName: "bash",
        command: "deny-bash",
      };
      withHooksFile([hook]);
      loadHooks("/fake/cwd");
      execFails({ status: 1, stderr: "not allowed" });

      const outcome = runHooks("beforeToolUse", "bash", {});
      expect(outcome.blocked).toBe(true);
      expect(outcome.blockMessage).toBe("not allowed");
    });

    it("blockMessage falls back to stdout when stderr is empty", () => {
      const hook: HookDefinition = {
        event: "beforeToolUse",
        toolName: "bash",
        command: "deny-bash",
      };
      withHooksFile([hook]);
      loadHooks("/fake/cwd");
      execFails({ status: 1, stderr: "", stdout: "blocked by policy" });

      const outcome = runHooks("beforeToolUse", "bash", {});
      expect(outcome.blockMessage).toBe("blocked by policy");
    });

    it("blockMessage falls back to default string when both stdout and stderr are empty", () => {
      const hook: HookDefinition = {
        event: "beforeToolUse",
        toolName: "bash",
        command: "deny-bash",
      };
      withHooksFile([hook]);
      loadHooks("/fake/cwd");
      execFails({ status: 1, stderr: "", stdout: "" });

      const outcome = runHooks("beforeToolUse", "bash", {});
      expect(outcome.blockMessage).toContain("deny-bash");
    });
  });

  describe("should_execute_multiple_hooks_in_order", () => {
    it("all hooks are run when none block and all results are collected", () => {
      const hook1: HookDefinition = {
        event: "beforeToolUse",
        command: "first",
      };
      const hook2: HookDefinition = {
        event: "beforeToolUse",
        command: "second",
      };
      withHooksFile([hook1, hook2]);
      loadHooks("/fake/cwd");
      execSucceeds("ok");

      const outcome = runHooks("beforeToolUse", "any-tool", {});
      expect(outcome.blocked).toBe(false);
      expect(outcome.results.length).toBeGreaterThanOrEqual(2);
    });

    it("stops executing subsequent hooks after first blocking hook", () => {
      const blockingHook: HookDefinition = {
        event: "beforeToolUse",
        command: "blocking",
      };
      const secondHook: HookDefinition = {
        event: "beforeToolUse",
        command: "second",
      };
      withHooksFile([blockingHook, secondHook]);
      loadHooks("/fake/cwd");

      // First call fails (blocking), second should never be reached
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw Object.assign(new Error("fail"), { status: 1, stdout: "", stderr: "blocked" }); })
        .mockReturnValue("ok" as any);

      const outcome = runHooks("beforeToolUse", "any-tool", {});
      expect(outcome.blocked).toBe(true);
      // execSync should have been called only once (for the blocking hook)
      // — the second hook must not have been executed
      expect(vi.mocked(execSync)).toHaveBeenCalledTimes(1);
    });
  });
});
