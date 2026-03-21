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
    createdAt: z.string(),
  }),
]);
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;

export const SettingsFileSchema = z.record(z.string(), z.string());
export type SettingsFile = z.infer<typeof SettingsFileSchema>;
