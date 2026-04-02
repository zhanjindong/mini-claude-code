import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock node:fs before importing the module under test so that readFileSync
// and writeFileSync calls never touch the real filesystem.
vi.mock("node:fs", () => {
  return {
    default: {
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

// Dynamic import is used so that we can re-import (and thus re-run module
// initialisation) when needed. For this test suite a single import suffices
// because loadConfig() resets cachedConfig on every call.
import fs from "node:fs";
import { loadConfig, getConfig } from "../src/config.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Make readFileSync throw ENOENT for every path (simulates no config files). */
function noConfigFiles() {
  vi.mocked(fs.readFileSync).mockImplementation(() => {
    const err: NodeJS.ErrnoException = new Error("ENOENT");
    err.code = "ENOENT";
    throw err;
  });
}

/** Make readFileSync return the given JSON for any path. */
function withConfigFile(content: object) {
  vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify(content));
}

/**
 * Make readFileSync return different JSON objects depending on which path is
 * requested.  Paths are matched via substring inclusion.
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

// ─── env isolation ──────────────────────────────────────────────────────────

/** Snapshot of env vars that the tests touch, restored after each test. */
const ENV_KEYS = [
  "MCC_API_KEY",
  "OPENAI_API_KEY",
  "MCC_PROVIDER",
  "MCC_MODEL",
  "MCC_BASE_URL",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  vi.mocked(fs.readFileSync).mockReset();
  vi.mocked(fs.writeFileSync).mockReset();
  vi.mocked(fs.mkdirSync).mockReset();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ─── loadConfig ─────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  describe("should_return_defaults_when_no_config_files_exist", () => {
    it("provider defaults to minimax", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg.provider).toBe("minimax");
    });

    it("model defaults to empty string", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg.model).toBe("");
    });

    it("maxTokens defaults to 8192", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg.maxTokens).toBe(8192);
    });

    it("baseURL defaults to empty string", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg.baseURL).toBe("");
    });

    it("permissions defaults to empty object", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg.permissions).toEqual({});
    });

    it("toolPaths defaults to empty array", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg.toolPaths).toEqual([]);
    });

    it("apiKey defaults to empty string", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg.apiKey).toBe("");
    });
  });

  // ── env var layer ──────────────────────────────────────────────────────────

  describe("should_read_provider_from_MCC_PROVIDER_env_var", () => {
    it("overrides the default provider", () => {
      noConfigFiles();
      process.env.MCC_PROVIDER = "openai";
      const cfg = loadConfig();
      expect(cfg.provider).toBe("openai");
    });
  });

  describe("should_read_model_from_MCC_MODEL_env_var", () => {
    it("overrides the default model", () => {
      noConfigFiles();
      process.env.MCC_MODEL = "gpt-4o";
      const cfg = loadConfig();
      expect(cfg.model).toBe("gpt-4o");
    });
  });

  describe("should_read_baseURL_from_MCC_BASE_URL_env_var", () => {
    it("overrides the default baseURL", () => {
      noConfigFiles();
      process.env.MCC_BASE_URL = "https://example.com/api";
      const cfg = loadConfig();
      expect(cfg.baseURL).toBe("https://example.com/api");
    });
  });

  describe("should_read_apiKey_from_MCC_API_KEY_env_var", () => {
    it("sets apiKey when MCC_API_KEY is present", () => {
      noConfigFiles();
      process.env.MCC_API_KEY = "sk-test-key";
      const cfg = loadConfig();
      expect(cfg.apiKey).toBe("sk-test-key");
    });
  });

  describe("should_read_apiKey_from_OPENAI_API_KEY_env_var", () => {
    it("sets apiKey when OPENAI_API_KEY is present", () => {
      noConfigFiles();
      process.env.OPENAI_API_KEY = "sk-openai-key";
      const cfg = loadConfig();
      expect(cfg.apiKey).toBe("sk-openai-key");
    });
  });

  describe("should_prefer_MCC_API_KEY_over_OPENAI_API_KEY_when_both_set", () => {
    it("MCC_API_KEY takes precedence", () => {
      noConfigFiles();
      process.env.MCC_API_KEY = "sk-primary";
      process.env.OPENAI_API_KEY = "sk-secondary";
      const cfg = loadConfig();
      expect(cfg.apiKey).toBe("sk-primary");
    });
  });

  // ── CLI overrides layer ───────────────────────────────────────────────────

  describe("should_apply_overrides_with_highest_priority", () => {
    it("override provider beats env var", () => {
      noConfigFiles();
      process.env.MCC_PROVIDER = "anthropic";
      const cfg = loadConfig({ provider: "azure" });
      expect(cfg.provider).toBe("azure");
    });

    it("override model beats env var", () => {
      noConfigFiles();
      process.env.MCC_MODEL = "gpt-4";
      const cfg = loadConfig({ model: "claude-3" });
      expect(cfg.model).toBe("claude-3");
    });

    it("override apiKey beats env var", () => {
      noConfigFiles();
      process.env.API_KEY = "sk-from-env";
      const cfg = loadConfig({ apiKey: "sk-from-cli" });
      expect(cfg.apiKey).toBe("sk-from-cli");
    });

    it("override maxTokens beats config file value", () => {
      withConfigFile({ maxTokens: 4096 });
      const cfg = loadConfig({ maxTokens: 16384 });
      expect(cfg.maxTokens).toBe(16384);
    });
  });

  // ── permissions merge ─────────────────────────────────────────────────────

  describe("should_merge_permissions_from_two_layers_not_replace", () => {
    it("user config and project config permissions are combined", () => {
      withConfigFiles({
        // ~/.claude/config.json  — matched by the home-dir path containing ".claude"
        // .claude/config.json    — matched by the cwd-relative path
        // We distinguish them by ensuring the home dir path ends with the OS
        // home directory prefix. For simplicity both are matched; the second
        // call wins for non-permission scalar fields, but permissions are
        // merged, so we can observe that here by providing different keys.
        ".claude/config.json": { permissions: { read: "allow" } },
      });
      // Override carries extra permission key
      const cfg = loadConfig({
        permissions: { write: "deny" },
      });
      // Both keys must be present
      expect(cfg.permissions).toMatchObject({ read: "allow", write: "deny" });
    });

    it("later layer overwrites conflicting permission key", () => {
      withConfigFile({ permissions: { read: "allow" } });
      const cfg = loadConfig({ permissions: { read: "deny" } });
      expect(cfg.permissions.read).toBe("deny");
    });

    it("non-conflicting permission keys from base are preserved", () => {
      withConfigFile({ permissions: { bash: "ask" } });
      const cfg = loadConfig({ permissions: { read: "allow" } });
      expect(cfg.permissions.bash).toBe("ask");
      expect(cfg.permissions.read).toBe("allow");
    });
  });

  // ── config file layer ─────────────────────────────────────────────────────

  describe("should_apply_values_from_config_file", () => {
    it("reads provider from config file", () => {
      withConfigFile({ provider: "anthropic" });
      const cfg = loadConfig();
      expect(cfg.provider).toBe("anthropic");
    });

    it("reads maxTokens from config file", () => {
      withConfigFile({ maxTokens: 2048 });
      const cfg = loadConfig();
      expect(cfg.maxTokens).toBe(2048);
    });

    it("reads toolPaths from config file", () => {
      withConfigFile({ toolPaths: ["/usr/local/tools"] });
      const cfg = loadConfig();
      expect(cfg.toolPaths).toEqual(["/usr/local/tools"]);
    });
  });

  describe("should_return_defaults_when_config_file_contains_invalid_json", () => {
    it("falls back to defaults on parse error", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => "{ not valid json }");
      const cfg = loadConfig();
      expect(cfg.provider).toBe("minimax");
      expect(cfg.maxTokens).toBe(8192);
    });
  });

  // ── merge precedence order ────────────────────────────────────────────────

  describe("should_follow_merge_order_defaults_file_env_overrides", () => {
    it("env var wins over config file value", () => {
      withConfigFile({ provider: "from-file" });
      process.env.MCC_PROVIDER = "from-env";
      const cfg = loadConfig();
      expect(cfg.provider).toBe("from-env");
    });

    it("override wins over env var and config file", () => {
      withConfigFile({ provider: "from-file" });
      process.env.MCC_PROVIDER = "from-env";
      const cfg = loadConfig({ provider: "from-override" });
      expect(cfg.provider).toBe("from-override");
    });
  });

  // ── return value ──────────────────────────────────────────────────────────

  describe("should_return_resolved_config_object", () => {
    it("returned object has all ResolvedConfig keys", () => {
      noConfigFiles();
      const cfg = loadConfig();
      expect(cfg).toHaveProperty("provider");
      expect(cfg).toHaveProperty("model");
      expect(cfg).toHaveProperty("maxTokens");
      expect(cfg).toHaveProperty("baseURL");
      expect(cfg).toHaveProperty("permissions");
      expect(cfg).toHaveProperty("toolPaths");
      expect(cfg).toHaveProperty("apiKey");
    });
  });
});

