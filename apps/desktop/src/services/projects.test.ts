import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;

// In-memory store for mock DB
let projectsStore: Array<{
  id: string;
  slug: string;
  name: string;
  repoSources: string;
  createdAt: string;
  updatedAt: string;
}> = [];
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

// Slugs seen to enforce uniqueness
const slugSet = new Set<string>();

function makeMockDb() {
  return {
    select: () => ({
      from: (table: unknown) => ({
        all: () => {
          if (table === mockSchema.projects) return [...projectsStore];
          if (table === mockSchema.tasks) return [...tasksStore];
          return [];
        },
        where: (_predicate: unknown) => ({
          get: () => {
            // The predicate is opaque, but we use a side-channel to know what ID we're searching
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
          if (table === mockSchema.projects) {
            if (slugSet.has(row.slug as string)) {
              throw new Error("UNIQUE constraint failed: projects.slug");
            }
            slugSet.add(row.slug as string);
            projectsStore.push(row as (typeof projectsStore)[0]);
          } else if (table === mockSchema.tasks) {
            tasksStore.push(row as (typeof tasksStore)[0]);
          }
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (updates: Record<string, unknown>) => ({
        where: (_predicate: unknown) => ({
          run: () => {
            if (table === mockSchema.projects) {
              const id = lastUpdateTargetId;
              const idx = projectsStore.findIndex((p) => p.id === id);
              if (idx >= 0) {
                projectsStore[idx] = {
                  ...projectsStore[idx]!,
                  ...updates,
                } as (typeof projectsStore)[0];
              }
            } else if (table === mockSchema.tasks) {
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
          if (table === mockSchema.projects) {
            const id = lastDeleteTargetId;
            const proj = projectsStore.find((p) => p.id === id);
            if (proj) slugSet.delete(proj.slug);
            projectsStore = projectsStore.filter((p) => p.id !== id);
          } else if (table === mockSchema.tasks) {
            const id = lastDeleteTargetId;
            if (id) {
              tasksStore = tasksStore.filter((t) => t.id !== id && t.projectId !== id);
            }
          }
        },
      }),
    }),
  };
}

// Side-channel for where() clauses since we can't easily evaluate drizzle predicates
let lastFilteredResult: unknown = undefined;
let lastFilteredResults: unknown[] = [];
let lastUpdateTargetId: string = "";
let lastDeleteTargetId: string = "";

const mockSchema = {
  projects: { id: "projects.id", slug: "projects.slug" } as unknown,
  tasks: { id: "tasks.id", projectId: "tasks.projectId" } as unknown,
};

vi.mock("./config.js", () => ({
  getProjectsDir: () => tmpDir,
}));

vi.mock("@iara/shared/git", () => ({
  gitClone: vi.fn().mockResolvedValue(undefined),
  gitWorktreeAdd: vi.fn().mockResolvedValue(undefined),
  gitWorktreeRemove: vi.fn().mockResolvedValue(undefined),
}));

// Intercept drizzle-orm eq() calls
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: string) => {
    // Store the value for later use by the mock db
    lastUpdateTargetId = value;
    lastDeleteTargetId = value;

    // Set filtered results based on column
    if (column === (mockSchema.projects as Record<string, unknown>).id) {
      lastFilteredResult = projectsStore.find((p) => p.id === value) ?? undefined;
      lastFilteredResults = projectsStore.filter((p) => p.id === value);
    } else if (column === (mockSchema.tasks as Record<string, unknown>).id) {
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
  getDb: () => makeMockDb(),
  schema: mockSchema,
}));

// Mock listTasks for updateProject (it imports from tasks service)
vi.mock("./tasks.js", () => ({
  listTasks: (projectId: string) => {
    return tasksStore
      .filter((t) => t.projectId === projectId)
      .map((t) => ({
        ...t,
        status: t.status as "active" | "completed",
      }));
  },
}));

const { createProject, deleteProject, getProject, getProjectDir, listProjects, updateProject } =
  await import("./projects.js");
const { gitClone } = await import("@iara/shared/git");

describe("projects service", () => {
  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "iara-proj-test-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    projectsStore = [];
    tasksStore = [];
    slugSet.clear();
    lastFilteredResult = undefined;
    lastFilteredResults = [];
    lastUpdateTargetId = "";
    lastDeleteTargetId = "";
    vi.clearAllMocks();
  });

  describe("getProjectDir", () => {
    it("returns path under projects dir", () => {
      const dir = getProjectDir("my-project");
      expect(dir).toBe(path.join(tmpDir, "my-project"));
    });
  });

  describe("createProject", () => {
    it("creates directory and PROJECT.md", async () => {
      const project = await createProject({
        slug: "test-proj",
        name: "Test Project",
        repoSources: [],
      });

      const projectDir = getProjectDir("test-proj");
      expect(fs.existsSync(projectDir)).toBe(true);
      expect(fs.existsSync(path.join(projectDir, ".repos"))).toBe(true);

      const mdContent = fs.readFileSync(path.join(projectDir, "PROJECT.md"), "utf-8");
      expect(mdContent).toBe("# Test Project\n");

      expect(project.slug).toBe("test-proj");
      expect(project.name).toBe("Test Project");
      expect(project.repoSources).toEqual([]);
    });

    it("stores in DB and can be listed", async () => {
      await createProject({
        slug: "list-test",
        name: "List Test",
        repoSources: ["https://github.com/user/repo.git"],
      });

      const projects = listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0]!.slug).toBe("list-test");
      expect(projects[0]!.repoSources).toEqual(["https://github.com/user/repo.git"]);
    });

    it("calls gitClone for each repoSource", async () => {
      await createProject({
        slug: "clone-test",
        name: "Clone Test",
        repoSources: ["https://github.com/user/repo1.git", "https://github.com/user/repo2.git"],
      });

      expect(gitClone).toHaveBeenCalledTimes(2);
      expect(gitClone).toHaveBeenCalledWith(
        "https://github.com/user/repo1.git",
        path.join(tmpDir, "clone-test", ".repos", "repo1"),
      );
      expect(gitClone).toHaveBeenCalledWith(
        "https://github.com/user/repo2.git",
        path.join(tmpDir, "clone-test", ".repos", "repo2"),
      );
    });

    it("rejects duplicate slugs (DB constraint)", async () => {
      await createProject({
        slug: "unique-slug",
        name: "First",
        repoSources: [],
      });

      await expect(
        createProject({
          slug: "unique-slug",
          name: "Second",
          repoSources: [],
        }),
      ).rejects.toThrow();
    });
  });

  describe("getProject", () => {
    it("returns project by id", async () => {
      const created = await createProject({
        slug: "get-test",
        name: "Get Test",
        repoSources: [],
      });

      const found = getProject(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe("Get Test");
    });

    it("returns null for nonexistent id", () => {
      const found = getProject("nonexistent-id");
      expect(found).toBeNull();
    });
  });

  describe("deleteProject", () => {
    it("removes from DB and cleans up directory", async () => {
      const project = await createProject({
        slug: "del-test",
        name: "Delete Test",
        repoSources: [],
      });

      const projectDir = getProjectDir("del-test");
      expect(fs.existsSync(projectDir)).toBe(true);

      deleteProject(project.id);

      expect(getProject(project.id)).toBeNull();
      expect(listProjects()).toHaveLength(0);
      expect(fs.existsSync(projectDir)).toBe(false);
    });
  });

  describe("updateProject", () => {
    it("updates name in DB", async () => {
      const project = await createProject({
        slug: "upd-name",
        name: "Original",
        repoSources: [],
      });

      await updateProject(project.id, { name: "Updated Name" });

      const updated = getProject(project.id);
      expect(updated!.name).toBe("Updated Name");
    });

    it("calls gitClone for new repo sources", async () => {
      const project = await createProject({
        slug: "upd-repos",
        name: "Update Repos",
        repoSources: [],
      });

      vi.mocked(gitClone).mockClear();

      await updateProject(project.id, {
        repoSources: ["https://github.com/user/new-repo.git"],
      });

      expect(gitClone).toHaveBeenCalledWith(
        "https://github.com/user/new-repo.git",
        path.join(tmpDir, "upd-repos", ".repos", "new-repo"),
      );
    });

    it("removes repo directory when repo removed from sources", async () => {
      const project = await createProject({
        slug: "upd-rm-repo",
        name: "Remove Repo",
        repoSources: ["https://github.com/user/old-repo.git"],
      });

      // Simulate the repo dir existing on disk
      const repoDir = path.join(tmpDir, "upd-rm-repo", ".repos", "old-repo");
      fs.mkdirSync(repoDir, { recursive: true });

      await updateProject(project.id, { repoSources: [] });

      expect(fs.existsSync(repoDir)).toBe(false);

      const updated = getProject(project.id);
      expect(updated!.repoSources).toEqual([]);
    });

    it("throws when project not found", async () => {
      await expect(updateProject("nonexistent", { name: "nope" })).rejects.toThrow(
        "Project not found",
      );
    });
  });
});
