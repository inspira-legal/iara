import { z } from "zod";

// ---------------------------------------------------------------------------
// App preferences (settings + selection — no transient data)
// ---------------------------------------------------------------------------

export const AppCacheSchema = z.object({
  settings: z.record(z.string(), z.string()),
  workspaceId: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Sidebar state
// ---------------------------------------------------------------------------

export const SidebarCacheSchema = z.object({
  expandedProjectIds: z.array(z.string()),
  projectOrder: z.array(z.string()),
});
