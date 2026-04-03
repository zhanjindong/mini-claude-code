#!/usr/bin/env node

// Mini Claude Code - a minimal Claude Code-like CLI
// Supports: MiniMax, DeepSeek, OpenAI, OpenRouter, and any OpenAI-compatible API

import * as readline from "readline";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import chalk from "chalk";
import { QueryEngine, PROVIDERS, type EngineOptions } from "./engine.js";
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

/**
 * Read a single keypress in raw mode, temporarily suspending other stdin listeners.
 * Returns the raw character string.
 */
function readKeypress(): Promise<string> {
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    const savedData = process.stdin.rawListeners("data");
    const savedKeypress = process.stdin.rawListeners("keypress");
    process.stdin.removeAllListeners("data");
    process.stdin.removeAllListeners("keypress");

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (buf: Buffer) => {
      process.stdin.setRawMode(wasRaw ?? false);
      for (const fn of savedData) process.stdin.on("data", fn as (...args: any[]) => void);
      for (const fn of savedKeypress) process.stdin.on("keypress", fn as (...args: any[]) => void);
      resolve(buf.toString());
    });
  });
}

/**
 * Read a line of text from the user via a temporary readline question.
 * Hides input if `hidden` is true (for API keys).
 */
function readLine(rl: readline.Interface, prompt: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    // Pause the main readline so we can control input
    const savedData = process.stdin.rawListeners("data");
    const savedKeypress = process.stdin.rawListeners("keypress");
    process.stdin.removeAllListeners("data");
    process.stdin.removeAllListeners("keypress");

    if (hidden) {
      // Manual hidden input: read raw chars, echo *, handle backspace/enter
      process.stdout.write(prompt);
      let buf = "";
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onData = (data: Buffer) => {
        const ch = data.toString();
        if (ch === "\r" || ch === "\n") {
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw ?? false);
          for (const fn of savedData) process.stdin.on("data", fn as (...args: any[]) => void);
          for (const fn of savedKeypress) process.stdin.on("keypress", fn as (...args: any[]) => void);
          process.stdout.write("\n");
          resolve(buf);
        } else if (ch === "\x03") {
          // Ctrl+C
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(wasRaw ?? false);
          for (const fn of savedData) process.stdin.on("data", fn as (...args: any[]) => void);
          for (const fn of savedKeypress) process.stdin.on("keypress", fn as (...args: any[]) => void);
          process.stdout.write("\n");
          resolve("");
        } else if (ch === "\x7f" || ch === "\b") {
          // Backspace
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          buf += ch;
          process.stdout.write("*");
        }
      };
      process.stdin.on("data", onData);
    } else {
      // Normal visible input
      const tmpRl = readline.createInterface({ input: process.stdin, output: process.stdout });
      tmpRl.question(prompt, (answer) => {
        tmpRl.close();
        for (const fn of savedData) process.stdin.on("data", fn as (...args: any[]) => void);
        for (const fn of savedKeypress) process.stdin.on("keypress", fn as (...args: any[]) => void);
        resolve(answer.trim());
      });
    }
  });
}

/**
 * Interactive /login flow: select provider, enter API key, save config, reconfigure engine.
 */
