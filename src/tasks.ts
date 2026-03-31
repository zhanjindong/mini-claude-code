// Task management module - session-level in-memory task tracking
// Allows LLM to create and manage task lists for multi-step operations

import chalk from "chalk";

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  result?: string;
}

// In-memory task store (session-scoped, not persisted)
const tasks: Map<string, Task> = new Map();
let nextId = 1;

export function createTask(description: string): Task {
  const id = String(nextId++);
  const now = new Date().toISOString();
  const task: Task = { id, description, status: "pending", createdAt: now, updatedAt: now };
  tasks.set(id, task);
  return task;
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

export function updateTask(id: string, update: { status?: TaskStatus; result?: string }): Task | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;
  if (update.status) task.status = update.status;
  if (update.result !== undefined) task.result = update.result;
  task.updatedAt = new Date().toISOString();
  return task;
}

export function listTasks(): Task[] {
  return Array.from(tasks.values());
}

export function clearTasks(): void {
  tasks.clear();
  nextId = 1;
}

export function formatTaskList(): string {
  const all = listTasks();
  if (all.length === 0) return "No tasks.";

  const statusIcon: Record<TaskStatus, string> = {
    pending: "○",
    in_progress: "◐",
    completed: "●",
    failed: "✗",
  };

  return all.map((t) => {
    const icon = statusIcon[t.status];
    return `${icon} [${t.id}] ${t.description} (${t.status})${t.result ? ` — ${t.result}` : ""}`;
  }).join("\n");
}
