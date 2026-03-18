import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Project } from "@iara/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;

// In-memory stores
let tasksStore: Array<{
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description: string;
  branch: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}> = [];

let mockProject: Project | null = null;

let lastFilteredResult: unknown = undefined;
let lastFilteredResults: unknown[] = [];
let lastUpdateTargetId: string = "";
let lastDeleteTargetId: string = "";

const mockSchema = {
  tasks: { id: "tasks.id", projectId: "tasks.projectId" } as unknown,
};

function makeMockDb() {
  return {
    select: () => ({
      from: (table: unknown) => ({
        all: () => {
          if (table === mockSchema.tasks) return [...tasksStore];
          return [];
        },
        where: (_predicate: unknown) => ({
          get: () => {
            return (lastFilteredResult as unknown) ?? undefined;
          },
          all: () => {
            return lastFilteredResults ?? [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Record<string, unknown>) => ({
        run: () => {
          if (table === mockSchema.tasks) {
            tasksStore.push(row as (typeof tasksStore)[0]);
          }
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (updates: Record<string, unknown>) => ({
        where: (_predicate: unknown) => ({
          run: () => {
            if (table === mockSchema.tasks) {
              const id = lastUpdateTargetId;
              const idx = tasksStore.findIndex((t) => t.id === id);
              if (idx >= 0) {
                tasksStore[idx] = { ...tasksStore[idx]!, ...updates } as (typeof tasksStore)[0];
              }
            }
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: (_predicate: unknown) => ({
        run: () => {
          if (table === mockSchema.tasks) {
            const id = lastDeleteTargetId;
            tasksStore = tasksStore.filter((t) => t.id !== id);
          }
        },
      }),
    }),
  };
}

vi.mock("./config.js", () => ({
  getProjectsDir: () => tmpDir,
}));

vi.mock("@iara/shared/git", () => ({
  gitClone: vi.fn().mockResolvedValue(undefined),
  gitWorktreeAdd: vi.fn().mockResolvedValue(undefined),
  gitWorktreeRemove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: string) => {
    lastUpdateTargetId = value;
    lastDeleteTargetId = value;

    if (column === (mockSchema.tasks as Record<string, unknown>).id) {
      lastFilteredResult = tasksStore.find((t) => t.id === value) ?? undefined;
      lastFilteredResults = tasksStore.filter((t) => t.id === value);
    } else if (column === (mockSchema.tasks as Record<string, unknown>).projectId) {
      lastFilteredResult = tasksStore.find((t) => t.projectId === value) ?? undefined;
      lastFilteredResults = tasksStore.filter((t) => t.projectId === value);
    }

    return { column, value };
  },
}));

vi.mock("../db.js", () => ({
  db: makeMockDb(),
  schema: mockSchema,
}));

vi.mock("./projects.js", () => ({
  getProject: (_id: string) => mockProject,
  getProjectDir: (slug: string) => path.join(tmpDir, slug),
}));

const { createTask, completeTask, deleteTask, listTasks, getTask } = await import("./tasks.js");
const { gitWorktreeAdd, gitWorktreeRemove } = await import("@iara/shared/git");

function setupProject(slug: string = "test-proj"): Project {
  const now = new Date().toISOString();
  const projectId = "proj-" + Math.random().toString(36).slice(2, 10);

  const project: Project = {
    id: projectId,
    slug,
    name: "Test Project",
    repoSources: [],
    createdAt: now,
    updatedAt: now,
  };

  // Set up directory structure
  const projectDir = path.join(tmpDir, slug);
  fs.mkdirSync(path.join(projectDir, ".repos"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "PROJECT.md"), `# Test Project\n`);

  mockProject = project;
  return project;
}

describe("tasks service", () => {
  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "iara-task-test-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    tasksStore = [];
    mockProject = null;
    lastFilteredResult = undefined;
    lastFilteredResults = [];
    lastUpdateTargetId = "";
    lastDeleteTargetId = "";
    vi.clearAllMocks();
  });

  describe("createTask", () => {
    it("creates task dir with TASK.md", async () => {
      const project = setupProject("task-md-proj");

      const task = await createTask(project.id, {
        slug: "my-task",
        name: "My Task",
        description: "Some description",
      });

      const taskDir = path.join(tmpDir, "task-md-proj", "my-task");
      expect(fs.existsSync(taskDir)).toBe(true);

      const taskMd = fs.readFileSync(path.join(taskDir, "TASK.md"), "utf-8");
      expect(taskMd).toContain("# My Task");
      expect(taskMd).toContain("Some description");

      expect(task.slug).toBe("my-task");
      expect(task.name).toBe("My Task");
      expect(task.branch).toBe("feat/my-task");
      expect(task.status).toBe("active");
    });

    it("symlinks PROJECT.md from project dir", async () => {
      const project = setupProject("symlink-proj");

      await createTask(project.id, {
        slug: "sym-task",
        name: "Symlink Task",
      });

      const symlinkPath = path.join(tmpDir, "symlink-proj", "sym-task", "PROJECT.md");
      expect(fs.existsSync(symlinkPath)).toBe(true);
      expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
    });

    it("calls gitWorktreeAdd for each repo in .repos/", async () => {
      const project = setupProject("wt-proj");
      // Create fake repo dirs in .repos/
      const reposDir = path.join(tmpDir, "wt-proj", ".repos");
      fs.mkdirSync(path.join(reposDir, "repo-a"), { recursive: true });
      fs.mkdirSync(path.join(reposDir, "repo-b"), { recursive: true });

      await createTask(project.id, {
        slug: "wt-task",
        name: "Worktree Task",
        branch: "feat/custom-branch",
      });

      expect(gitWorktreeAdd).toHaveBeenCalledTimes(2);
      expect(gitWorktreeAdd).toHaveBeenCalledWith(
        path.join(reposDir, "repo-a"),
        path.join(tmpDir, "wt-proj", "wt-task", "repo-a"),
        "feat/custom-branch",
      );
      expect(gitWorktreeAdd).toHaveBeenCalledWith(
        path.join(reposDir, "repo-b"),
        path.join(tmpDir, "wt-proj", "wt-task", "repo-b"),
        "feat/custom-branch",
      );
    });

    it("inserts in DB AFTER worktrees succeed", async () => {
      const project = setupProject("db-after-wt");

      await createTask(project.id, {
        slug: "db-task",
        name: "DB Task",
      });

      const tasks = listTasks(project.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.slug).toBe("db-task");
    });

    it("rolls back on worktree failure (no DB entry, dir cleaned)", async () => {
      const project = setupProject("rollback-proj");
      const reposDir = path.join(tmpDir, "rollback-proj", ".repos");
      fs.mkdirSync(path.join(reposDir, "fail-repo"), { recursive: true });

      vi.mocked(gitWorktreeAdd).mockRejectedValueOnce(new Error("worktree failed"));

      await expect(
        createTask(project.id, {
          slug: "fail-task",
          name: "Fail Task",
        }),
      ).rejects.toThrow("Failed to create worktrees");

      // No DB entry should exist
      const tasks = listTasks(project.id);
      expect(tasks).toHaveLength(0);

      // Task dir should be cleaned up
      const taskDir = path.join(tmpDir, "rollback-proj", "fail-task");
      expect(fs.existsSync(taskDir)).toBe(false);
    });

    it("uses default branch when not specified", async () => {
      const project = setupProject("branch-proj");

      const task = await createTask(project.id, {
        slug: "auto-branch",
        name: "Auto Branch",
      });

      expect(task.branch).toBe("feat/auto-branch");
    });

    it("throws when project not found", async () => {
      mockProject = null;
      await expect(createTask("nonexistent", { slug: "x", name: "X" })).rejects.toThrow(
        "Project not found",
      );
    });
  });

  describe("listTasks", () => {
    it("returns tasks for a project", async () => {
      const project = setupProject("list-proj");

      await createTask(project.id, { slug: "task-1", name: "Task 1" });
      await createTask(project.id, { slug: "task-2", name: "Task 2" });

      const tasks = listTasks(project.id);
      expect(tasks).toHaveLength(2);
      const slugs = tasks.map((t) => t.slug);
      expect(slugs).toContain("task-1");
      expect(slugs).toContain("task-2");
    });

    it("returns empty array for project with no tasks", () => {
      const tasks = listTasks("some-project-id");
      expect(tasks).toEqual([]);
    });
  });

  describe("getTask", () => {
    it("returns task by id", async () => {
      const project = setupProject("get-task-proj");
      const created = await createTask(project.id, { slug: "get-me", name: "Get Me" });

      const found = getTask(created.id);
      expect(found).not.toBeNull();
      expect(found!.slug).toBe("get-me");
    });

    it("returns null for nonexistent id", () => {
      expect(getTask("nonexistent")).toBeNull();
    });
  });

  describe("completeTask", () => {
    it("updates status to completed and calls cleanup", async () => {
      const project = setupProject("complete-proj");
      const reposDir = path.join(tmpDir, "complete-proj", ".repos");
      fs.mkdirSync(path.join(reposDir, "repo-x"), { recursive: true });

      const task = await createTask(project.id, { slug: "done-task", name: "Done Task" });
      vi.mocked(gitWorktreeAdd).mockClear();

      // Create fake worktree dir so cleanup finds it
      const wtDir = path.join(tmpDir, "complete-proj", "done-task", "repo-x");
      fs.mkdirSync(wtDir, { recursive: true });

      await completeTask(task.id);

      const updated = getTask(task.id);
      expect(updated!.status).toBe("completed");

      expect(gitWorktreeRemove).toHaveBeenCalled();
    });

    it("throws when task not found", async () => {
      await expect(completeTask("nonexistent")).rejects.toThrow("Task not found");
    });
  });

  describe("deleteTask", () => {
    it("removes from DB and cleans up directory", async () => {
      const project = setupProject("del-proj");

      const task = await createTask(project.id, { slug: "del-task", name: "Delete Task" });

      const taskDir = path.join(tmpDir, "del-proj", "del-task");
      expect(fs.existsSync(taskDir)).toBe(true);

      await deleteTask(task.id);

      expect(getTask(task.id)).toBeNull();
      expect(fs.existsSync(taskDir)).toBe(false);
    });

    it("throws when task not found", async () => {
      await expect(deleteTask("nonexistent")).rejects.toThrow("Task not found");
    });
  });
});
