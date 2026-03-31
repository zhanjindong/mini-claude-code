#!/usr/bin/env node

// Mini Claude Code - a minimal Claude Code-like CLI
// Supports: MiniMax, DeepSeek, OpenAI, OpenRouter, and any OpenAI-compatible API

import * as readline from "readline";
import chalk from "chalk";
import { QueryEngine, type EngineOptions } from "./engine.js";
import { initSkills } from "./tools/index.js";
import { executeSkill, type Skill } from "./skills.js";
import { renderMarkdown } from "./markdown.js";

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
  /clear    Clear conversation history
  /cost     Show token usage
  /help     Show help
  /exit     Exit
`);
    process.exit(0);
  }

  // Parse arguments
  const options: EngineOptions = {};
  let oneShot: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--provider" && args[i + 1]) {
      options.provider = args[++i];
    } else if ((arg === "--model" || arg === "-m") && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === "--base-url" && args[i + 1]) {
      options.baseURL = args[++i];
    } else if (arg === "--api-key" && args[i + 1]) {
      options.apiKey = args[++i];
    } else if ((arg === "-p" || arg === "--prompt") && args[i + 1]) {
      oneShot = args[++i];
    } else if (!arg.startsWith("-")) {
      oneShot = args.slice(i).join(" ");
      break;
    }
  }

  // Check API key
  const apiKey = options.apiKey || process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(chalk.red("Error: API key is required."));
    console.error(chalk.dim("Set via: export API_KEY=your-key-here"));
    console.error(chalk.dim("Or use:  --api-key your-key-here"));
    process.exit(1);
  }
  options.apiKey = apiKey;

  // Initialize skills
  const { skills, summary: skillsSummary } = initSkills();
  if (skills.length > 0) {
    options.skillsSummary = skillsSummary;
  }

  const engine = new QueryEngine(options);

  // One-shot mode
  if (oneShot) {
    await runQuery(engine, oneShot);
    process.exit(0);
  }

  // REPL mode
  printBanner(engine, skills);

  // Command menu items with descriptions
  const cmdEntries: { cmd: string; desc: string }[] = [
    { cmd: "/help", desc: "Show help" },
    { cmd: "/clear", desc: "Clear conversation history" },
    { cmd: "/cost", desc: "Show token usage" },
    { cmd: "/skills", desc: "List loaded skills" },
    { cmd: "/exit", desc: "Exit" },
    ...skills.map((s) => ({ cmd: "/" + s.name, desc: s.description || "" })),
  ];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue("\n❯ "),
    terminal: true,
  });

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
    // Ensure scroll room so save/restore cursor stays correct
    process.stdout.write("\n".repeat(maxShow));
    process.stdout.write(`\x1b[${maxShow}A`);

    process.stdout.write("\x1b7"); // save cursor
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
      process.stdout.write(`\n\x1b[2K  \x1b[90m… +${menuFiltered.length - maxShow} more\x1b[39m`);
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
        acceptSelection();
        // Fall through so readline emits "line" event
      }
    }

    origTtyWrite(s, key);
    setImmediate(() => updateMenu());
  };

  rl.prompt();

  rl.on("line", async (line) => {
    // Menu may have left rendered lines — ensure cleanup
    clearMenu();
    menuFiltered = [];

    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith("/")) {
      // Built-in commands (sync, no API call)
      if (handleBuiltinCommand(input, engine, rl, skills)) {
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
        console.log(chalk.cyan(`\n> /${skill.name}`) + (argsStr ? chalk.dim(` ${argsStr}`) : ""));
        rl.pause();
        await runQuery(engine, expanded);
        rl.resume();
        rl.prompt();
        return;
      }

      console.log(chalk.yellow(`Unknown command: ${input}. Type /help for help.`));
      rl.prompt();
      return;
    }

    rl.pause();
    await runQuery(engine, input);
    rl.resume();
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(chalk.dim("\nGoodbye!"));
    process.exit(0);
  });
}

async function runQuery(engine: QueryEngine, input: string) {
  process.stdout.write("\n");
  let textBuffer = "";

  function flushText() {
    if (!textBuffer) return;
    process.stdout.write(renderMarkdown(textBuffer));
    textBuffer = "";
  }

  try {
    for await (const chunk of engine.query(input)) {
      if (chunk.type === "text") {
        textBuffer += chunk.content;
      } else {
        // Flush buffered text as markdown before showing tool output
        flushText();
        process.stdout.write(chunk.content);
      }
    }
    flushText();
  } catch (err: any) {
    flushText();
    if (err.status === 401) {
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
  skills: Skill[]
): boolean {
  const cmd = input.split(/\s+/)[0].toLowerCase();

  switch (cmd) {
    case "/exit":
    case "/quit":
      rl.close();
      return true;

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

    case "/help":
      console.log(`
${chalk.bold("Commands:")}
  /clear    Clear conversation history
  /cost     Show token usage
  /skills   List loaded skills
  /exit     Exit
  /help     Show this help
${skills.length > 0 ? `\n${chalk.bold("Skills:")} ${skills.map((s) => "/" + s.name).join(", ")}` : ""}
`);
      return true;

    default:
      return false;
  }
}

function printBanner(engine: QueryEngine, skills: Skill[]) {
  console.log(`
${chalk.bold.blue("Mini Claude Code")} v${VERSION}
${chalk.dim(`Provider: ${engine.providerName} | Model: ${engine.modelName}`)}
${chalk.dim(`cwd: ${process.cwd()}`)}${skills.length > 0 ? `\n${chalk.dim(`Skills: ${skills.map((s) => s.name).join(", ")}`)}` : ""}
${chalk.dim("Type /help for commands, Ctrl+C to exit")}
`);
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
