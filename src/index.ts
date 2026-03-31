#!/usr/bin/env node

// Mini Claude Code - a minimal Claude Code-like CLI
// Supports: MiniMax, DeepSeek, OpenAI, OpenRouter, and any OpenAI-compatible API

import * as readline from "readline";
import { execSync } from "node:child_process";
import os from "node:os";
import chalk from "chalk";
import { QueryEngine, type EngineOptions } from "./engine.js";
import { initSkills, registerMcpTools } from "./tools/index.js";
import { executeSkill, type Skill } from "./skills.js";
import { getMcpServers, closeMcp } from "./mcp.js";
import { renderMarkdown, renderDiff } from "./markdown.js";
import { loadConfig, getConfig, saveUserConfig, type MccConfig } from "./config.js";
import { loadContext, type LoadedContext } from "./context.js";
import { initPermissions, resetPermissions } from "./permissions.js";
import { loadHooks, getHooks } from "./hooks.js";
import { formatTaskList } from "./tasks.js";
import {
  generateSessionId,
  saveSession,
  loadSession,
  listSessions,
  getLastSession,
  extractSummary,
} from "./session.js";

const VERSION = "0.1.0";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
${chalk.bold("Mini Claude Code")} v${VERSION}
A minimal Claude Code-like CLI tool with multi-provider support.

${chalk.bold("Usage:")}
  npx tsx src/index.ts [options] [prompt]

${chalk.bold("Options:")}
  --provider <name>     Provider: minimax, deepseek, openai, openrouter (default: minimax)
  --model <model>       Model name (uses provider default if omitted)
  --base-url <url>      Custom API base URL
  --api-key <key>       API key (or set via API_KEY env var)
  --resume              Resume most recent session for current directory
  -p, --prompt <text>   Run a single prompt and exit
  -h, --help            Show this help

${chalk.bold("Environment Variables:")}
  API_KEY               API key for the chosen provider

${chalk.bold("Provider Examples:")}
  # MiniMax (default)
  API_KEY=your-minimax-key npx tsx src/index.ts

  # DeepSeek
  API_KEY=your-key npx tsx src/index.ts --provider deepseek

  # OpenAI
  API_KEY=your-key npx tsx src/index.ts --provider openai

  # Custom provider
  API_KEY=your-key npx tsx src/index.ts --base-url https://your-api.com/v1 --model your-model

${chalk.bold("REPL Commands:")}
  /clear      Clear conversation history
  /compact    Compress conversation history
  /cost       Show token usage
  /diff       Show git diff
  /status     Show git status
  /resume     Resume most recent session
  /sessions   List saved sessions
  /hooks      List loaded hooks
  /mcp        List MCP servers and tools
  /tasks      List all tasks
  /help       Show help
  /exit       Exit
