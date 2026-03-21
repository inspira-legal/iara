import { z } from "zod";

// ---------------------------------------------------------------------------
// File schemas — what lives on disk (no derived fields like id, slug)
// ---------------------------------------------------------------------------

export const ProjectFileSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  repoSources: z.array(z.string()),
  createdAt: z.string(),
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

export const WorkspaceFileSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("default"),
    name: z.string(),
    description: z.string().default(""),
    createdAt: z.string(),
  }),
  z.object({
    type: z.literal("task"),
    name: z.string(),
    description: z.string().default(""),
    branch: z.string(),
    branches: z.record(z.string(), z.string()).optional(),
    createdAt: z.string(),
  }),
]);
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;

export const SettingsFileSchema = z.record(z.string(), z.string());
export type SettingsFile = z.infer<typeof SettingsFileSchema>;

// ---------------------------------------------------------------------------
// Runtime model schemas — mirrors interfaces in models.ts and ipc.ts
// ---------------------------------------------------------------------------

export const WorkspaceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  slug: z.string(),
  type: z.enum(["default", "task"]),
  name: z.string(),
  description: z.string(),
  branch: z.string().optional(),
  branches: z.record(z.string(), z.string()).optional(),
  createdAt: z.string(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  repoSources: z.array(z.string()),
  workspaces: z.array(WorkspaceSchema),
  createdAt: z.string(),
});

export const RepoInfoSchema = z.object({
  name: z.string(),
  branch: z.string(),
  dirtyCount: z.number(),
  ahead: z.number(),
  behind: z.number(),
});

export const SessionInfoSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  cwd: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  lastMessageAt: z.string(),
  messageCount: z.number(),
});

export const ScriptEntrySchema = z.object({
  run: z.array(z.string()),
  output: z.enum(["always", "on-error", "silent"]),
});

export const ScriptStatusSchema = z.object({
  scriptId: z.string(),
  projectId: z.string(),
  workspace: z.string(),
  service: z.string(),
  script: z.string(),
  pid: z.number().nullable(),
  health: z.enum(["starting", "healthy", "unhealthy", "stopped", "running", "success", "failed"]),
  exitCode: z.number().nullable(),
});

export const ServiceDefSchema = z.object({
  name: z.string(),
  dependsOn: z.array(z.string()),
  port: z.number().nullable(),
  timeout: z.number(),
  env: z.record(z.string(), z.string()),
  essencial: z.record(z.string(), ScriptEntrySchema),
  advanced: z.record(z.string(), ScriptEntrySchema),
  isRepo: z.boolean(),
});

export const ResolvedServiceDefSchema = ServiceDefSchema.extend({
  resolvedPort: z.number(),
  resolvedEnv: z.record(z.string(), z.string()),
});

export const ScriptsConfigSchema = z.object({
  services: z.array(ResolvedServiceDefSchema),
  statuses: z.array(ScriptStatusSchema),
  hasFile: z.boolean(),
  filePath: z.string(),
});
