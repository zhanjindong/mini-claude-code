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
    if (level <= 2) return chalk.bold.underline(text);
    return chalk.bold(text);
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

  // Bold: **text** or __text__
  text = text.replace(/\*{2}(.+?)\*{2}/g, (_, t) => chalk.bold(t));
  text = text.replace(/_{2}(.+?)_{2}/g, (_, t) => chalk.bold(t));

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