`);
    process.exit(0);
  }

  // Parse arguments
  const cliOptions: Record<string, string> = {};
  let oneShot: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--provider" && args[i + 1]) {
      cliOptions.provider = args[++i];
    } else if ((arg === "--model" || arg === "-m") && args[i + 1]) {
      cliOptions.model = args[++i];
    } else if (arg === "--base-url" && args[i + 1]) {
      cliOptions.baseURL = args[++i];
    } else if (arg === "--api-key" && args[i + 1]) {
      cliOptions.apiKey = args[++i];
    } else if (arg === "--resume") {
      cliOptions.resume = "true";
    } else if ((arg === "-p" || arg === "--prompt") && args[i + 1]) {
      oneShot = args[++i];
    } else if (!arg.startsWith("-")) {
      oneShot = args.slice(i).join(" ");
      break;
    }
  }

  // Build config overrides from CLI arguments
  const configOverrides: Partial<MccConfig & { apiKey?: string }> = {};
  if (cliOptions.provider) configOverrides.provider = cliOptions.provider;
  if (cliOptions.model) configOverrides.model = cliOptions.model;
  if (cliOptions.baseURL) configOverrides.baseURL = cliOptions.baseURL;
  if (cliOptions.apiKey) configOverrides.apiKey = cliOptions.apiKey;

  // Initialize configuration system
  const config = loadConfig(configOverrides);

  if (!config.apiKey) {
    console.error(chalk.red("Error: API key is required."));
    console.error(chalk.dim("Set via: export API_KEY=your-key-here"));
    console.error(chalk.dim("Or use:  --api-key your-key-here"));
    process.exit(1);
  }

  // Initialize permission system
  initPermissions(config.permissions);

  // Load hooks
  loadHooks(process.cwd());

  // Load CLAUDE.md context files
  const context = loadContext(process.cwd());

  // Initialize skills
  const { skills, summary: skillsSummary } = initSkills();

  // Initialize MCP servers
  const mcpToolCount = await registerMcpTools();

  // Ensure MCP connections are cleaned up on exit
  process.on("exit", () => closeMcp());

  // Build engine options from resolved config
  const engineOpts: EngineOptions = {
    provider: config.provider,
    model: config.model || undefined,
    maxTokens: config.maxTokens,
    baseURL: config.baseURL || undefined,
    apiKey: config.apiKey,
    skillsSummary: skillsSummary || undefined,
    contextContent: context.combinedContent || undefined,
  };

  const engine = new QueryEngine(engineOpts);

  // Session state
  let sessionId = generateSessionId();
  const sessionCreatedAt = new Date().toISOString();

  /** Save current session to disk */
  function persistSession(): void {
    const messages = engine.getMessages();
    if (messages.length === 0) return;
    saveSession({
      id: sessionId,
      cwd: process.cwd(),
      provider: engine.providerName,
      model: engine.modelName,
      createdAt: sessionCreatedAt,
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      summary: extractSummary(messages),
      messages,
    });
  }

  /** Resume from a session, returns true if successful */
  function resumeSession(): boolean {
    const last = getLastSession(process.cwd());
    if (!last) {
      console.log(chalk.yellow("No previous session found."));
      return false;
    }
    const data = loadSession(last.id);
    if (!data) {
      console.log(chalk.yellow("Failed to load session data."));
      return false;
    }
    engine.restoreMessages(data.messages);
    sessionId = data.id;
    console.log(chalk.green(`Resumed session ${data.id} (${data.messageCount} messages)`));
    console.log(chalk.dim(`  ${data.summary}`));
    return true;
  }

  // Handle --resume flag
  if (cliOptions.resume) {
    resumeSession();
  }

  // One-shot mode
  if (oneShot) {
    await runQuery(engine, oneShot);
    persistSession();
    process.exit(0);
  }

  // REPL mode
  printBanner(engine, skills, context, mcpToolCount);

  // Command menu items with descriptions
  const cmdEntries: { cmd: string; desc: string }[] = [
    { cmd: "/help", desc: "Show help" },
    { cmd: "/compact", desc: "Compress conversation history" },
    { cmd: "/clear", desc: "Clear conversation history" },
    { cmd: "/cost", desc: "Show token usage" },
    { cmd: "/resume", desc: "Resume most recent session" },
    { cmd: "/sessions", desc: "List saved sessions" },
    { cmd: "/diff", desc: "Show git diff" },
    { cmd: "/status", desc: "Show git status" },
    { cmd: "/skills", desc: "List loaded skills" },
    { cmd: "/hooks", desc: "List loaded hooks" },
    { cmd: "/mcp", desc: "List MCP servers and tools" },
    { cmd: "/permissions", desc: "Show permission rules" },
    { cmd: "/tasks", desc: "List all tasks" },
    { cmd: "/exit", desc: "Exit" },
    ...skills.map((s) => ({ cmd: "/" + s.name, desc: s.description || "" })),
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n" + chalk.blue("\u276f "),
    terminal: true,
  });

  // ── Paste detection state ──
  const pastedTexts = new Map<number, string>();
  let pasteCount = 0;

  /**
   * Handle multi-line paste: collapse into a visual indicator,
   * store actual content for expansion when Enter is pressed.
   */
  function handlePaste(rawText: string) {
    const text = rawText
      .replace(/\x1b\[200~/g, "")   // strip bracketed paste start
      .replace(/\x1b\[201~/g, "")   // strip bracketed paste end
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    const currentLine = (rl as any).line as string;
    const cursorPos = (rl as any).cursor as number;

    // Build full content: existing input + pasted text
    const before = currentLine.slice(0, cursorPos);
    const after = currentLine.slice(cursorPos);
    let fullContent = before + text + after;

    // Check if ends with newline (auto-submit)
    const autoSubmit = fullContent.endsWith("\n");
    if (autoSubmit) fullContent = fullContent.replace(/\n+$/, "");

    const lines = fullContent.split("\n");

    // Single line after processing → insert normally
    if (lines.length <= 1) {
      const toInsert = text.replace(/\n+$/, "");
      for (const ch of toInsert) {
        origTtyWrite(ch, undefined);
      }
      if (autoSubmit) origTtyWrite("\r", { name: "return" });
      return;
    }

    // Multi-line: collapse into indicator
    pasteCount++;
    pastedTexts.set(pasteCount, fullContent);

    const lineCount = lines.length;
    const indicator = `[Pasted text #${pasteCount} +${lineCount} lines]`;

    // Clear current readline display and replace with indicator
    clearMenu();
    menuFiltered = [];
    const rlCursor = (rl as any).cursor as number;
    readline.moveCursor(process.stdout, -rlCursor, 0);
    process.stdout.write("\x1b[K" + chalk.dim(indicator));
    (rl as any).line = indicator;
    (rl as any).cursor = indicator.length;

    if (autoSubmit) {
      origTtyWrite("\r", { name: "return" });
    }
  }

  // ── Dropdown menu state ──
  let menuFiltered: typeof cmdEntries = [];
  let menuIdx = 0;
  let menuLines = 0; // number of rendered menu lines on screen

  function clearMenu() {
    if (menuLines === 0) return;
    process.stdout.write("\x1b7"); // save cursor
    for (let i = 0; i < menuLines; i++) {
      process.stdout.write("\n\x1b[2K"); // down + clear
    }
    process.stdout.write("\x1b8"); // restore cursor
    menuLines = 0;
  }

  function renderMenu() {
    clearMenu();
    if (menuFiltered.length === 0) return;

    const maxShow = Math.min(menuFiltered.length, 8);
    // Save cursor BEFORE making scroll room (\n resets column to 0)
    process.stdout.write("\x1b7"); // save cursor at input position (row + column)
    process.stdout.write("\n".repeat(maxShow)); // ensure scroll room
    process.stdout.write("\x1b8"); // restore to original position (correct column)
    process.stdout.write("\x1b7"); // re-save for final restore after drawing
    for (let i = 0; i < maxShow; i++) {
      const { cmd, desc } = menuFiltered[i];
      process.stdout.write("\n\x1b[2K");
      if (i === menuIdx) {
        process.stdout.write(`  \x1b[7m ${cmd} \x1b[27m \x1b[90m${desc}\x1b[39m`);
      } else {
        process.stdout.write(`   \x1b[90m${cmd}  ${desc}\x1b[39m`);
      }
    }
    if (menuFiltered.length > maxShow) {
      process.stdout.write(`\n\x1b[2K  \x1b[90m\u2026 +${menuFiltered.length - maxShow} more\x1b[39m`);
      menuLines = maxShow + 1;
    } else {
      menuLines = maxShow;
    }
    process.stdout.write("\x1b8"); // restore cursor
  }

  function updateMenu() {
    const line = (rl as any).line as string;
    if (!line || !line.startsWith("/") || line.includes(" ")) {
      if (menuLines > 0) clearMenu();
      menuFiltered = [];
      return;
    }
    const prefix = line.toLowerCase();
    menuFiltered = cmdEntries.filter((e) => e.cmd.startsWith(prefix));
    menuIdx = Math.min(menuIdx, Math.max(0, menuFiltered.length - 1));
    renderMenu();
  }

  function acceptSelection() {
    if (menuFiltered.length === 0) return;
    const selected = menuFiltered[menuIdx].cmd;
    clearMenu();
    menuFiltered = [];
    // Replace readline buffer with selected command
    const cursor = (rl as any).cursor as number;
    readline.moveCursor(process.stdout, -cursor, 0);
    process.stdout.write("\x1b[K" + selected);
    (rl as any).line = selected;
    (rl as any).cursor = selected.length;
  }

  // ── Paste detection at stdin data level ──
  // Readline in terminal mode splits data into per-character keypress events.
  // We intercept raw stdin data BEFORE the keypress module to detect multi-line paste.
  const origStdinEmit = process.stdin.emit.bind(process.stdin);
  (process.stdin as any).emit = function (event: string | symbol, ...emitArgs: any[]) {
    if (event === "data") {
      const raw = emitArgs[0];
      const str = typeof raw === "string" ? raw : (Buffer.isBuffer(raw) ? raw.toString() : String(raw));
      // A real paste: multi-byte chunk containing newline characters
      if (str.length > 1 && /[\n\r]/.test(str)) {
        handlePaste(str);
        return true; // swallow — don't let keypress module split it
      }
    }
    return origStdinEmit(event, ...emitArgs);
  };

  // Intercept readline key processing for menu navigation
  const origTtyWrite = (rl as any)._ttyWrite.bind(rl);
  (rl as any)._ttyWrite = function (s: string, key: any) {
    if (menuFiltered.length > 0 && key) {
      if (key.name === "up") {
        menuIdx = (menuIdx - 1 + menuFiltered.length) % menuFiltered.length;
        renderMenu();
        return;
      }
      if (key.name === "down") {
        menuIdx = (menuIdx + 1) % menuFiltered.length;
        renderMenu();
        return;
      }
      if (key.name === "tab") {
        acceptSelection();
        return;
      }
      if (key.name === "escape") {
        clearMenu();
        menuFiltered = [];
        return;
      }
      if (key.name === "return") {
        const selected = menuFiltered[menuIdx]?.cmd;
        acceptSelection();
        // Handle /exit directly — readline internal state may not update reliably
        if (selected === "/exit" || selected === "/quit") {
          persistSession();
          console.log(chalk.dim("\nGoodbye!"));
          process.exit(0);
        }
        // Fall through so readline emits "line" event
      }
    }

    origTtyWrite(s, key);
    setImmediate(() => updateMenu());
  };

  rl.prompt();

  let busy = false;

  rl.on("line", async (line) => {
    // Menu may have left rendered lines — ensure cleanup
    clearMenu();
    menuFiltered = [];

    if (busy) return;

    // Expand pasted text indicators back to real content
    let input = line.trim();
    let wasPaste = false;
    if (pastedTexts.size > 0) {
      input = input.replace(/\[Pasted text #(\d+) \+\d+ lines\]/g, (_match, id) => {
        const pasteId = parseInt(id, 10);
        const content = pastedTexts.get(pasteId);
        if (content) {
          pastedTexts.delete(pasteId);
          wasPaste = true;
          return content;
        }
        return _match;
      });
    }

    // Show expanded paste content preview
    if (wasPaste && input) {
      const previewLines = input.split("\n");
      const maxPreview = 4;
      console.log(chalk.dim("  ⎿ Pasted content:"));
      for (let i = 0; i < Math.min(previewLines.length, maxPreview); i++) {
        const pl = previewLines[i].length > 100 ? previewLines[i].slice(0, 100) + "…" : previewLines[i];
        console.log(chalk.dim(`    ${pl}`));
      }
      if (previewLines.length > maxPreview) {
        console.log(chalk.dim(`    … +${previewLines.length - maxPreview} more lines`));
      }
    }

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith("/")) {
      // Async command: /compact (requires API call for summarization)
      if (input === "/compact") {
        const count = engine.messageCount;
        if (count <= 5) {
          console.log(chalk.dim("Conversation too short to compact."));
        } else {
          console.log(chalk.dim(`Compacting ${count} messages...`));
          busy = true;
          try {
            const result = await engine.compactHistory();
            console.log(
              chalk.green(`Compacted: removed ${result.removed} old messages, kept ${result.kept}`)
            );
            persistSession();
          } catch (err: any) {
            console.error(chalk.red(`Compact failed: ${err.message}`));
          }
          busy = false;
        }
        rl.prompt();
        return;
      }

      // Session commands
      if (input === "/resume") {
        resumeSession();
        rl.prompt();
        return;
      }

      if (input === "/sessions") {
        const sessions = listSessions();
        if (sessions.length === 0) {
          console.log(chalk.dim("No saved sessions."));
        } else {
          console.log(chalk.bold("\nRecent Sessions:"));
          for (const s of sessions.slice(0, 10)) {
            const isCurrent = s.id === sessionId;
            const marker = isCurrent ? chalk.green("\u2192 ") : "  ";
            console.log(`${marker}${chalk.cyan(s.id)} ${chalk.dim(s.updatedAt.slice(0, 16))} ${s.summary}`);
          }
        }
        rl.prompt();
        return;
      }

      // Built-in commands (sync, no API call)
      if (handleBuiltinCommand(input, engine, rl, skills, persistSession)) {
        rl.prompt();
        return;
      }

      // Skill invocation: /skill-name [args]
      const spaceIdx = input.indexOf(" ");
      const cmdWord = (spaceIdx === -1 ? input : input.slice(0, spaceIdx)).toLowerCase();
      const skillName = cmdWord.slice(1);
      const skill = skills.find((s) => s.name.toLowerCase() === skillName);

      if (skill) {
        const argsStr = spaceIdx === -1 ? undefined : input.slice(spaceIdx + 1).trim() || undefined;
        const expanded = executeSkill(skill, argsStr);
        console.log(chalk.cyan(`> /${skill.name}`) + (argsStr ? chalk.dim(` ${argsStr}`) : ""));
        busy = true;
        await runQuery(engine, expanded);
        persistSession();
        busy = false;
        rl.prompt();
        return;
      }

      console.log(chalk.yellow(`Unknown command: ${input}. Type /help for help.`));
      rl.prompt();
      return;
    }

    busy = true;
    await runQuery(engine, input);
    persistSession();
    busy = false;
    rl.prompt();
  });

  rl.on("close", () => {
    persistSession();
    console.log(chalk.dim("\nGoodbye!"));
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    // Ctrl+C: if line has content, clear it; otherwise exit
    if ((rl as any).line) {
      (rl as any).line = "";
      (rl as any).cursor = 0;
      clearMenu();
      menuFiltered = [];
      process.stdout.write("\n");
      rl.prompt();
    } else {
      persistSession();
      console.log(chalk.dim("\nGoodbye!"));
      process.exit(0);
    }
  });
}

