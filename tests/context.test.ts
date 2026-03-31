import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  collectCandidates,
  loadContext,
  clearContextCache,
} from "../src/context.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a tmp dir, write files into it, return cleanup function. */
function makeTmpDir(): { tmpDir: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-test-"));
  return {
    tmpDir,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// collectCandidates
// ---------------------------------------------------------------------------

describe("collectCandidates", () => {
  it("should return candidates in correct priority order: user → parents → project → .claude/project → project-local", () => {
    const home = os.homedir();
    // Use a path two levels below home so we get at least one parent entry
    const cwd = path.join(home, "workspace", "myproject");
    const candidates = collectCandidates(cwd);

    const sources = candidates.map((c) => c.source);

    // First entry must be user
    expect(sources[0]).toBe("user");

    // Last two entries must be project then project-local
    const last = sources[sources.length - 1];
    const secondLast = sources[sources.length - 2];
    const thirdLast = sources[sources.length - 3];
    expect(last).toBe("project-local");
    expect(secondLast).toBe("project");
    expect(thirdLast).toBe("project");

    // All middle entries must be parent
    const middleSources = sources.slice(1, sources.length - 3);
    for (const s of middleSources) {
      expect(s).toBe("parent");
    }
  });

  it("should set correct file paths for each candidate", () => {
    const home = os.homedir();
    const cwd = path.join(home, "workspace", "myproject");
    const candidates = collectCandidates(cwd);

    // user path
    expect(candidates[0].filePath).toBe(
      path.join(home, ".claude", "CLAUDE.md")
    );

    // project paths (last three)
    const n = candidates.length;
    expect(candidates[n - 3].filePath).toBe(path.join(cwd, "CLAUDE.md"));
    expect(candidates[n - 2].filePath).toBe(
      path.join(cwd, ".claude", "CLAUDE.md")
    );
    expect(candidates[n - 1].filePath).toBe(path.join(cwd, "CLAUDE.local.md"));
  });

  it("should not include parent dirs at or above homedir", () => {
    const home = os.homedir();
    // cwd is a direct child of home → parent is home → loop breaks immediately
    const cwd = path.join(home, "myproject");
    const candidates = collectCandidates(cwd);

    const parentEntries = candidates.filter((c) => c.source === "parent");
    expect(parentEntries).toHaveLength(0);
  });

  it("should cap parent dirs at MAX_PARENT_DEPTH (10) even for very deep paths", () => {
    // Build a path that is 15 levels below os.tmpdir() (which is above homedir on most systems)
    // We bypass the homedir guard by using a path outside of home.
    // We fake homedir via vi.spyOn so the guard never triggers.
    const fakeHome = "/nonexistent-home-for-test";
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    try {
      // 15-level deep path starting from /tmp
      const segments = Array.from({ length: 15 }, (_, i) => `level${i + 1}`);
      const cwd = path.join("/tmp", ...segments);

      const candidates = collectCandidates(cwd);
      const parentEntries = candidates.filter((c) => c.source === "parent");

      expect(parentEntries.length).toBeLessThanOrEqual(10);
    } finally {
      homedirSpy.mockRestore();
    }
  });

  it("should order parent dirs from farthest to nearest (farthest has lower index)", () => {
    const home = os.homedir();
    // cwd three levels below home: home/a/b/c
    const cwd = path.join(home, "a", "b", "c");
    const candidates = collectCandidates(cwd);

    const parents = candidates
      .filter((c) => c.source === "parent")
      .map((c) => c.filePath);

    // Farthest parent is home/a, nearest parent is home/a/b
    expect(parents[0]).toBe(path.join(home, "a", "CLAUDE.md"));
    expect(parents[1]).toBe(path.join(home, "a", "b", "CLAUDE.md"));
  });
});

// ---------------------------------------------------------------------------
// loadContext
// ---------------------------------------------------------------------------

describe("loadContext", () => {
  let tmpDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    clearContextCache();
    ({ tmpDir, cleanup } = makeTmpDir());
  });

  afterEach(() => {
    clearContextCache();
    cleanup();
  });

  it("should return empty files array and empty combinedContent when no CLAUDE.md files exist", () => {
    const result = loadContext(tmpDir);

    expect(result.files).toHaveLength(0);
    expect(result.combinedContent).toBe("");
  });

  it("should read project CLAUDE.md when it exists", () => {
    const content = "# Project Instructions\nDo the thing.";
    writeFile(path.join(tmpDir, "CLAUDE.md"), content);

    const result = loadContext(tmpDir);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].source).toBe("project");
    expect(result.files[0].content).toBe(content);
    expect(result.files[0].path).toBe(path.join(tmpDir, "CLAUDE.md"));
  });

  it("should read .claude/CLAUDE.md with source=project", () => {
    const content = "# Dot Claude Instructions";
    writeFile(path.join(tmpDir, ".claude", "CLAUDE.md"), content);

    const result = loadContext(tmpDir);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].source).toBe("project");
    expect(result.files[0].content).toBe(content);
  });

  it("should read CLAUDE.local.md with source=project-local", () => {
    const content = "# Local Override";
    writeFile(path.join(tmpDir, "CLAUDE.local.md"), content);

    const result = loadContext(tmpDir);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].source).toBe("project-local");
  });

  it("should load multiple files and order them lower-priority first", () => {
    // We isolate within tmpDir so no real homedir files interfere.
    // Create project + project-local files.
    writeFile(path.join(tmpDir, "CLAUDE.md"), "project content");
    writeFile(path.join(tmpDir, "CLAUDE.local.md"), "local content");

    const result = loadContext(tmpDir);

    // project must come before project-local
    const projectIdx = result.files.findIndex((f) => f.source === "project");
    const localIdx = result.files.findIndex((f) => f.source === "project-local");
    expect(projectIdx).toBeGreaterThanOrEqual(0);
    expect(localIdx).toBeGreaterThan(projectIdx);
  });

  it("should format combinedContent with <claude-md source=...> wrapper tags", () => {
    const content = "hello world";
    writeFile(path.join(tmpDir, "CLAUDE.md"), content);

    const result = loadContext(tmpDir);

    expect(result.combinedContent).toContain("<claude-md source=");
    expect(result.combinedContent).toContain("</claude-md>");
    expect(result.combinedContent).toContain(content);
  });

  it("should use relative path in source attribute for files inside cwd", () => {
    writeFile(path.join(tmpDir, "CLAUDE.md"), "content");

    const result = loadContext(tmpDir);

    // The source attribute should be the relative path "CLAUDE.md", not an absolute path
    expect(result.combinedContent).toContain('source="CLAUDE.md"');
  });

  it("should use ~ shorthand in source attribute for user-level file", () => {
    const fakeHome = tmpDir;
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    try {
      // Create user-level file under our fake home
      const userClaudeMd = path.join(fakeHome, ".claude", "CLAUDE.md");
      writeFile(userClaudeMd, "user instructions");

      // cwd must be a direct child of fakeHome to avoid parent traversal finding the same dir
      const cwd = path.join(fakeHome, "project");
      fs.mkdirSync(cwd, { recursive: true });

      const result = loadContext(cwd);

      expect(result.combinedContent).toContain('source="~/.claude/CLAUDE.md"');
    } finally {
      homedirSpy.mockRestore();
    }
  });

  it("should join multiple files with double newline separator in combinedContent", () => {
    writeFile(path.join(tmpDir, "CLAUDE.md"), "project");
    writeFile(path.join(tmpDir, "CLAUDE.local.md"), "local");

    const result = loadContext(tmpDir);

    expect(result.combinedContent).toContain("</claude-md>\n\n<claude-md");
  });

  it("should return the cached object on second call without re-reading filesystem", () => {
    writeFile(path.join(tmpDir, "CLAUDE.md"), "original content");

    const first = loadContext(tmpDir);

    // Overwrite file content after first load
    writeFile(path.join(tmpDir, "CLAUDE.md"), "changed content");

    const second = loadContext(tmpDir);

    // Same reference — cache was used
    expect(second).toBe(first);
    // Still holds original content
    expect(second.files[0].content).toBe("original content");
  });
});