async function handleLogin(rl: readline.Interface, engine: QueryEngine): Promise<void> {
  const providerNames = Object.keys(PROVIDERS);

  console.log(chalk.bold("\nSelect Provider:"));
  providerNames.forEach((name, i) => {
    const p = PROVIDERS[name];
    const current = name === engine.providerName ? chalk.green(" (current)") : "";
    console.log(`  ${chalk.cyan(String(i + 1))}. ${chalk.bold(name)}${current} ${chalk.dim(`— ${p.defaultModel}`)}`);
  });
  console.log(`  ${chalk.cyan("0")}. ${chalk.dim("Cancel")}`);
  process.stdout.write(chalk.dim("\nEnter number: "));

  const key = await readKeypress();
  process.stdout.write(key + "\n");

  // Ctrl+C or 0 to cancel
  if (key === "\x03" || key === "0") {
    console.log(chalk.dim("Cancelled."));
    return;
  }

  const idx = parseInt(key, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= providerNames.length) {
    console.log(chalk.yellow("Invalid selection."));
    return;
  }

  const selectedProvider = providerNames[idx];
  const apiKey = await readLine(rl, chalk.dim("API Key: "), true);

  if (!apiKey) {
    console.log(chalk.dim("Cancelled."));
    return;
  }

  // Reconfigure engine
  engine.reconfigure({ provider: selectedProvider, apiKey });

  // Save to user config
  saveUserConfig({ provider: selectedProvider, apiKey });

  // Update cached config
  const config = getConfig();
  config.provider = selectedProvider;
  config.apiKey = apiKey;

  console.log(chalk.green(`\nLogged in: ${chalk.bold(selectedProvider)} (${engine.modelName})`));
}

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
  --api-key <key>       API key (or set via MCC_API_KEY env var)
  --resume              Resume most recent session for current directory
  -p, --prompt <text>   Run a single prompt and exit
  -h, --help            Show this help

${chalk.bold("Environment Variables:")}
  MCC_API_KEY           API key for the chosen provider
  OPENAI_API_KEY        Fallback API key (OpenAI compatible)

