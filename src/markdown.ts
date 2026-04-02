// Simple terminal markdown renderer using chalk
// Handles: bold, italic, inline code, code blocks, headers, lists, links, horizontal rules
// Also provides colorized git diff rendering.

import chalk from "chalk";

/**
 * Render a unified diff string with per-line coloring.
 *
 * - `diff --git` header lines: bold yellow
 * - `---` / `+++` file indicators: bold
 * - `@@` hunk headers: cyan
 * - `+` added lines: green
 * - `-` removed lines: red
 * - context lines: dim
 */
export function renderDiff(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git")) {
        return chalk.bold.yellow(line);
      }
      if (line.startsWith("+++") || line.startsWith("---")) {
        return chalk.bold(line);
      }
      if (line.startsWith("+")) {
        return chalk.green(line);
      }
      if (line.startsWith("-")) {
        return chalk.red(line);
      }
      if (line.startsWith("@@")) {
        return chalk.cyan(line);
      }
      return chalk.dim(line);
    })
    .join("\n");
}

export function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trimStart().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
        codeLines = [];
      } else {
        // End of code block — render
        result.push(chalk.dim("  ┌" + (codeLang ? ` ${codeLang} ` : "") + "─".repeat(Math.max(0, 40 - codeLang.length))));
        for (const cl of codeLines) {
          result.push(chalk.dim("  │ ") + chalk.yellow(cl));
        }
        result.push(chalk.dim("  └" + "─".repeat(42)));
        inCodeBlock = false;
        codeLang = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    result.push(renderInline(line));
  }

  // Unclosed code block — flush as-is
  if (inCodeBlock) {
    for (const cl of codeLines) {
      result.push("  " + chalk.yellow(cl));
    }
  }

  return result.join("\n");
}

function renderInline(line: string): string {
  // Headers
  const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headerMatch) {
    const level = headerMatch[1].length;
    const text = applyInlineStyles(headerMatch[2]);
    if (level <= 2) return chalk.bold.underline.white(text);
    return chalk.bold.white(text);
  }

  // Horizontal rule
  if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
    return chalk.dim("─".repeat(50));
  }

  // Unordered list
  const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)$/);
  if (ulMatch) {
    const indent = ulMatch[1];
    return `${indent}  • ${applyInlineStyles(ulMatch[2])}`;
  }

  // Ordered list
  const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
  if (olMatch) {
    return `${olMatch[1]}  ${olMatch[2]}. ${applyInlineStyles(olMatch[3])}`;
  }

  // Blockquote
  const bqMatch = line.match(/^>\s?(.*)$/);
  if (bqMatch) {
    return chalk.dim("  │ ") + chalk.italic(applyInlineStyles(bqMatch[1]));
  }

  return applyInlineStyles(line);
}

function applyInlineStyles(text: string): string {
  // Inline code: `code`
  text = text.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(code));

  // Bold + italic: ***text*** or ___text___
  text = text.replace(/\*{3}(.+?)\*{3}/g, (_, t) => chalk.bold.italic(t));
  text = text.replace(/_{3}(.+?)_{3}/g, (_, t) => chalk.bold.italic(t));

  // Bold: **text** or __text__ (use white+bold for visibility)
  text = text.replace(/\*{2}(.+?)\*{2}/g, (_, t) => chalk.bold.white(t));
  text = text.replace(/_{2}(.+?)_{2}/g, (_, t) => chalk.bold.white(t));

  // Italic: *text* or _text_
  text = text.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, (_, t) => chalk.italic(t));
  text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, (_, t) => chalk.italic(t));

  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, (_, t) => chalk.strikethrough(t));

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) =>
    chalk.blue.underline(t) + chalk.dim(` (${url})`)
  );

  return text;
}

// --- Claude Code-style inline diff rendering ---

// True-color backgrounds matching Claude Code's deep muted tones
// Deep red bg (rgb 50,15,15) + muted red text (rgb 200,130,130)
const REMOVED_BG = "\x1b[48;2;50;15;15m\x1b[38;2;200;130;130m";
// Deep green bg (rgb 10;35;15) + muted green text (rgb 130;200;140)
const ADDED_BG = "\x1b[48;2;10;35;15m\x1b[38;2;130;200;140m";
const RESET = "\x1b[0m";
// \x1b[K = erase to end of line (extends background to terminal edge)

