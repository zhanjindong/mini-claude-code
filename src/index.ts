#!/usr/bin/env node

// Mini Claude Code - a minimal Claude Code-like CLI
// Supports: MiniMax, DeepSeek, OpenAI, OpenRouter, and any OpenAI-compatible API

import * as readline from "readline";
import chalk from "chalk";
import { QueryEngine, type EngineOptions } from "./engine.js";
import { initSkills } from "./tools/index.js";
import { executeSkill, type Skill } from "./skills.js";

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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue("\n❯ "),
  });

  rl.prompt();

  rl.on("line", async (line) => {
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
  try {
    for await (const chunk of engine.query(input)) {
      process.stdout.write(chunk);
    }
    process.stdout.write("\n");
  } catch (err: any) {
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