// Thinking spinner — animated indicator while waiting for model response
const SPINNER_FRAMES = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];

function createSpinner() {
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      if (timer) return;
      process.stdout.write(chalk.cyan(SPINNER_FRAMES[0]));
      frame = 0;
      timer = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        process.stdout.write(`\x1b[1D${chalk.cyan(SPINNER_FRAMES[frame])}`);
      }, 80);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      process.stdout.write("\x1b[1D \x1b[1D"); // erase spinner character
    },
  };
}

async function runQuery(engine: QueryEngine, input: string) {
  let textBuffer = "";
  const spinner = createSpinner();
  const abortController = new AbortController();

  // Listen for Escape or Ctrl+C to abort
  const onKeypress = (_str: string, key: any) => {
    if (key?.name === "escape" || (key?.ctrl && key?.name === "c")) {
      abortController.abort();
    }
  };
  process.stdin.on("keypress", onKeypress);

  function flushText() {
    if (!textBuffer) return;
    const rendered = renderMarkdown(textBuffer.trim()).replace(/\n{3,}/g, "\n\n").trimEnd();
    process.stdout.write(rendered + "\n");
    textBuffer = "";
  }

  function cleanup() {
    spinner.stop();
    process.stdin.removeListener("keypress", onKeypress);
  }

  spinner.start();

  try {
    for await (const chunk of engine.query(input, abortController.signal)) {
      if (abortController.signal.aborted) break;
      spinner.stop();
      if (chunk.type === "text") {
        textBuffer += chunk.content;
      } else {
        // Flush buffered text as markdown before showing tool output
        flushText();
        process.stdout.write(chunk.content);
        // Restart spinner while waiting for next API response after tool execution
        spinner.start();
      }
    }
    cleanup();
    flushText();
    if (abortController.signal.aborted) {
      process.stdout.write(chalk.dim("\n(interrupted)\n"));
    }
  } catch (err: any) {
    cleanup();
    flushText();
    if (abortController.signal.aborted) {
      process.stdout.write(chalk.dim("\n(interrupted)\n"));
    } else if (err.status === 401) {
      console.error(chalk.red("\nAuthentication failed. Check your API key."));
    } else if (err.status === 429) {
      console.error(chalk.red("\nRate limited. Please wait and try again."));
    } else {
      console.error(chalk.red(`\nError: ${err.message}`));
    }
  }
}