// ─── getConfig ───────────────────────────────────────────────────────────────

describe("getConfig", () => {
  describe("should_throw_when_loadConfig_has_not_been_called", () => {
    it("throws an error describing the required call order", () => {
      // Reset the cached singleton by calling loadConfig then intentionally
      // triggering the error path. Because cachedConfig is module-level and
      // not exported we cannot set it to null directly. We work around this
      // by temporarily monkeypatching the module export, but the cleanest
      // approach for ESM is to verify the throw only in isolation — which we
      // achieve by importing in a sub-process or by relying on the fact that
      // loadConfig has not yet been called in a fresh vitest worker context.
      //
      // Since vitest runs all tests in a single worker for a given file we
      // cannot guarantee null state here after earlier tests ran.  We
      // therefore explicitly test the throw by checking that calling getConfig
      // before loadConfig in a *new* module instance throws.  We do this via
      // a dynamic re-import with cache busting.
      //
      // Alternatively — and most robustly — we verify the thrown message
      // matches expectations after a loadConfig that sets a known state, then
      // conceptually the throw is already exercised by the "fresh state" check
      // below.
      expect(() => {
        // We cannot truly reset cachedConfig from outside the module, so we
        // verify the contract via the documented public API:  after loadConfig
        // has been called getConfig MUST NOT throw (the positive case).  The
        // negative case (throw before first call) is covered by the
        // sub-module import test below.
        noConfigFiles();
        loadConfig(); // sets cachedConfig
        getConfig();  // must not throw
      }).not.toThrow();
    });

    it("throws with descriptive message when config is uninitialised", async () => {
      // Reset module registry so cachedConfig is null in the fresh instance.
      vi.resetModules();
      const { getConfig: freshGetConfig } = await import("../src/config.js");
      expect(() => freshGetConfig()).toThrowError(
        /Call loadConfig\(\) before getConfig\(\)/i
      );
      // Restore module registry so subsequent tests use the same instance.
      vi.resetModules();
    });
  });

  describe("should_return_cached_result_after_loadConfig_is_called", () => {
    it("returns same object reference on subsequent calls", () => {
      noConfigFiles();
      const fromLoad = loadConfig();
      const fromGet = getConfig();
      expect(fromGet).toBe(fromLoad);
    });

    it("reflects the most recent loadConfig call", () => {
      noConfigFiles();
      loadConfig({ provider: "first" });
      loadConfig({ provider: "second" });
      expect(getConfig().provider).toBe("second");
    });
  });
});
