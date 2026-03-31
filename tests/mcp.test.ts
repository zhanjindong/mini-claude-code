import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock node:fs so readFileSync never touches the real filesystem.
vi.mock("node:fs", () => {
  return {
    default: {
      readFileSync: vi.fn(),
    },
  };
});

// Mock node:os so homedir() returns a predictable value.
vi.mock("node:os", () => {
  return {
    default: {
      homedir: vi.fn(() => "/mock-home"),
    },
  };
});

// Mock node:child_process to prevent any real subprocess spawning.
// McpConnection constructor calls spawn(), which would fail in a test
// environment without an actual MCP binary.
vi.mock("node:child_process", () => {
  const makeStdin = () => ({ write: vi.fn() });
  const makeStream = () => ({ on: vi.fn() });
  const makeProcess = () => ({
    stdin: makeStdin(),
    stdout: makeStream(),
    stderr: makeStream(),
    on: vi.fn(),
    kill: vi.fn(),
  });
  return {
    spawn: vi.fn(() => makeProcess()),
  };
});

import fs from "node:fs";
import os from "node:os";
import { loadMcpConfig, getMcpServers, getMcpTools, closeMcp } from "../src/mcp.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Make readFileSync throw ENOENT for every call. */
function noConfigFiles() {
  vi.mocked(fs.readFileSync).mockImplementation(() => {
    const err: NodeJS.ErrnoException = new Error("ENOENT");
    err.code = "ENOENT";
    throw err;
  });
}

/** Make readFileSync return the given object as JSON for any path. */
function withConfigFile(content: object) {
  vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify(content));
}

/**
 * Make readFileSync return different JSON based on which path is requested.
 * Paths are matched via substring inclusion.
 */
function withConfigFiles(map: Record<string, object>) {
  vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
    const p = String(filePath);
    for (const [key, value] of Object.entries(map)) {
      if (p.includes(key)) {
        return JSON.stringify(value);
      }
    }
    const err: NodeJS.ErrnoException = new Error("ENOENT");
    err.code = "ENOENT";
    throw err;
  });
}

// ─── state reset ────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clear module-level connections and tools between tests.
  closeMcp();
  vi.mocked(fs.readFileSync).mockReset();
  // Restore the default homedir mock in case a test overrode it.
  vi.mocked(os.homedir).mockReturnValue("/mock-home");
});

// ─── loadMcpConfig ───────────────────────────────────────────────────────────

