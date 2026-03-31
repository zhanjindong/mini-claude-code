// Skills system - reusable instruction templates defined in Markdown + YAML frontmatter

import * as fs from "fs";
import * as path from "path";
import os from "os";

export interface Skill {
  name: string;
  description: string;
  whenToUse?: string;
  allowedTools?: string[];
  arguments?: string[];
  body: string;
  source: "project" | "user";
}

// Simple YAML frontmatter parser (no dependencies needed)
function parseFrontmatter(content: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function parseSkillFile(
  filePath: string,
  fallbackName: string,
  source: "project" | "user"
): Skill | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(content);
    if (!body) return null;

    return {
      name: meta.name || fallbackName,
      description: meta.description || "",
      whenToUse: meta.when_to_use,
      allowedTools: meta.allowed_tools
        ? meta.allowed_tools.split(",").map((s) => s.trim())
        : undefined,
      arguments: meta.arguments
        ? meta.arguments.split(",").map((s) => s.trim())
        : undefined,
      body,
      source,
    };
  } catch {
    return null;
  }
}

function scanSkillsDir(
  dir: string,
  source: "project" | "user"
): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  if (!fs.existsSync(dir)) return skills;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return skills;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillFile = path.join(dir, entry.name, "SKILL.md");
    const skill = parseSkillFile(skillFile, entry.name, source);
    if (skill) skills.set(skill.name, skill);
  }
  return skills;
}

export function loadSkills(cwd: string = process.cwd()): Skill[] {
  // User-level skills (lower priority)
  const userDir = path.join(os.homedir(), ".mini-claude-code", "skills");
  const userSkills = scanSkillsDir(userDir, "user");

  // Project-level skills (higher priority, overrides user-level)
  const projectDir = path.join(cwd, ".mini-claude-code", "skills");
  const projectSkills = scanSkillsDir(projectDir, "project");

  // Merge: project overrides user
  const merged = new Map(userSkills);
  for (const [name, skill] of projectSkills) {
    merged.set(name, skill);
  }

  return Array.from(merged.values());
}

export function substituteArgs(body: string, argDefs: string[] | undefined, argsStr?: string): string {
  if (!argDefs || argDefs.length === 0) return body;

  const values = argsStr ? argsStr.split(/\s+/) : [];
  let result = body;

  for (let i = 0; i < argDefs.length; i++) {
    const placeholder = new RegExp(`\\{\\{\\s*${argDefs[i]}\\s*\\}\\}`, "g");
    // Last argument consumes all remaining text
    const value =
      i === argDefs.length - 1
        ? values.slice(i).join(" ")
        : values[i] || "";
    result = result.replace(placeholder, value);
  }
  return result;
}

export function executeSkill(skill: Skill, argsStr?: string): string {
  return substituteArgs(skill.body, skill.arguments, argsStr);
}

export function getSkillsSummary(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const lines = skills.map((s) => {
    let line = `- ${s.name}`;
    if (s.description) line += `: ${s.description}`;
    if (s.whenToUse) line += ` (${s.whenToUse})`;
    return line;
  });

  return `\nAvailable Skills (use the Skill tool to invoke):
${lines.join("\n")}`;
}