function handleBuiltinCommand(
  input: string,
  engine: QueryEngine,
  rl: readline.Interface,
  skills: Skill[],
  persistSession: () => void
): boolean {
  const cmd = input.split(/\s+/)[0].toLowerCase();

  switch (cmd) {
    case "/exit":
    case "/quit":
      persistSession();
      console.log(chalk.dim("\nGoodbye!"));
      process.exit(0);

    case "/clear":
      engine.clearHistory();
      console.log(chalk.green("Conversation cleared."));
      return true;

    case "/cost": {
      const usage = engine.tokenUsage;
      console.log(chalk.bold("\nToken Usage:"));
      console.log(`  Input:  ${usage.input.toLocaleString()} tokens`);
      console.log(`  Output: ${usage.output.toLocaleString()} tokens`);
      return true;
    }

    case "/skills":
      if (skills.length === 0) {
        console.log(chalk.dim("\nNo skills loaded."));
      } else {
        console.log(chalk.bold("\nLoaded Skills:"));
        for (const s of skills) {
          const src = chalk.dim(`[${s.source}]`);
          console.log(`  /${s.name} ${src} ${s.description || ""}`);
        }
      }
      console.log(
        chalk.dim(
          `\nSkill directories:\n  Project: .mini-claude-code/skills/\n  User:    ~/.mini-claude-code/skills/`
        )
      );
      return true;

    case "/hooks": {
      const hooks = getHooks();
      if (hooks.length === 0) {
        console.log(chalk.dim("\nNo hooks loaded."));
      } else {
        console.log(chalk.bold("\nLoaded Hooks:"));
        for (const h of hooks) {
          const toolFilter = h.toolName ? chalk.cyan(h.toolName) : chalk.dim("*");
          console.log(`  ${chalk.yellow(h.event)} [${toolFilter}] ${chalk.dim(h.command)}`);
        }
      }
      console.log(
        chalk.dim(
          `\nHook config files:\n  Project: .mcc/hooks.json\n  User:    ~/.mcc/hooks.json`
        )
      );
      return true;
    }

    case "/mcp": {
      const servers = getMcpServers();
      if (servers.length === 0) {
        console.log(chalk.dim("\nNo MCP servers connected."));
      } else {
        console.log(chalk.bold("\nMCP Servers:"));
        for (const s of servers) {
          console.log(`  ${chalk.cyan(s.name)} ${chalk.dim(`(${s.toolCount} tools)`)}`);
        }
      }
      console.log(
        chalk.dim(
          `\nMCP config files:\n  Project: .mcc/mcp.json\n  User:    ~/.mcc/mcp.json`
        )
      );
      return true;
    }

    case "/diff": {
      try {
        const diff = execSync("git diff HEAD 2>/dev/null || git diff 2>/dev/null", {
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
          cwd: process.cwd(),
        }).trim();

        if (!diff) {
          console.log(chalk.dim("No changes detected."));
        } else {
          console.log(renderDiff(diff));
        }
      } catch {
        console.log(chalk.dim("Not a git repository or git not available."));
      }
      return true;
    }

    case "/status": {
      try {
        const status = execSync("git status --short 2>/dev/null", {
          encoding: "utf-8",
          cwd: process.cwd(),
        }).trim();

        if (!status) {
          console.log(chalk.dim("Working tree clean."));
        } else {
          console.log(chalk.bold("\nGit Status:"));
          console.log(status);
        }
      } catch {
        console.log(chalk.dim("Not a git repository or git not available."));
      }
      return true;
    }

    case "/permissions": {
      const permArgs = input.slice("/permissions".length).trim().toLowerCase();
      const cfg = getConfig();

      if (permArgs === "reset") {
        // Reset all permission rules
        saveUserConfig({ permissions: {} });
        resetPermissions();
        // Reload config to clear cached permissions
        loadConfig();
        initPermissions({});
        console.log(chalk.green("All permission rules have been reset."));
        return true;
      }

      if (permArgs.startsWith("reset ")) {
        // Reset a specific tool's permission: /permissions reset bash
        const toolName = permArgs.slice("reset ".length).trim();
        const currentPerms = { ...cfg.permissions };
        delete currentPerms[toolName];
        saveUserConfig({ permissions: currentPerms });
        resetPermissions();
        loadConfig();
        initPermissions(currentPerms);
        console.log(chalk.green(`Permission rule for "${toolName}" has been reset.`));
        return true;
      }

      // Default: show current rules
      const perms = cfg.permissions;
      const entries = Object.entries(perms);
      if (entries.length === 0) {
        console.log(chalk.dim("\nNo persistent permission rules."));
      } else {
        console.log(chalk.bold("\nPermission Rules:"));
        for (const [tool, action] of entries) {
          const color = action === "allow" ? chalk.green : action === "deny" ? chalk.red : chalk.yellow;
          console.log(`  ${tool}: ${color(action)}`);
        }
      }
      console.log(chalk.dim("\nUsage:"));
      console.log(chalk.dim("  /permissions              Show all rules"));
      console.log(chalk.dim("  /permissions reset        Reset all rules"));
      console.log(chalk.dim("  /permissions reset bash   Reset rule for specific tool"));
      return true;
    }

    case "/tasks": {
      console.log(chalk.bold("\nTasks:"));
      console.log(formatTaskList());
      return true;
    }

    case "/help":
      console.log(`
${chalk.bold("Commands:")}
  /compact      Compress conversation history
  /clear        Clear conversation history
  /cost         Show token usage
  /resume       Resume most recent session
  /sessions     List saved sessions
  /diff         Show git diff
  /status       Show git status
  /skills       List loaded skills
  /hooks        List loaded hooks
  /mcp          List MCP servers and tools
  /permissions  Show permission rules
  /tasks        List all tasks
  /exit         Exit
  /help         Show this help
${skills.length > 0 ? `\n${chalk.bold("Skills:")} ${skills.map((s) => "/" + s.name).join(", ")}` : ""}
`);
      return true;

    default:
      return false;
  }
}

