import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:os so that SESSION_DIR is a deterministic, controlled path.
// This mock must be declared BEFORE the module-under-test is imported so
// that the top-level `path.join(os.homedir(), ...)` assignment uses our fake.
// ---------------------------------------------------------------------------
vi.mock("node:os", () => {
  return {
    default: {
      homedir: vi.fn(() => "/fake-home"),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock node:fs to intercept all real I/O.  We keep an in-memory store that
// the individual test cases populate as needed.
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => {
  return {
    default: {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(),
    },
  };
});

import fs from "node:fs";
import {
  generateSessionId,
  saveSession,
  loadSession,
  listSessions,
  getLastSession,
  extractSummary,
  type SessionData,
  type SessionMetadata,
} from "../src/session.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The SESSION_DIR value that session.ts computes at load time. */
const SESSION_DIR = "/fake-home/.mcc/sessions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: "test-id-1",
    cwd: "/some/project",
    provider: "openai",
    model: "gpt-4o",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    messageCount: 1,
    summary: "test summary",
    messages: [{ role: "user", content: "hello" }],
    ...overrides,
  };
}

function makeMeta(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  const { messages: _ignored, ...base } = makeSession(overrides as Partial<SessionData>);
  return { ...base, ...overrides } as SessionMetadata;
}

/** Simulate readdirSync returning a list of .json filenames. */
function mockReaddirSync(filenames: string[]): void {
  vi.mocked(fs.readdirSync).mockReturnValue(filenames as unknown as ReturnType<typeof fs.readdirSync>);
}

/** Simulate readFileSync returning session JSON for specific IDs. */
function mockReadFileSync(sessions: SessionData[]): void {
  vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
    const p = String(filePath);
    for (const s of sessions) {
      if (p.endsWith(`${s.id}.json`)) {
        return JSON.stringify(s);
      }
    }
    const err: NodeJS.ErrnoException = new Error("ENOENT: no such file");
    err.code = "ENOENT";
    throw err;
  });
}

// ---------------------------------------------------------------------------
// Reset mocks before each test to guarantee isolation.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(fs.mkdirSync).mockReset();
  vi.mocked(fs.writeFileSync).mockReset();
  vi.mocked(fs.readFileSync).mockReset();
  vi.mocked(fs.readdirSync).mockReset();
});

// ===========================================================================
// generateSessionId
// ===========================================================================

describe("generateSessionId", () => {
  it("should_return_non_empty_string_when_called", () => {
    const id = generateSessionId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("should_return_different_ids_when_called_twice", () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).not.toBe(id2);
  });
});

// ===========================================================================
// saveSession
// ===========================================================================

describe("saveSession", () => {
  it("should_create_session_directory_before_writing_file", () => {
    const session = makeSession();
    saveSession(session);

    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(SESSION_DIR, {
      recursive: true,
    });
  });

  it("should_write_json_file_to_correct_path_when_saving_session", () => {
    const session = makeSession({ id: "abc123" });
    saveSession(session);

    const expectedPath = `${SESSION_DIR}/abc123.json`;
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
      "utf-8"
    );
  });

  it("should_serialize_all_session_fields_as_json_when_saving", () => {
    const session = makeSession({
      id: "ser-test",
      cwd: "/my/project",
      summary: "serialised summary",
    });
    saveSession(session);

    const [, writtenContent] = vi.mocked(fs.writeFileSync).mock.calls[0];
    const parsed = JSON.parse(String(writtenContent));
    expect(parsed.id).toBe("ser-test");
    expect(parsed.cwd).toBe("/my/project");
    expect(parsed.summary).toBe("serialised summary");
    expect(Array.isArray(parsed.messages)).toBe(true);
  });
});

// ===========================================================================
// loadSession
// ===========================================================================

describe("loadSession", () => {
  it("should_return_session_data_when_id_exists", () => {
    const session = makeSession({ id: "load-me" });
    mockReadFileSync([session]);

    const result = loadSession("load-me");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("load-me");
  });

  it("should_return_null_when_id_does_not_exist", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error("ENOENT");
      err.code = "ENOENT";
      throw err;
    });

    const result = loadSession("nonexistent-id");
    expect(result).toBeNull();
  });

  it("should_correctly_deserialize_messages_array_when_loading_session", () => {
    const session = makeSession({
      id: "msg-test",
      messages: [
        { role: "user", content: "first message" },
        { role: "assistant", content: "first reply" },
      ],
    });
    mockReadFileSync([session]);

    const result = loadSession("msg-test");
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0]).toEqual({ role: "user", content: "first message" });
    expect(result!.messages[1]).toEqual({ role: "assistant", content: "first reply" });
  });

  it("should_return_null_when_file_contains_invalid_json", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json }");

    const result = loadSession("bad-json-id");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// listSessions
// ===========================================================================