${chalk.bold("Provider Examples:")}
  # MiniMax (default)
  MCC_API_KEY=your-minimax-key npx tsx src/index.ts

  # DeepSeek
  MCC_API_KEY=your-key npx tsx src/index.ts --provider deepseek

  # OpenAI
  MCC_API_KEY=your-key npx tsx src/index.ts --provider openai

  # Custom provider
  MCC_API_KEY=your-key npx tsx src/index.ts --base-url https://your-api.com/v1 --model your-model

  # Or use /login after startup to configure interactively

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
  /model      Switch model at runtime
  /login      Switch provider and API key
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
    if (oneShot) {
      console.error(chalk.red("Error: API key is required."));
      console.error(chalk.dim("Set via: export MCC_API_KEY=your-key-here"));
      console.error(chalk.dim("Or use:  --api-key your-key-here"));
      process.exit(1);
    }
    console.log(chalk.yellow("No API key configured."));
    console.log(chalk.dim("Run /login to select a provider and enter your API key."));
    console.log(chalk.dim("Or set via: export MCC_API_KEY=your-key-here\n"));
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

  // Load input history from file
  const historyDir = join(os.homedir(), ".claude");
  const historyFile = join(historyDir, "history");
  let inputHistory: string[] = [];
  try {
    if (existsSync(historyFile)) {
      inputHistory = readFileSync(historyFile, "utf-8").trim().split("\n").filter(Boolean).reverse();
    }
  } catch { /* ignore */ }

  function appendHistory(line: string) {
    if (!line.trim()) return;
    try {
      if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });
      writeFileSync(historyFile, line + "\n", { flag: "a" });
    } catch { /* ignore */ }
  }

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
    { cmd: "/model", desc: "Switch model at runtime" },
    { cmd: "/login", desc: "Switch provider and API key" },
    { cmd: "/queue", desc: "Show queued inputs" },
    { cmd: "/exit", desc: "Exit" },
    ...skills.map((s) => ({ cmd: "/" + s.name, desc: s.description || "" })),
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n" + chalk.blue("\u276f "),
    terminal: true,
    history: inputHistory,
    historySize: 500,
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
  let menuScroll = 0; // first visible index in scroll window
  let menuLines = 0; // number of rendered menu lines on screen
  let lastFilterPrefix = "";

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
    // Adjust scroll window so menuIdx is always visible
    if (menuFiltered.length > maxShow) {
      if (menuIdx >= menuScroll + maxShow) {
        menuScroll = menuIdx - maxShow + 1;
      }
      if (menuIdx < menuScroll) {
        menuScroll = menuIdx;
      }
      menuScroll = Math.max(0, Math.min(menuScroll, menuFiltered.length - maxShow));
    } else {
      menuScroll = 0;
    }
    const scrollEnd = menuScroll + maxShow;
    const totalLines = maxShow + (menuFiltered.length > maxShow ? 1 : 0);
    // Save cursor BEFORE making scroll room (\n resets column to 0)
    process.stdout.write("\x1b7"); // save cursor at input position (row + column)
    process.stdout.write("\n".repeat(totalLines)); // ensure scroll room
    process.stdout.write("\x1b8"); // restore to original position (correct column)
    process.stdout.write("\x1b7"); // re-save for final restore after drawing
    const cols = process.stdout.columns || 80;
    for (let i = menuScroll; i < scrollEnd; i++) {
      const { cmd, desc } = menuFiltered[i];
      process.stdout.write("\n\x1b[2K");
      if (i === menuIdx) {
        // ` [inv] cmd [/inv] desc` — visible prefix length: 1 + 1 + cmd + 1 + 1 + 1
        const prefixLen = cmd.length + 5;
        const maxDesc = Math.max(0, cols - prefixLen);
        const d = desc.length > maxDesc ? desc.slice(0, maxDesc - 1) + "…" : desc;
        process.stdout.write(` \x1b[7m ${cmd} \x1b[27m \x1b[90m${d}\x1b[39m`);
      } else {
        // `  cmd  desc` — visible prefix length: 2 + cmd + 2
        const prefixLen = cmd.length + 4;
        const maxDesc = Math.max(0, cols - prefixLen);
        const d = desc.length > maxDesc ? desc.slice(0, maxDesc - 1) + "…" : desc;
        process.stdout.write(`  \x1b[90m${cmd}  ${d}\x1b[39m`);
      }
    }
    if (menuFiltered.length > maxShow) {
      const above = menuScroll;
      const below = menuFiltered.length - scrollEnd;
      const hint = above > 0 && below > 0 ? `↑${above} ↓${below}` : above > 0 ? `↑${above}` : `↓${below}`;
      process.stdout.write(`\n\x1b[2K \x1b[90m… ${hint} more\x1b[39m`);
    }
    menuLines = totalLines;
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
    if (prefix !== lastFilterPrefix) {
      menuIdx = 0;
      menuScroll = 0;
      lastFilterPrefix = prefix;
    } else {
      menuIdx = Math.min(menuIdx, Math.max(0, menuFiltered.length - 1));
    }
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
      // A real paste: multi-byte chunk containing newline characters or bracketed paste
      if (str.length > 1 && (/[\n\r]/.test(str) || str.includes("\x1b[200~"))) {
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

    const isHistoryNav = menuFiltered.length === 0 && key && (key.name === "up" || key.name === "down");
    origTtyWrite(s, key);
    if (!isHistoryNav) {
      setImmediate(() => updateMenu());
    }
  };

  rl.prompt();

  let busy = false;
  const inputQueue: string[] = [];

  // Immediate commands: execute even when busy (sync, no API call)
  const IMMEDIATE_COMMANDS = new Set([
    "/help", "/clear", "/cost", "/exit", "/quit",
    "/status", "/diff", "/skills", "/hooks", "/mcp",
    "/permissions", "/tasks", "/model", "/sessions", "/resume", "/queue",
  ]);

  function drainQueue() {
    try {
      if (inputQueue.length > 0) {
        const next = inputQueue.shift()!;
        const remaining = inputQueue.length;
        writeAbove(rl,
          chalk.cyan(`▸ Executing queued input`) +
            (remaining > 0 ? chalk.dim(` (${remaining} more pending)`) : "")
        );
        processInput(next).catch((err) => {
          try {
            writeAbove(rl, chalk.red(`Queue error: ${err.message}`));
          } catch { /* prevent unhandled rejection from writeAbove inside catch */ }
          busy = false;
          drainQueue();
        });
      } else {
        rl.setPrompt(IDLE_PROMPT);
        rl.prompt();
      }
    } catch (err: any) {
      console.error(chalk.red(`\nQueue drain error: ${err.message}`));
      busy = false;
      rl.setPrompt(IDLE_PROMPT);
      rl.prompt();
    }
  }

  async function processInput(line: string) {
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

    if (!input) {
      rl.prompt();
      return;
    }

    // Re-render user input with highlighted background (full-width, like Claude Code)
    // Keep bg color ON through \x1b[K and \n so the terminal associates the
    // background with the entire line — enables correct reflow on resize.
    {
      const inputLines = input.split("\n");
      readline.moveCursor(process.stdout, 0, -1);
      process.stdout.write("\r\x1b[K");
      const BG = "\x1b[100m"; // bright black (gray) background
      process.stdout.write(BG + "\u276f " + inputLines[0] + "\x1b[K\n");
      for (let i = 1; i < inputLines.length; i++) {
        process.stdout.write("  " + inputLines[i] + "\x1b[K\n");
      }
      process.stdout.write("\x1b[0m"); // reset all attributes after input block
    }

    // Save to persistent history
    appendHistory(input);

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
        drainQueue();
        return;
      }

      // Interactive login: select provider and enter API key
      if (input === "/login") {
        await handleLogin(rl, engine);
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
      if (handleBuiltinCommand(input, engine, rl, skills, persistSession, inputQueue)) {
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
        await runQuery(engine, expanded, rl, inputQueue);
        persistSession();
        busy = false;
        drainQueue();
        return;
      }

      console.log(chalk.yellow(`Unknown command: ${input}. Type /help for help.`));
      rl.prompt();
      return;
    }

    if (!getConfig().apiKey) {
      console.log(chalk.yellow("No API key configured. Run /login first."));
      rl.prompt();
      return;
    }

    busy = true;
    await runQuery(engine, input, rl, inputQueue);
    persistSession();
    busy = false;
    drainQueue();
  }

  rl.on("line", async (line) => {
    try {
      // Menu may have left rendered lines — ensure cleanup
      clearMenu();
      menuFiltered = [];

      const trimmed = line.trim();
      if (!trimmed) {
        if (!busy) rl.prompt();
        return;
      }

      if (!busy) {
        await processInput(line);
        return;
      }

      // === Busy: classify input ===

      if (trimmed.startsWith("/")) {
        const cmdWord = trimmed.split(/\s+/)[0].toLowerCase();

        // Immediate commands: execute right away
        if (IMMEDIATE_COMMANDS.has(cmdWord)) {
          if (cmdWord === "/clear" && inputQueue.length > 0) {
            writeAbove(rl, chalk.dim(`Cleared ${inputQueue.length} queued input(s).`));
            inputQueue.length = 0;
          }
          handleBuiltinCommand(trimmed, engine, rl, skills, persistSession, inputQueue);
          return;
        }

        // Slash commands / skills: queue for later
        inputQueue.push(line);
        writeAbove(rl, chalk.dim(`  ⎿ Queued (${inputQueue.length} pending)`));
        return;
      }

      // Plain text while busy: inject into current conversation
      appendHistory(trimmed);
      engine.injectUserMessage(trimmed);
      writeAbove(rl, chalk.dim(`  ⎿ Injected into current conversation`));
    } catch (err: any) {
      console.error(chalk.red(`\nUnexpected error: ${err.message}`));
      busy = false;
      rl.prompt();
    }
  });

  rl.on("close", () => {
    persistSession();
    console.log(chalk.dim("\n[exit:close] Goodbye!"));
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    // Ctrl+C: if line has content, clear it; if busy, just let abort handle it; otherwise exit
    if ((rl as any).line) {
      (rl as any).line = "";
      (rl as any).cursor = 0;
      clearMenu();
      menuFiltered = [];
      if (inputQueue.length > 0) {
        console.log(chalk.dim(`Cleared ${inputQueue.length} queued input(s).`));
        inputQueue.length = 0;
      }
      process.stdout.write("\n");
      rl.prompt();
    } else if (busy) {
      // During a query, abort is already handled by the keypress handler in runQuery.
      // Don't exit — just let the query finish aborting and return to REPL.
    } else {
      persistSession();
      console.log(chalk.dim("\n[exit:sigint] Goodbye!"));
      process.exit(0);
    }
  });
}

