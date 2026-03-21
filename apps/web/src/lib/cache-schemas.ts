import { z } from "zod";
import {
  ProjectSchema,
  RepoInfoSchema,
  SessionInfoSchema,
  ScriptsConfigSchema,
} from "@iara/contracts";

// ---------------------------------------------------------------------------
// Cached app state — full state.init payload
// ---------------------------------------------------------------------------

export const CachedStateSchema = z.object({
  projects: z.array(ProjectSchema),
  settings: z.record(z.string(), z.string()),
  repoInfo: z.record(z.string(), z.array(RepoInfoSchema)),
  sessions: z.record(z.string(), z.array(SessionInfoSchema)),
});

// ---------------------------------------------------------------------------
// Bottom panel UI state
// ---------------------------------------------------------------------------

export const ScriptsPanelSchema = z.object({
  activeTab: z.enum(["scripts", "output"]).nullable(),
  collapsed: z.boolean(),
});

// ---------------------------------------------------------------------------
// Sidebar state
// ---------------------------------------------------------------------------

export const SidebarCacheSchema = z.object({
  expandedProjectIds: z.array(z.string()),
  projectOrder: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

export const SelectionCacheSchema = z.object({
  projectId: z.string().nullable(),
  workspaceId: z.string().nullable(),
});

// Re-export for convenience
export { ScriptsConfigSchema };
