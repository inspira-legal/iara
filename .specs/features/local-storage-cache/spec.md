# Local Storage Cache — Instant Startup

## Goal

Eliminate blank-screen startup and loading flashes. The app renders immediately from cached state (stale-while-revalidate), then silently reconciles when the server responds.

## Problem

Current startup: React mount → WS connect (variable latency) → `state.init` request → render. The user sees an empty screen until the server responds. Switching workspaces triggers additional `repos.getInfo` + `sessions.list` requests with loading skeletons.

## Strategy: Stale-While-Revalidate

Every cacheable resource follows the same pattern:

1. **Read from cache synchronously** on mount/store creation → render immediately
2. **Fetch from server in background** → when response arrives, update store + cache
3. **`stale` flag** on each cached resource so UI can optionally show a subtle indicator

No TTL or expiry — data is always refreshed. Cache is purely for instant render.

## Requirements

### R1 — Cache `state.init` response (projects + settings + workspace data)

- On every `state.init` response, persist the full payload to localStorage.
- On app start, hydrate the app store **synchronously** from cache before the first render.
- Set `initialized: true` + `stale: true` immediately if cache exists. When server responds, set `stale: false`.
- If no cache, fall back to current behavior (wait for server).
- **Cache writes on push events:** Use a debounced `zustand.subscribe` (300ms) on the app store to auto-persist state to cache after any mutation (push handlers, user actions). This avoids sprinkling cache writes in every individual handler.

### R2 — Expand `state.init` to include workspace data

Expand the server's `state.init` response to return **everything the client needs** in one round-trip:

```ts
"state.init": {
  params: Record<string, never>;
  result: {
    projects: Project[];
    settings: Record<string, string>;
    repoInfo: Record<string, RepoInfo[]>;       // keyed by workspaceId
    sessions: Record<string, SessionInfo[]>;      // keyed by workspaceId
  };
};
```

- Server iterates all projects + workspaces, gathers `repos.getInfo` and `sessions.list` for each.
- Use `Promise.allSettled` so one slow/failing repo doesn't block the entire init. Failed entries return empty arrays.
- Client stores and caches the full payload.
- `DefaultWorkspace` / `TaskWorkspace` read from the store instead of making individual requests on mount.
- Background refresh: individual `repos.getInfo` / `sessions.list` calls still happen on workspace focus to keep data fresh (stale-while-revalidate), but the initial render uses the init payload.
- Accept that `state.init` may be slower with many projects — the cache ensures the client is instant regardless.

### R3 — Persist bottom panel UI state

- `activeTab` ("scripts" | "output" | null) and `collapsed` (boolean) should survive page reloads.
- Save to localStorage on change. Hydrate on store creation.

### R4 — Cache scripts config per workspace

- After `scripts.load` response, cache config keyed by `workspaceId`.
- On workspace switch, show cached config instantly while fresh load happens in background.
- Evict entries when a workspace is deleted.
- Max 20 entries (LRU eviction).

## Non-Requirements

- No IndexedDB — localStorage is sufficient for this data volume.
- No data migration — old localStorage entries from previous format are silently discarded (version mismatch → cache miss → fresh fetch from server). No code to read old format and convert.
- Panel sizes are already handled by `react-resizable-panels` — no changes needed.
- No offline mode — cache is only for instant render, not offline capability.

## Storage Keys

| Key                      | Data                                         | Store         |
| ------------------------ | -------------------------------------------- | ------------- |
| `iara:state-cache:v1`    | `{ projects, settings, repoInfo, sessions }` | app store     |
| `iara:scripts-panel:v1`  | `{ activeTab, collapsed }`                   | scripts store |
| `iara:scripts-config:v1` | `Record<workspaceId, ScriptsConfig>`         | scripts store |

## Design: `LocalCache<T>` abstraction

Lives in `apps/web/src/lib/local-cache.ts`. Follows the same Zod-validated pattern as `@iara/shared/json-file` but for localStorage instead of the filesystem.

### Dependencies

- Add `zod` as a dependency of `apps/web` (~13KB gzipped). Already used server-side in `packages/shared` and `packages/contracts`.
- Add Zod runtime schemas for client models (`Project`, `Workspace`, `RepoInfo`, `SessionInfo`, `ScriptsConfig`) to `packages/contracts/src/schemas.ts` alongside the existing file schemas. This makes them available to both server and client.

