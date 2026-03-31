import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkPermission,
  initPermissions,
  resetPermissions,
} from "../src/permissions.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Empty config — no presets. Falls through to session rules / safe-level check. */
const NO_PRESETS: Record<string, "allow" | "deny" | "ask"> = {};

// ─── initPermissions ────────────────────────────────────────────────────────

describe("initPermissions", () => {
  beforeEach(() => {
    resetPermissions();
  });

  it("should_load_allow_preset_into_session_rules_when_config_has_allow", async () => {
    initPermissions({ bash: "allow" });

    const result = await checkPermission("bash", "execute", "", NO_PRESETS);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("session rule: allow-always");
  });

  it("should_load_deny_preset_into_session_rules_when_config_has_deny", async () => {
    initPermissions({ bash: "deny" });

    const result = await checkPermission("bash", "execute", "", NO_PRESETS);

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("session rule: deny");
  });

  it("should_not_load_ask_preset_into_session_rules_when_config_has_ask", async () => {
    // "ask" entries must not be pre-loaded — safe tool should pass as "permission level: safe"
    // rather than as a session rule hit
    initPermissions({ read: "ask" });

    const result = await checkPermission("read", "safe", "", NO_PRESETS);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("permission level: safe");
  });

  it("should_normalize_tool_name_to_lowercase_when_loading_config_presets", async () => {
    // Config key stored in any case must still match lowercase lookup
    initPermissions({ Bash: "allow" } as Record<string, "allow" | "deny" | "ask">);

    const result = await checkPermission("bash", "execute", "", NO_PRESETS);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("session rule: allow-always");
  });

  it("should_clear_previous_session_rules_when_initPermissions_is_called_again", async () => {
    initPermissions({ bash: "allow" });
    // Re-initialise with an empty config — should wipe the previous allow rule
    initPermissions({});

    const result = await checkPermission("bash", "safe", "", NO_PRESETS);

    // Falls through to "safe" level, not a session rule
    expect(result.reason).toBe("permission level: safe");
  });
});

// ─── resetPermissions ───────────────────────────────────────────────────────

describe("resetPermissions", () => {
  it("should_clear_all_session_rules_when_reset_is_called", async () => {
    initPermissions({ bash: "allow", write: "deny" });

    resetPermissions();

    // After reset, a safe tool should resolve as "permission level: safe" —
    // not via a lingering session rule.
    const result = await checkPermission("bash", "safe", "", NO_PRESETS);
    expect(result.reason).toBe("permission level: safe");
  });
});

// ─── checkPermission — config preset paths ─────────────────────────────────

describe("checkPermission — config preset", () => {
  beforeEach(() => {
    resetPermissions();
  });

  it("should_grant_permission_when_config_preset_is_allow", async () => {
    const config = { bash: "allow" } as Record<string, "allow" | "deny" | "ask">;

    const result = await checkPermission("bash", "execute", "echo hi", config);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("config preset: allow");
  });

  it("should_deny_permission_when_config_preset_is_deny", async () => {
    const config = { bash: "deny" } as Record<string, "allow" | "deny" | "ask">;

    const result = await checkPermission("bash", "execute", "rm -rf /", config);

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("config preset: deny");
  });

  it("should_fall_through_config_when_preset_is_ask", async () => {
    // "ask" preset means do not short-circuit — safe tool should resolve via level check
    const config = { read: "ask" } as Record<string, "allow" | "deny" | "ask">;

    const result = await checkPermission("read", "safe", "src/", config);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("permission level: safe");
  });

  it("should_fall_through_config_when_tool_not_in_presets", async () => {
    const result = await checkPermission("glob", "safe", "**/*.ts", NO_PRESETS);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("permission level: safe");
  });

  it("should_match_config_preset_case_insensitively_when_tool_name_has_mixed_case", async () => {
    // checkPermission lowercases the key before looking up in configPermissions
    const config = { bash: "allow" } as Record<string, "allow" | "deny" | "ask">;

    const result = await checkPermission("Bash", "execute", "", config);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("config preset: allow");
  });
});

// ─── checkPermission — session rule paths ───────────────────────────────────

describe("checkPermission — session rules", () => {
  beforeEach(() => {
    resetPermissions();
  });

  it("should_grant_permission_when_session_rule_is_allow", async () => {
    initPermissions({ write: "allow" });

    const result = await checkPermission("write", "write", "file.txt", NO_PRESETS);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("session rule: allow-always");
  });

  it("should_deny_permission_when_session_rule_is_deny", async () => {
    initPermissions({ bash: "deny" });

    const result = await checkPermission("bash", "execute", "ls", NO_PRESETS);

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("session rule: deny");
  });

  it("should_match_session_rule_case_insensitively_when_tool_name_is_uppercase", async () => {
    initPermissions({ bash: "allow" });

    const result = await checkPermission("BASH", "execute", "", NO_PRESETS);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("session rule: allow-always");
  });

  it("should_check_config_preset_before_session_rule_when_both_exist", async () => {
    // Config deny takes precedence over a session allow
    initPermissions({ bash: "allow" });
    const config = { bash: "deny" } as Record<string, "allow" | "deny" | "ask">;

    const result = await checkPermission("bash", "execute", "", config);

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("config preset: deny");
  });
});

// ─── checkPermission — safe permission level ────────────────────────────────

describe("checkPermission — safe permission level", () => {
  beforeEach(() => {
    resetPermissions();
  });

  it("should_auto_grant_when_permission_level_is_safe", async () => {
    const result = await checkPermission("read", "safe", "src/index.ts", NO_PRESETS);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("permission level: safe");
  });

  it("should_grant_safe_tool_without_touching_session_rules", async () => {
    // Safe tools must NOT be persisted into sessionRules — subsequent checks should
    // still resolve via the safe level, not a session rule.
    await checkPermission("glob", "safe", "**/*.ts", NO_PRESETS);

    const result = await checkPermission("glob", "safe", "**/*.js", NO_PRESETS);

    expect(result.reason).toBe("permission level: safe");
  });

  it("should_grant_safe_tool_even_when_no_presets_or_session_rules_exist", async () => {
    const result = await checkPermission("list", "safe", "", NO_PRESETS);

    expect(result.granted).toBe(true);
  });
});

// ─── checkPermission — decision tree ordering ───────────────────────────────

describe("checkPermission — decision priority order", () => {
  beforeEach(() => {
    resetPermissions();
  });

  it("should_prioritise_config_deny_over_safe_level_when_tool_is_in_deny_list", async () => {
    const config = { read: "deny" } as Record<string, "allow" | "deny" | "ask">;

    // Even a "safe" tool is blocked when explicitly denied in config
    const result = await checkPermission("read", "safe", "", config);

    expect(result.granted).toBe(false);
    expect(result.reason).toBe("config preset: deny");
  });

  it("should_prioritise_config_allow_over_session_deny_when_config_overrides", async () => {
    initPermissions({ bash: "deny" });
    const config = { bash: "allow" } as Record<string, "allow" | "deny" | "ask">;

    const result = await checkPermission("bash", "execute", "", config);

    expect(result.granted).toBe(true);
    expect(result.reason).toBe("config preset: allow");
  });
});