describe("loadMcpConfig", () => {
  describe("should_return_null_when_no_config_file_exists", () => {
    it("returns null when both project and user config files are absent", () => {
      noConfigFiles();

      const result = loadMcpConfig("/some/project");

      expect(result).toBeNull();
    });

    it("returns null when called without a cwd argument and files are absent", () => {
      noConfigFiles();

      const result = loadMcpConfig();

      expect(result).toBeNull();
    });
  });

  describe("should_load_config_when_valid_json_file_exists", () => {
    it("parses and returns McpConfig from the first matching file", () => {
      const config = {
        mcpServers: {
          myServer: { command: "node", args: ["server.js"] },
        },
      };
      withConfigFile(config);

      const result = loadMcpConfig("/my/project");

      expect(result).not.toBeNull();
      expect(result!.mcpServers).toHaveProperty("myServer");
      expect(result!.mcpServers.myServer.command).toBe("node");
    });

    it("includes args and env from the config file", () => {
      const config = {
        mcpServers: {
          toolServer: {
            command: "python",
            args: ["-m", "mcp_server"],
            env: { PYTHONPATH: "/usr/lib" },
          },
        },
      };
      withConfigFile(config);

      const result = loadMcpConfig("/my/project");

      expect(result!.mcpServers.toolServer.args).toEqual(["-m", "mcp_server"]);
      expect(result!.mcpServers.toolServer.env).toEqual({ PYTHONPATH: "/usr/lib" });
    });
  });

  describe("should_skip_invalid_json_and_try_next_candidate", () => {
    it("falls through to user-level config when project config contains invalid JSON", () => {
      const userConfig = {
        mcpServers: { userServer: { command: "npx", args: ["mcp-server"] } },
      };

      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        // Project-level path contains the cwd prefix; user-level contains homedir.
        if (p.includes("/my/project")) {
          return "{ not valid json }";
        }
        if (p.includes("/mock-home")) {
          return JSON.stringify(userConfig);
        }
        const err: NodeJS.ErrnoException = new Error("ENOENT");
        err.code = "ENOENT";
        throw err;
      });

      const result = loadMcpConfig("/my/project");

      expect(result).not.toBeNull();
      expect(result!.mcpServers).toHaveProperty("userServer");
    });

    it("returns null when all candidates contain invalid JSON", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => "{ bad json }");

      const result = loadMcpConfig("/some/project");

      expect(result).toBeNull();
    });
  });

  describe("should_prefer_project_level_config_over_user_level_config", () => {
    it("returns project config when both project and user configs exist", () => {
      const projectConfig = {
        mcpServers: { projectServer: { command: "node", args: ["proj.js"] } },
      };
      const userConfig = {
        mcpServers: { userServer: { command: "node", args: ["user.js"] } },
      };

      withConfigFiles({
        "/my/project": projectConfig,
        "/mock-home": userConfig,
      });

      const result = loadMcpConfig("/my/project");

      // Project-level config is checked first and must win.
      expect(result!.mcpServers).toHaveProperty("projectServer");
      expect(result!.mcpServers).not.toHaveProperty("userServer");
    });

    it("reads from the correct project-level path .mcc/mcp.json", () => {
      const projectConfig = {
        mcpServers: { srv: { command: "echo" } },
      };
      withConfigFiles({ ".mcc/mcp.json": projectConfig });

      const result = loadMcpConfig("/my/project");

      expect(result).not.toBeNull();
      // Verify readFileSync was called with a path containing the project's .mcc dir.
      const calls = vi.mocked(fs.readFileSync).mock.calls;
      const firstCallPath = String(calls[0][0]);
      expect(firstCallPath).toMatch(/\.mcc[/\\]mcp\.json$/);
    });

    it("reads from user-level path ~/.mcc/mcp.json when project config is absent", () => {
      vi.mocked(os.homedir).mockReturnValue("/custom-home");
      const userConfig = {
        mcpServers: { homeServer: { command: "node" } },
      };

      vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
        const p = String(filePath);
        if (p.startsWith("/custom-home")) {
          return JSON.stringify(userConfig);
        }
        const err: NodeJS.ErrnoException = new Error("ENOENT");
        err.code = "ENOENT";
        throw err;
      });

      const result = loadMcpConfig("/some/project");

      expect(result).not.toBeNull();
      expect(result!.mcpServers).toHaveProperty("homeServer");
    });
  });
});

// ─── getMcpServers (initial state) ──────────────────────────────────────────

describe("getMcpServers", () => {
  describe("should_return_empty_array_when_no_connections_are_established", () => {
    it("returns an empty array on initial module load", () => {
      const servers = getMcpServers();

      expect(Array.isArray(servers)).toBe(true);
      expect(servers).toHaveLength(0);
    });

    it("returns an empty array after closeMcp is called", () => {
      // closeMcp is also called in beforeEach, but we call it again explicitly
      // to document the behaviour directly.
      closeMcp();

      const servers = getMcpServers();

      expect(servers).toHaveLength(0);
    });
  });
});

// ─── getMcpTools (initial state) ────────────────────────────────────────────

describe("getMcpTools", () => {
  describe("should_return_empty_array_when_no_tools_are_loaded", () => {
    it("returns an empty array on initial module load", () => {
      const tools = getMcpTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toHaveLength(0);
    });

    it("returns an empty array after closeMcp is called", () => {
      closeMcp();

      const tools = getMcpTools();

      expect(tools).toHaveLength(0);
    });
  });
});

// ─── closeMcp ────────────────────────────────────────────────────────────────

describe("closeMcp", () => {
  describe("should_clear_connections_and_tools_when_called", () => {
    it("getMcpServers returns empty array after closeMcp", () => {
      closeMcp();

      expect(getMcpServers()).toHaveLength(0);
    });

    it("getMcpTools returns empty array after closeMcp", () => {
      closeMcp();

      expect(getMcpTools()).toHaveLength(0);
    });

    it("can be called multiple times without throwing", () => {
      expect(() => {
        closeMcp();
        closeMcp();
        closeMcp();
      }).not.toThrow();
    });
  });
});