interface DiffLine {
  tag: "=" | "-" | "+";
  oldIdx?: number;
  newIdx?: number;
  text: string;
}

function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  if (m > 2000 || n > 2000) return [];

  // LCS via DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build raw diff
  const raw: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.push({ tag: "=", oldIdx: i, newIdx: j, text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ tag: "+", newIdx: j, text: newLines[j - 1] });
      j--;
    } else {
      raw.push({ tag: "-", oldIdx: i, text: oldLines[i - 1] });
      i--;
    }
  }
  raw.reverse();

  // Reorder: in each group of consecutive changes, put all "-" before "+"
  const result: DiffLine[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].tag === "=") {
      result.push(raw[k]);
      k++;
    } else {
      const removes: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (k < raw.length && raw[k].tag !== "=") {
        if (raw[k].tag === "-") removes.push(raw[k]);
        else adds.push(raw[k]);
        k++;
      }
      result.push(...removes, ...adds);
    }
  }

  return result;
}

/**
 * Render an inline diff in Claude Code style.
 *
 * Format (matches screenshot):
 *   {lineNo}  {content}       — context (dim)
 *   {lineNo} -{content}       — removed (dark red bg, light red text)
 *   {lineNo} +{content}       — added (dark green bg, light green text)
 */
export function renderEditDiff(
  oldContent: string | null,
  newContent: string,
  contextLines = 3,
  maxLines = 40,
): string {
  const oldLines = oldContent !== null ? oldContent.split("\n") : [];
  const newLines = newContent.split("\n");

  if (oldLines.length > 2000 || newLines.length > 2000) {
    return chalk.dim(`    (file too large for inline diff: ${oldLines.length} → ${newLines.length} lines)`);
  }

  const diff = computeLineDiff(oldLines, newLines);
  if (diff.length === 0) return "";

  // Mark indices that should be visible (changed lines + surrounding context)
  const visible = new Set<number>();
  diff.forEach((d, idx) => {
    if (d.tag !== "=") {
      for (let c = Math.max(0, idx - contextLines); c <= Math.min(diff.length - 1, idx + contextLines); c++) {
        visible.add(c);
      }
    }
  });

  if (visible.size === 0) return "";

  // Determine line number width for alignment
  let maxNum = 1;
  for (const d of diff) {
    if (d.oldIdx && d.oldIdx > maxNum) maxNum = d.oldIdx;
    if (d.newIdx && d.newIdx > maxNum) maxNum = d.newIdx;
  }
  const w = Math.max(String(maxNum).length, 3);

  const out: string[] = [];
  let lastIdx = -1;

  for (let idx = 0; idx < diff.length; idx++) {
    if (!visible.has(idx)) continue;

    // Hunk separator for gaps
    if (lastIdx >= 0 && idx - lastIdx > 1) {
      out.push(chalk.dim(" ".repeat(w + 5) + "···"));
    }
    lastIdx = idx;

    const d = diff[idx];
    const num = (n: number | undefined) =>
      n !== undefined ? String(n).padStart(w) : " ".repeat(w);

    if (d.tag === "=") {
      // Context line: dim, two spaces before content
      out.push(chalk.dim(`${num(d.newIdx)}  ${d.text}`));
    } else if (d.tag === "-") {
      // Removed line: dark red bg, extends to terminal edge
      out.push(`${REMOVED_BG}${num(d.oldIdx)} -${d.text}\x1b[K${RESET}`);
    } else {
      // Added line: dark green bg, extends to terminal edge
      out.push(`${ADDED_BG}${num(d.newIdx)} +${d.text}\x1b[K${RESET}`);
    }
  }

  if (out.length > maxLines) {
    const truncated = out.slice(0, maxLines);
    truncated.push(chalk.dim(`    ... +${out.length - maxLines} more lines`));
    return truncated.join("\n");
  }

  return out.join("\n");
}
