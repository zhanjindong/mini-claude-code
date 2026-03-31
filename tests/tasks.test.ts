import { describe, it, expect, beforeEach } from "vitest";
import {
  createTask,
  getTask,
  updateTask,
  listTasks,
  clearTasks,
  formatTaskList,
} from "../src/tasks.js";
import { TaskCreateTool, TaskUpdateTool, TaskListTool } from "../src/tools/task.js";

// ─── tasks.ts core module ────────────────────────────────────────────────────

describe("createTask", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_return_task_with_correct_description_and_pending_status_when_created", () => {
    const task = createTask("write unit tests");

    expect(task.description).toBe("write unit tests");
    expect(task.status).toBe("pending");
    expect(task.id).toBeDefined();
    expect(task.createdAt).toBeDefined();
    expect(task.updatedAt).toBeDefined();
  });

  it("should_increment_id_when_multiple_tasks_are_created_consecutively", () => {
    const first = createTask("first task");
    const second = createTask("second task");
    const third = createTask("third task");

    expect(Number(second.id)).toBeGreaterThan(Number(first.id));
    expect(Number(third.id)).toBeGreaterThan(Number(second.id));
  });
});

describe("getTask", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_return_correct_task_when_given_valid_id", () => {
    const created = createTask("find me");

    const found = getTask(created.id);

    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.description).toBe("find me");
  });

  it("should_return_undefined_when_id_does_not_exist", () => {
    const result = getTask("999");

    expect(result).toBeUndefined();
  });
});

describe("updateTask", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_update_status_when_valid_id_and_new_status_provided", () => {
    const task = createTask("task to update");

    const updated = updateTask(task.id, { status: "in_progress" });

    expect(updated).toBeDefined();
    expect(updated!.status).toBe("in_progress");
  });

  it("should_return_undefined_when_id_does_not_exist", () => {
    const result = updateTask("999", { status: "completed" });

    expect(result).toBeUndefined();
  });
});

describe("listTasks", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_return_all_created_tasks_when_called", () => {
    createTask("alpha");
    createTask("beta");
    createTask("gamma");

    const all = listTasks();

    expect(all).toHaveLength(3);
    expect(all.map((t) => t.description)).toEqual(
      expect.arrayContaining(["alpha", "beta", "gamma"])
    );
  });
});

describe("clearTasks", () => {
  it("should_empty_task_store_and_reset_id_counter_when_called", () => {
    createTask("before clear");
    createTask("before clear 2");

    clearTasks();

    expect(listTasks()).toHaveLength(0);

    // ID counter should reset — next task gets id "1" again
    const fresh = createTask("after clear");
    expect(fresh.id).toBe("1");
  });
});

describe("formatTaskList", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_return_no_tasks_message_when_task_list_is_empty", () => {
    const result = formatTaskList();

    expect(result).toBe("No tasks.");
  });

  it("should_include_pending_icon_when_task_status_is_pending", () => {
    createTask("pending task");

    const result = formatTaskList();

    expect(result).toContain("○");
  });

  it("should_include_in_progress_icon_when_task_status_is_in_progress", () => {
    const task = createTask("active task");
    updateTask(task.id, { status: "in_progress" });

    const result = formatTaskList();

    expect(result).toContain("◐");
  });

  it("should_include_completed_icon_when_task_status_is_completed", () => {
    const task = createTask("done task");
    updateTask(task.id, { status: "completed" });

    const result = formatTaskList();

    expect(result).toContain("●");
  });

  it("should_include_failed_icon_when_task_status_is_failed", () => {
    const task = createTask("failed task");
    updateTask(task.id, { status: "failed" });

    const result = formatTaskList();

    expect(result).toContain("✗");
  });
});

// ─── tools/task.ts ───────────────────────────────────────────────────────────

describe("TaskCreateTool properties", () => {
  it("should_have_correct_name_when_inspected", () => {
    expect(TaskCreateTool.name).toBe("TaskCreate");
  });

  it("should_have_safe_permission_level_when_inspected", () => {
    expect(TaskCreateTool.permissionLevel).toBe("safe");
  });
});

describe("TaskCreateTool.execute", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_return_success_message_with_task_id_when_description_is_provided", async () => {
    const result = await TaskCreateTool.execute({ description: "deploy service" });

    expect(result).toContain("Task #");
    expect(result).toContain("deploy service");
  });

  it("should_return_error_message_when_description_is_empty_string", async () => {
    const result = await TaskCreateTool.execute({ description: "" });

    expect(result).toContain("Error");
    expect(result).toContain("description");
  });
});

describe("TaskUpdateTool.execute", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_return_updated_status_when_existing_task_id_and_new_status_provided", async () => {
    const task = createTask("task to update via tool");

    const result = await TaskUpdateTool.execute({ id: task.id, status: "completed" });

    expect(result).toContain(`Task #${task.id}`);
    expect(result).toContain("completed");
  });

  it("should_return_error_message_when_task_id_does_not_exist", async () => {
    const result = await TaskUpdateTool.execute({ id: "999", status: "completed" });

    expect(result).toContain("Error");
    expect(result).toContain("999");
  });
});

describe("TaskListTool.execute", () => {
  beforeEach(() => {
    clearTasks();
  });

  it("should_return_formatted_task_list_when_tasks_exist", async () => {
    createTask("list tool task one");
    createTask("list tool task two");

    const result = await TaskListTool.execute({});

    expect(result).toContain("list tool task one");
    expect(result).toContain("list tool task two");
  });

  it("should_return_no_tasks_message_when_task_store_is_empty", async () => {
    const result = await TaskListTool.execute({});

    expect(result).toBe("No tasks.");
  });
});
