import { describe, it, expect } from "vitest";
import { ProjectFileSchema, WorkspaceFileSchema, SettingsFileSchema } from "./schemas.js";

describe("ProjectFileSchema", () => {
  it("validates a valid project file", () => {
    const result = ProjectFileSchema.safeParse({ name: "My Project" });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = ProjectFileSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("WorkspaceFileSchema", () => {
  it("validates a workspace with name only", () => {
    const result = WorkspaceFileSchema.safeParse({ name: "Default" });
    expect(result.success).toBe(true);
  });

  it("validates a workspace with branch", () => {
    const result = WorkspaceFileSchema.safeParse({
      name: "Fix Login",
      branch: "feat/fix-login",
    });
    expect(result.success).toBe(true);
  });

  it("validates a workspace with branches map", () => {
    const result = WorkspaceFileSchema.safeParse({
      name: "Multi-repo task",
      branch: "feat/multi",
      branches: { frontend: "feat/multi", backend: "feat/multi-api" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branches).toEqual({
        frontend: "feat/multi",
        backend: "feat/multi-api",
      });
    }
  });

  it("rejects missing name", () => {
    const result = WorkspaceFileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects branches with non-string values", () => {
    const result = WorkspaceFileSchema.safeParse({
      name: "Bad",
      branches: { frontend: 123 },
    });
    expect(result.success).toBe(false);
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
    const result = SettingsFileSchema.safeParse({ count: 42 });
    expect(result.success).toBe(false);
  });
});