function printBanner(engine: QueryEngine, skills: Skill[], context: LoadedContext, mcpToolCount: number = 0) {
  const cwd = process.cwd();
  let contextLine = "";
  if (context.files.length > 0) {
    const contextInfo = context.files.map((f) => {
      const shortPath = f.path.replace(cwd + "/", "").replace(os.homedir(), "~");
      return `${shortPath} (${f.source})`;
    }).join(", ");
    contextLine = `\n${chalk.dim(`Context: ${contextInfo}`)}`;
  }

  let mcpLine = "";
  if (mcpToolCount > 0) {
    const servers = getMcpServers();
    const mcpInfo = servers.map((s) => `${s.name}(${s.toolCount})`).join(", ");
    mcpLine = `\n${chalk.dim(`MCP: ${mcpInfo}`)}`;
  }

  console.log(`
${chalk.bold.blue("Mini Claude Code")} v${VERSION}
${chalk.dim(`Provider: ${engine.providerName} | Model: ${engine.modelName}`)}
${chalk.dim(`cwd: ${cwd}`)}${skills.length > 0 ? `\n${chalk.dim(`Skills: ${skills.map((s) => s.name).join(", ")}`)}` : ""}${mcpLine}${contextLine}
${chalk.dim("Type /help for commands, Ctrl+C to exit")}
`);
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