// ---------------------------------------------------------------------------
// clearContextCache
// ---------------------------------------------------------------------------

describe("clearContextCache", () => {
  let tmpDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    clearContextCache();
    ({ tmpDir, cleanup } = makeTmpDir());
  });

  afterEach(() => {
    clearContextCache();
    cleanup();
  });

  it("should cause loadContext to re-read the filesystem after cache is cleared", () => {
    writeFile(path.join(tmpDir, "CLAUDE.md"), "original content");
    const first = loadContext(tmpDir);
    expect(first.files[0].content).toBe("original content");

    // Modify file, then clear cache
    writeFile(path.join(tmpDir, "CLAUDE.md"), "updated content");
    clearContextCache();

    const second = loadContext(tmpDir);
    // Different object — fresh read
    expect(second).not.toBe(first);
    expect(second.files[0].content).toBe("updated content");
  });

  it("should allow loadContext to pick up a newly created file after cache clear", () => {
    // First load with no files
    const first = loadContext(tmpDir);
    expect(first.files).toHaveLength(0);

    // Create a file and clear cache
    writeFile(path.join(tmpDir, "CLAUDE.local.md"), "new local content");
    clearContextCache();

    const second = loadContext(tmpDir);
    expect(second.files).toHaveLength(1);
    expect(second.files[0].source).toBe("project-local");
    expect(second.files[0].content).toBe("new local content");
  });

  it("should make loadContext return empty again after file is deleted and cache is cleared", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    writeFile(filePath, "some content");
    const first = loadContext(tmpDir);
    expect(first.files).toHaveLength(1);

    // Delete the file and clear cache
    fs.unlinkSync(filePath);
    clearContextCache();

    const second = loadContext(tmpDir);
    expect(second.files).toHaveLength(0);
    expect(second.combinedContent).toBe("");
  });
});