describe("listSessions", () => {
  it("should_return_empty_array_when_directory_has_no_json_files", () => {
    mockReaddirSync([]);

    const result = listSessions();
    expect(result).toEqual([]);
  });

  it("should_return_sessions_sorted_by_updatedAt_descending_when_multiple_exist", () => {
    const oldest = makeSession({ id: "s1", updatedAt: "2025-01-01T00:00:00.000Z" });
    const middle = makeSession({ id: "s2", updatedAt: "2025-06-01T00:00:00.000Z" });
    const newest = makeSession({ id: "s3", updatedAt: "2025-12-31T00:00:00.000Z" });

    mockReaddirSync(["s1.json", "s2.json", "s3.json"]);
    mockReadFileSync([oldest, middle, newest]);

    const result = listSessions();
    expect(result[0].id).toBe("s3");
    expect(result[1].id).toBe("s2");
    expect(result[2].id).toBe("s1");
  });

  it("should_return_at_most_20_sessions_when_more_than_20_exist", () => {
    // Build 25 sessions with strictly ordered timestamps
    const sessions: SessionData[] = Array.from({ length: 25 }, (_, i) => {
      const ts = new Date(Date.UTC(2025, 0, i + 1)).toISOString();
      return makeSession({ id: `s${i + 1}`, updatedAt: ts });
    });

    mockReaddirSync(sessions.map((s) => `${s.id}.json`));
    mockReadFileSync(sessions);

    const result = listSessions();
    expect(result).toHaveLength(20);
  });

  it("should_exclude_non_json_files_when_listing_sessions", () => {
    const session = makeSession({ id: "valid" });
    mockReaddirSync(["valid.json", "README.md", ".DS_Store"]);
    mockReadFileSync([session]);

    const result = listSessions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("valid");
  });

  it("should_omit_messages_field_from_returned_metadata", () => {
    const session = makeSession({ id: "no-msgs" });
    mockReaddirSync(["no-msgs.json"]);
    mockReadFileSync([session]);

    const result = listSessions();
    expect(result[0]).not.toHaveProperty("messages");
  });

  it("should_skip_files_with_invalid_json_without_throwing", () => {
    const good = makeSession({ id: "good" });

    mockReaddirSync(["bad.json", "good.json"]);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.endsWith("bad.json")) return "{ not valid json }";
      if (p.endsWith("good.json")) return JSON.stringify(good);
      const err: NodeJS.ErrnoException = new Error("ENOENT");
      err.code = "ENOENT";
      throw err;
    });

    const result = listSessions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("good");
  });
});

// ===========================================================================
// getLastSession
// ===========================================================================

describe("getLastSession", () => {
  it("should_return_matching_cwd_session_when_one_exists", () => {
    const target = makeSession({
      id: "match",
      cwd: "/target/project",
      updatedAt: "2025-06-01T00:00:00.000Z",
    });
    const other = makeSession({
      id: "other",
      cwd: "/other/project",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    mockReaddirSync(["match.json", "other.json"]);
    mockReadFileSync([target, other]);

    const result = getLastSession("/target/project");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("match");
  });

  it("should_return_first_session_when_no_cwd_match_exists", () => {
    const newest = makeSession({
      id: "newest",
      cwd: "/some/other",
      updatedAt: "2025-12-01T00:00:00.000Z",
    });
    const older = makeSession({
      id: "older",
      cwd: "/another/path",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    mockReaddirSync(["newest.json", "older.json"]);
    mockReadFileSync([newest, older]);

    // cwd that exists in neither session
    const result = getLastSession("/no/match");
    expect(result).not.toBeNull();
    // listSessions sorts descending, so sessions[0] is the newest
    expect(result!.id).toBe("newest");
  });

  it("should_return_null_when_no_sessions_exist", () => {
    mockReaddirSync([]);

    const result = getLastSession("/any/path");
    expect(result).toBeNull();
  });

  it("should_prefer_cwd_match_over_more_recent_unmatched_session", () => {
    // The CWD-matching session is older but should still be returned first
    const recentUnmatched = makeSession({
      id: "recent",
      cwd: "/different",
      updatedAt: "2025-12-31T00:00:00.000Z",
    });
    const olderMatched = makeSession({
      id: "matched",
      cwd: "/my/cwd",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    mockReaddirSync(["recent.json", "matched.json"]);
    mockReadFileSync([recentUnmatched, olderMatched]);

    const result = getLastSession("/my/cwd");
    expect(result!.id).toBe("matched");
  });
});

// ===========================================================================
// extractSummary
// ===========================================================================

describe("extractSummary", () => {
  it("should_extract_content_from_first_user_message_when_present", () => {
    const messages = [
      { role: "system" as const, content: "you are helpful" },
      { role: "user" as const, content: "list all files" },
    ];
    expect(extractSummary(messages)).toBe("list all files");
  });

  it("should_truncate_to_80_chars_and_append_ellipsis_when_message_exceeds_80_chars", () => {
    const longContent = "a".repeat(100);
    const messages = [{ role: "user" as const, content: longContent }];

    const result = extractSummary(messages);
    expect(result).toBe("a".repeat(80) + "...");
    expect(result.length).toBe(83);
  });

  it("should_return_content_unchanged_when_message_is_exactly_80_chars", () => {
    const exactContent = "b".repeat(80);
    const messages = [{ role: "user" as const, content: exactContent }];

    const result = extractSummary(messages);
    expect(result).toBe(exactContent);
    expect(result).not.toContain("...");
  });

  it("should_return_empty_session_string_when_no_user_message_exists", () => {
    const messages = [
      { role: "system" as const, content: "system prompt" },
      { role: "assistant" as const, content: "I am ready" },
    ];
    expect(extractSummary(messages)).toBe("(empty session)");
  });

  it("should_return_empty_session_string_when_messages_array_is_empty", () => {
    expect(extractSummary([])).toBe("(empty session)");
  });

  it("should_return_empty_string_summary_when_user_message_content_is_non_string", () => {
    // When content is an array (e.g. multipart), the function treats it as ""
    const messages = [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: "array content" }],
      },
    ];
    // extractSummary falls back to "" for non-string content, no ellipsis added
    const result = extractSummary(messages);
    expect(result).toBe("");
  });
});
