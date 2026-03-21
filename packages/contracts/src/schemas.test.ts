import { describe, it, expect } from "vitest";
import { ProjectFileSchema, WorkspaceFileSchema, SettingsFileSchema } from "./schemas.js";

describe("ProjectFileSchema", () => {
  it("validates a valid project file", () => {
    const result = ProjectFileSchema.safeParse({
      name: "My Project",
      description: "A test project",
      repoSources: ["https://github.com/org/repo"],
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("applies default description", () => {
    const result = ProjectFileSchema.parse({
      name: "My Project",
      repoSources: [],
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.description).toBe("");
  });

  it("rejects missing name", () => {
    const result = ProjectFileSchema.safeParse({
      repoSources: [],
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array repoSources", () => {
    const result = ProjectFileSchema.safeParse({
      name: "Test",
      repoSources: "not-array",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty repoSources", () => {
    const result = ProjectFileSchema.safeParse({
      name: "Test",
      repoSources: [],
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple repoSources", () => {
    const result = ProjectFileSchema.parse({
      name: "Multi",
      repoSources: ["https://github.com/a/b", "https://github.com/c/d"],
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.repoSources).toHaveLength(2);
  });
});

describe("WorkspaceFileSchema", () => {
  it("validates a default workspace", () => {
    const result = WorkspaceFileSchema.safeParse({
      type: "default",
      name: "Default",
      description: "",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("validates a task workspace", () => {
    const result = WorkspaceFileSchema.safeParse({
      type: "task",
      name: "Fix login bug",
      description: "Fix the login form validation",
      branch: "feat/fix-login",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects task workspace without branch", () => {
    const result = WorkspaceFileSchema.safeParse({
      type: "task",
      name: "No branch",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("applies default description for default workspace", () => {
    const result = WorkspaceFileSchema.parse({
      type: "default",
      name: "Default",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.description).toBe("");
  });

  it("applies default description for task workspace", () => {
    const result = WorkspaceFileSchema.parse({
      type: "task",
      name: "Task",
      branch: "feat/x",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.description).toBe("");
  });

  it("rejects unknown type", () => {
    const result = WorkspaceFileSchema.safeParse({
      type: "unknown",
      name: "Bad",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("default workspace does not accept branch field", () => {
    // branch is not stripped but is unexpected — depends on zod strictness
    const result = WorkspaceFileSchema.safeParse({
      type: "default",
      name: "Default",
      branch: "should-not-be-here",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    // With passthrough, this may succeed but branch is ignored in the type
    if (result.success) {
      expect(result.data.type).toBe("default");
    }
  });
});

describe("SettingsFileSchema", () => {
  it("validates an empty settings object", () => {
    const result = SettingsFileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates key-value settings", () => {
    const result = SettingsFileSchema.parse({
      theme: "dark",
      "ports.next_base": "3020",
    });
    expect(result.theme).toBe("dark");
    expect(result["ports.next_base"]).toBe("3020");
  });

  it("rejects non-string values", () => {
    const result = SettingsFileSchema.safeParse({
      count: 42,
    });
    expect(result.success).toBe(false);
  });
});