// Thinking spinner — animated indicator while waiting for model response
const SPINNER_FRAMES = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];
const IDLE_PROMPT = "\n" + chalk.blue("\u276f "); // ❯

/**
 * Write content above the readline prompt.
 * Clears the current prompt line, writes output, then redraws prompt + user input.
 */
function writeAbove(rl: readline.Interface, text: string) {
  const rli = rl as any;
  // Move up to start of prompt area (handles multi-line prompts like spinner)
  const prevRows = rli.prevRows || 0;
  if (prevRows > 0) {
    readline.moveCursor(process.stdout, 0, -prevRows);
  }
  // Clear from prompt start to end of screen
  process.stdout.write("\r\x1b[J");
  // Write content
  process.stdout.write(text);
  // Ensure trailing newline so prompt appears on a fresh line
  if (text.length > 0 && !text.endsWith("\n")) {
    process.stdout.write("\n");
  }
  // Reset prevRows so _refreshLine draws from current cursor position
  rli.prevRows = 0;
  // Redraw prompt + current user input
  rli._refreshLine();
}

/** Fallback spinner for one-shot mode (no readline) — writes directly to stdout */
function createFallbackSpinner() {
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
      process.stdout.write("\x1b[1D \x1b[1D");
    },
  };
}

function createSpinner(rl: readline.Interface) {
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function updatePrompt() {
    rl.setPrompt("  " + chalk.cyan(SPINNER_FRAMES[frame]) + "\n" + chalk.blue("\u276f "));
    (rl as any)._refreshLine();
  }

  return {
    start() {
      if (timer) return;
      frame = 0;
      updatePrompt();
      timer = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        updatePrompt();
      }, 80);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

async function runQuery(engine: QueryEngine, input: string, rl?: readline.Interface, inputQueue?: string[]) {
  let textBuffer = "";
  // In one-shot mode (no rl), write directly to stdout; in REPL mode, write above readline
  const write = rl
    ? (text: string) => writeAbove(rl, text)
    : (text: string) => {
        process.stdout.write(text);
        if (text.length > 0 && !text.endsWith("\n")) process.stdout.write("\n");
      };
  const spinner = rl ? createSpinner(rl) : createFallbackSpinner();
  const abortController = new AbortController();

  // Listen for Escape or Ctrl+C to abort
  let escapeTimer: ReturnType<typeof setTimeout> | null = null;

  const doAbort = () => {
    abortController.abort();
    if (inputQueue && inputQueue.length > 0) {
      write(chalk.dim(`  Cleared ${inputQueue.length} queued input(s).`));
      inputQueue.length = 0;
    }
  };

  const onKeypress = (_str: string, key: any) => {
    // Ctrl+C: immediate abort
    if (key?.ctrl && key?.name === "c") {
      if (escapeTimer) { clearTimeout(escapeTimer); escapeTimer = null; }
      doAbort();
      return;
    }
    // Standalone Escape: debounce 50ms to avoid IME escape sequences
    if (key?.name === "escape" && key?.sequence === "\x1b") {
      if (escapeTimer) clearTimeout(escapeTimer);
      escapeTimer = setTimeout(() => { escapeTimer = null; doAbort(); }, 50);
      return;
    }
    // Any other keypress within 50ms cancels Escape (IME sequence)
    if (escapeTimer) { clearTimeout(escapeTimer); escapeTimer = null; }
  };
  process.stdin.on("keypress", onKeypress);

  function flushText(final = false) {
    if (!textBuffer) return;

    let toRender = textBuffer;
    let remainder = "";

    if (!final) {
      // When flushing mid-stream (before tool output), avoid splitting
      // incomplete markdown across renders. Find the last complete paragraph
      // boundary (double newline) and keep the rest for the next flush.
      const lastParagraph = toRender.lastIndexOf("\n\n");
      if (lastParagraph > 0) {
        remainder = toRender.slice(lastParagraph + 2);
        toRender = toRender.slice(0, lastParagraph);
      }
    }

    const rendered = renderMarkdown(toRender.trim()).replace(/\n{3,}/g, "\n\n").trimEnd();
    write(rendered);
    textBuffer = remainder;
  }

  function cleanup() {
    spinner.stop();
    if (escapeTimer) { clearTimeout(escapeTimer); escapeTimer = null; }
    process.stdin.removeListener("keypress", onKeypress);
    // Restore idle prompt
    if (rl) rl.setPrompt(IDLE_PROMPT);
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
        write(chunk.content.replace(/\n$/, "")); // tool output (strip trailing newline, write adds one)
        // Restart spinner while waiting for next API response after tool execution
        spinner.start();
      }
    }
    cleanup();
    flushText(true);
    if (abortController.signal.aborted) {
      write(chalk.dim("(interrupted)"));
    }
  } catch (err: any) {
    cleanup();
    flushText(true);
    if (abortController.signal.aborted) {
      write(chalk.dim("(interrupted)"));
    } else if (err.status === 401) {
      write(chalk.red("Authentication failed. Check your API key."));
    } else if (err.status === 429) {
      write(chalk.red("Rate limited. Please wait and try again."));
    } else {
      write(chalk.red(`Error: ${err.message}`));
    }
  }
}

