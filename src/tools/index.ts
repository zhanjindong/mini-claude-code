import type { ToolDefinition } from "../types.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BashTool } from "./bash.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { loadSkills, executeSkill, getSkillsSummary, type Skill } from "../skills.js";

// Tool registry
export const ALL_TOOLS: ToolDefinition[] = [
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
];

function createSkillTool(skills: Skill[]): ToolDefinition {
  return {
    name: "Skill",
    description:
      "Execute a skill (reusable instruction template). Use this when a task matches an available skill.",
    inputSchema: {
      type: "object",
      properties: {
        skill: { type: "string", description: "The skill name to execute" },
        args: { type: "string", description: "Optional arguments for the skill" },
      },
      required: ["skill"],
    },
    async execute(input) {
      const name = input.skill as string;
      const argsStr = input.args as string | undefined;
      const skill = skills.find(
        (s) => s.name.toLowerCase() === name.toLowerCase()
      );
      if (!skill) return `Error: Unknown skill '${name}'`;
      return executeSkill(skill, argsStr);
    },
  };
}

export function initSkills(): { skills: Skill[]; summary: string } {
  const skills = loadSkills();
  if (skills.length > 0) {
    ALL_TOOLS.push(createSkillTool(skills));
  }
  return { skills, summary: getSkillsSummary(skills) };
}

export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(
    (t) => t.name.toLowerCase() === name.toLowerCase()
  );
}

// Convert to OpenAI-compatible tool format
export function toOpenAITools(): ChatCompletionTool[] {
  return ALL_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}
