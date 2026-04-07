import { z } from "zod";

// ---------------------------------------------------------------------------
// App preferences (settings + selection — no transient data)
// ---------------------------------------------------------------------------

export const AppCacheSchema = z.object({
  settings: z.record(z.string(), z.string()),
  workspaceId: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Persisted sessions (survive app restart)
// ---------------------------------------------------------------------------

export const PersistedSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sessionId: z.string(),
  title: z.string().nullable(),
});

export type PersistedSession = z.infer<typeof PersistedSessionSchema>;

export const PersistedSessionsSchema = z.array(PersistedSessionSchema);
