// Task management tools - TaskCreate, TaskList, TaskUpdate
// Allows the LLM to create and track multi-step task lists

import type { ToolDefinition } from "../types.js";
import { createTask, updateTask, formatTaskList, type TaskStatus } from "../tasks.js";

export const TaskCreateTool: ToolDefinition = {
  name: "TaskCreate",
  permissionLevel: "safe",
  description: "Create a new task to track progress on a multi-step operation. Returns the task ID.",
  inputSchema: {
    type: "object",
    properties: {
      description: { type: "string", description: "Description of the task" },
    },
    required: ["description"],
  },
  async execute(input) {
    const desc = input.description as string;
    if (!desc) return "Error: description is required";
    const task = createTask(desc);
    return `Task #${task.id} created: ${task.description}`;
  },
};

export const TaskUpdateTool: ToolDefinition = {
  name: "TaskUpdate",
  permissionLevel: "safe",
  description: "Update a task's status or result. Use to mark tasks as in_progress, completed, or failed.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task ID to update" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "failed"],
        description: "New status",
      },
      result: { type: "string", description: "Optional result or notes" },
    },
    required: ["id"],
  },
  async execute(input) {
    const id = input.id as string;
    const status = input.status as TaskStatus | undefined;
    const result = input.result as string | undefined;

    const task = updateTask(id, { status, result });
    if (!task) return `Error: Task #${id} not found`;
    return `Task #${task.id} updated: ${task.status}${task.result ? ` — ${task.result}` : ""}`;
  },
};

export const TaskListTool: ToolDefinition = {
  name: "TaskList",
  permissionLevel: "safe",
  description: "List all tasks and their current status.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  async execute() {
    return formatTaskList();
  },
};