function handleBuiltinCommand(
  input: string,
  engine: QueryEngine,
  rl: readline.Interface,
  skills: Skill[],
  persistSession: () => void,
  inputQueue?: string[]
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
      if (inputQueue && inputQueue.length > 0) {
        console.log(chalk.dim(`Cleared ${inputQueue.length} queued input(s).`));
        inputQueue.length = 0;
      }
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
          const cols = process.stdout.columns || 80;
          const prefixLen = `  /${s.name} [${s.source}] `.length;
          const maxDesc = Math.max(20, cols - prefixLen - 4);
          const rawDesc = s.description || "";
          const desc = rawDesc.length > maxDesc ? rawDesc.slice(0, maxDesc - 1) + "…" : rawDesc;
          console.log(`  /${s.name} ${src} ${desc}`);
        }
      }
      console.log(
        chalk.dim(
          `\nSkill directories:\n  Project: .claude/skills/\n  User:    ~/.claude/skills/\n  Commands: .claude/commands/\n  Agents:   .claude/agents/`
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
          `\nHook config files:\n  Project: .claude/hooks.json\n  User:    ~/.claude/hooks.json\n  Settings: .claude/settings.json`
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
          `\nMCP config files:\n  Project: .claude/mcp.json\n  User:    ~/.claude/mcp.json`
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

    case "/model": {
      const modelArg = input.slice("/model".length).trim();
      if (!modelArg) {
        console.log(chalk.bold(`\nCurrent model: ${engine.modelName}`));
        console.log(chalk.dim("Usage: /model <model-name>"));
        console.log(chalk.dim("Example: /model gpt-4o-mini"));
      } else {
        engine.setModel(modelArg);
        console.log(chalk.green(`Model switched to: ${modelArg}`));
      }
      return true;
    }

    case "/queue":
      if (!inputQueue || inputQueue.length === 0) {
        console.log(chalk.dim("Queue is empty."));
      } else {
        console.log(chalk.bold(`\nQueued inputs (${inputQueue.length}):`));
        for (let i = 0; i < inputQueue.length; i++) {
          const preview = inputQueue[i].trim().slice(0, 60);
          console.log(`  ${i + 1}. ${preview}${inputQueue[i].trim().length > 60 ? "…" : ""}`);
        }
        console.log(chalk.dim("\nEscape/Ctrl+C during execution to clear."));
      }
      return true;

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
  /model        Switch model at runtime
  /login        Switch provider and API key
  /queue        Show queued inputs
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
${chalk.dim(`cwd: ${cwd}`)}${skills.length > 0 ? `\n${chalk.dim(`Skills: ${skills.length} loaded (type /skills to list)`)}` : ""}${mcpLine}${contextLine}
${chalk.dim("Type /help for commands, Ctrl+C to exit")}
`);
}

// Prevent silent process crash from unhandled errors
process.on("unhandledRejection", (reason: any) => {
  console.error(chalk.red(`\nUnhandled rejection: ${reason?.message || reason}`));
});
process.on("uncaughtException", (err: Error) => {
  console.error(chalk.red(`\nUncaught exception: ${err.message}`));
  // Don't exit — allow the REPL to continue
});

main().catch((err) => {
  console.error(chalk.red(`[exit:fatal] Fatal: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