### `LocalCache<T>` — single-value cache

```ts
import type { z } from "zod";

interface LocalCacheOptions<T> {
  key: string; // e.g. "iara:state-cache"
  version: number; // stored alongside data; bump to invalidate old cache
  schema: z.ZodType<T>; // Zod schema — parse on read, discard if invalid
}

class LocalCache<T> {
  constructor(options: LocalCacheOptions<T>);

  /** Sync read — returns null if missing, corrupt, wrong version, or fails Zod parse. */
  get(): T | null;

  /** Zod-validate then write. Silently swallows errors (quota, private browsing). */
  set(value: T): void;

  /** Remove the key. */
  clear(): void;
}
```

On disk format: `{ v: number, data: T }`. The `get()` method:

1. `localStorage.getItem` → JSON.parse → check `v === version` → `schema.safeParse(data)`
2. If any step fails → return `null` (+ `clear()` to remove corrupt entry)

### `MapCache<V>` — keyed collection with LRU

For `Record<string, V>` data (scripts config per workspace, etc.):

```ts
interface MapCacheOptions<V> {
  key: string;
  version: number;
  schema: z.ZodType<V>; // validates each entry individually
  maxEntries?: number; // default: 20, LRU eviction
}

class MapCache<V> {
  constructor(options: MapCacheOptions<V>);

  /** Get a single entry. Returns null if missing or fails Zod parse (removes bad entry). */
  getEntry(id: string): V | null;

  /** Get all entries (only those passing Zod validation). */
  getAll(): Record<string, V>;

  /** Validate then set a single entry. Triggers LRU eviction if over limit. */
  setEntry(id: string, value: V): void;

  /** Remove a single entry. */
  removeEntry(id: string): void;

  /** Clear everything. */
  clear(): void;
}
```

On disk format: `{ v: number, entries: Record<string, V>, order: string[] }`. The `order` array tracks LRU — most recently accessed at end.

### Schemas

Add Zod runtime schemas to `packages/contracts/src/schemas.ts` for all client models:

```ts
// packages/contracts/src/schemas.ts — new additions

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
  title: z.string(),
  lastMessageAt: z.string(),
  messageCount: z.number(),
  cwd: z.string().optional(),
});
```

Then in `apps/web/src/lib/cache-schemas.ts`:

```ts
import { z } from "zod";
import { ProjectSchema, RepoInfoSchema, SessionInfoSchema } from "@iara/contracts";

export const CachedStateSchema = z.object({
  projects: z.array(ProjectSchema),
  settings: z.record(z.string(), z.string()),
  repoInfo: z.record(z.string(), z.array(RepoInfoSchema)),
  sessions: z.record(z.string(), z.array(SessionInfoSchema)),
});

export const ScriptsPanelSchema = z.object({
  activeTab: z.enum(["scripts", "output"]).nullable(),
  collapsed: z.boolean(),
});
```

### Cache write strategy

Instead of manually calling `cache.set()` in every push handler:

```ts
// app.ts — after store creation
const debouncedCacheWrite = debounce(() => {
  const { projects, settings, repoInfo, sessions } = useAppStore.getState();
  stateCache.set({ projects, settings, repoInfo, sessions });
}, 300);

useAppStore.subscribe(debouncedCacheWrite);
```

This automatically persists state after any mutation — init response, push events, user actions — with a 300ms debounce to batch rapid updates.

### Migration of existing ad-hoc patterns

Existing localStorage helpers in `sidebar.ts` (`loadFromStorage`/`saveToStorage`), `app.ts` (`loadSelection`/`saveSelection`), and `useTheme.ts` will be refactored to use `LocalCache` with Zod schemas. The old localStorage keys are abandoned — new versioned keys cause a clean cache miss on first load, no data migration code needed.

## Constraints

- All localStorage writes wrapped in try/catch (quota, private browsing).
- Cache reads must be synchronous (no async in store initializer).
- Server `state.init` must not block on slow git operations — use `Promise.allSettled` so one repo failure doesn't block the entire init.
- Keep `state.init` response under ~500KB — if a user has many projects, consider capping repo info to recently accessed workspaces.
