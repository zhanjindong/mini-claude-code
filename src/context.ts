import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Represents a single loaded CLAUDE.md file.
 */
export interface ContextFile {
  path: string;
  content: string;
  source: "project" | "project-local" | "parent" | "user";
}

/**
 * Result of loading all CLAUDE.md context files.
 */
export interface LoadedContext {
  files: ContextFile[];
  combinedContent: string;
}

// Module-level cache
let cachedContext: LoadedContext | null = null;

const MAX_PARENT_DEPTH = 10;

/**
 * Collect candidate CLAUDE.md paths ordered from lowest to highest priority.
 *
 * Order:
 *   1. ~/.claude/CLAUDE.md              (user)
 *   2. parent dirs CLAUDE.md            (farthest to nearest)
 *   3. {cwd}/CLAUDE.md                  (project)
 *   4. {cwd}/.claude/CLAUDE.md          (project)
 *   5. {cwd}/CLAUDE.local.md            (project-local)
 */
export function collectCandidates(
  cwd: string
): Array<{ filePath: string; source: ContextFile["source"] }> {
  const candidates: Array<{ filePath: string; source: ContextFile["source"] }> =
    [];
  const home = os.homedir();

  // 1. User-level (lowest priority)
  candidates.push({
    filePath: path.join(home, ".claude", "CLAUDE.md"),
    source: "user",
  });

  // 2. Parent directories - collect nearest-to-farthest, then reverse
  const parentDirs: string[] = [];
  let dir = path.dirname(cwd);
  let depth = 0;
  while (depth < MAX_PARENT_DEPTH) {
    // Stop if we've reached or passed the home directory
    if (dir === home || dir === path.dirname(dir)) {
      break;
    }
    parentDirs.push(dir);
    dir = path.dirname(dir);
    depth++;
  }
  // Reverse so farthest parent comes first (lower priority)
  parentDirs.reverse();
  for (const parentDir of parentDirs) {
    candidates.push({
      filePath: path.join(parentDir, "CLAUDE.md"),
      source: "parent",
    });
  }

  // 3. Project-level
  candidates.push({
    filePath: path.join(cwd, "CLAUDE.md"),
    source: "project",
  });

  // 4. Project .claude subdirectory
  candidates.push({
    filePath: path.join(cwd, ".claude", "CLAUDE.md"),
    source: "project",
  });

  // 5. Project-local (highest priority)
  candidates.push({
    filePath: path.join(cwd, "CLAUDE.local.md"),
    source: "project-local",
  });

  return candidates;
}

/**
 * Format a path for display in the combined content source attribute.
 * Uses path relative to cwd when possible, otherwise uses ~ shorthand for home.
 */
function formatSourcePath(filePath: string, cwd: string): string {
  const home = os.homedir();
  if (filePath.startsWith(cwd + path.sep) || filePath === cwd) {
    return path.relative(cwd, filePath);
  }
  if (filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}

/**
 * Load all CLAUDE.md context files from the standard search locations.
 *
 * Results are cached in a module-level variable. Call clearContextCache()
 * to force a fresh read on the next invocation.
 */
export function loadContext(cwd?: string): LoadedContext {
  if (cachedContext) {
    return cachedContext;
  }

  const resolvedCwd = cwd ?? process.cwd();
  const candidates = collectCandidates(resolvedCwd);
  const files: ContextFile[] = [];

  for (const candidate of candidates) {
    try {
      const content = fs.readFileSync(candidate.filePath, "utf-8");
      files.push({
        path: candidate.filePath,
        content,
        source: candidate.source,
      });
    } catch {
      // File does not exist or is unreadable, skip
    }
  }

  const combinedContent = files
    .map((f) => {
      const displayPath = formatSourcePath(f.path, resolvedCwd);
      return `<claude-md source="${displayPath}">\n${f.content}\n</claude-md>`;
    })
    .join("\n\n");

  cachedContext = { files, combinedContent };
  return cachedContext;
}

/**
 * Clear the cached context so the next loadContext() call re-reads the filesystem.
 */
export function clearContextCache(): void {
  cachedContext = null;
}
