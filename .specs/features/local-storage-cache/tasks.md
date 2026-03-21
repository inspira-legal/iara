# Local Storage Cache — Tasks

## T1 — Add Zod runtime schemas to `@iara/contracts`

**Files:** `packages/contracts/src/schemas.ts`, `packages/contracts/src/index.ts`
**Deps:** none

- Add `ProjectSchema`, `WorkspaceSchema`, `RepoInfoSchema`, `SessionInfoSchema` to `schemas.ts`
- Export them from the package
- Ensure schemas match the TypeScript interfaces in `models.ts` exactly
- Add `zod` as dependency of `packages/contracts` if not already present

**Verify:** `bun typecheck` passes, schemas parse sample data correctly

---

## T2 — Create `LocalCache` and `MapCache` abstraction

**Files:** `apps/web/src/lib/local-cache.ts`, `apps/web/src/lib/local-cache.test.ts`
**Deps:** T1

- Add `zod` as dependency of `apps/web`
- Implement `LocalCache<T>` — `get()`, `set()`, `clear()` with versioned envelope `{ v, data }` and Zod validation on read
- Implement `MapCache<V>` — `getEntry()`, `getAll()`, `setEntry()`, `removeEntry()`, `clear()` with LRU eviction and per-entry Zod validation
- On `get()` failure: return `null`, call `clear()` to remove corrupt entry
- All writes wrapped in try/catch

**Verify:** Unit tests covering: happy path, corrupt data, version mismatch, quota error, LRU eviction

---

## T3 — Create cache schemas

**Files:** `apps/web/src/lib/cache-schemas.ts`
**Deps:** T1

- `CachedStateSchema` — projects, settings, repoInfo, sessions
- `ScriptsPanelSchema` — activeTab, collapsed
- Import and reuse schemas from `@iara/contracts`

**Verify:** `bun typecheck` passes

---

## T4 — Expand `state.init` on the server

**Files:** `packages/contracts/src/ws.ts`, `apps/server/src/handlers/app.ts`
**Deps:** T1

- Update `WsMethods["state.init"].result` type to include `repoInfo: Record<string, RepoInfo[]>` and `sessions: Record<string, SessionInfo[]>`
- In the handler, iterate all projects + workspaces, gather repo info and sessions via `Promise.allSettled`
- Failed entries → empty arrays (never block init)
- Workspace keys: `"<projectId>/default"` for default workspaces, workspace id for tasks

**Verify:** `bun typecheck` passes, manual test: `state.init` returns full payload

---

## T5 — Hydrate app store from cache + stale-while-revalidate

**Files:** `apps/web/src/stores/app.ts`
**Deps:** T2, T3, T4

- Create `stateCache` instance with `CachedStateSchema`
- Add `stale: boolean` and `repoInfo: Record<string, RepoInfo[]>`, `sessions: Record<string, SessionInfo[]>` to `AppState`
- In store initializer: sync hydrate from `stateCache.get()` → set `initialized: true`, `stale: true` if cache exists
- In `init()`: on server response, update store with fresh data + set `stale: false`
- Add debounced `subscribe` (300ms) to auto-persist `{ projects, settings, repoInfo, sessions }` to cache after any mutation
- Add selectors: `getRepoInfo(workspaceId)`, `getSessions(workspaceId)`
- Restore selection logic stays the same (runs after hydration)

**Verify:** App renders instantly from cache, server response reconciles, `stale` toggles correctly

---

## T6 — Wire workspace components to use store data

**Files:** `apps/web/src/components/DefaultWorkspace.tsx`, `apps/web/src/components/TaskWorkspace.tsx`
**Deps:** T5

- Read `repoInfo` from app store instead of local `useState` + `transport.request` on mount
- Keep background refresh: on workspace mount, fire `repos.getInfo` and update store (SWR)
- Remove `repoLoading` useState — if store has data, render it; show skeleton only if store has no data for this workspace
- Same pattern for the 5-minute interval fetch — update store instead of local state

**Verify:** No skeleton flash on workspace switch when data is cached. Fresh data still loads in background.

---

## T7 — Wire sessions store to use init payload + cache

**Files:** `apps/web/src/stores/sessions.ts`, `apps/web/src/components/SessionList.tsx`
**Deps:** T5

- On init, populate `sessionsByWorkspace` / `sessionsByProject` from the app store's `sessions` data
- `SessionList`: if store already has sessions for this workspace, render immediately (no "Loading sessions...")
- Keep background refresh on mount (SWR)
- Update app store's sessions cache when sessions are refreshed

**Verify:** Sessions render instantly on workspace switch. Background refresh still works.

---

## T8 — Persist bottom panel UI state

**Files:** `apps/web/src/stores/scripts.ts`
**Deps:** T2, T3

- Create `panelCache` instance with `ScriptsPanelSchema`
- Hydrate `activeTab` and `collapsed` from cache on store creation
- Persist on every `setActiveTab` / `setCollapsed` call

**Verify:** Reload page → bottom panel tab and collapsed state preserved

---

## T9 — Cache scripts config per workspace

**Files:** `apps/web/src/stores/scripts.ts`
**Deps:** T2, T3

- Create `scriptsConfigCache` MapCache instance (max 20 entries)
- In `loadConfig`: read cached config for workspace immediately → set as current config, then fetch fresh in background
- On fresh response: update store + cache
- On workspace delete: `removeEntry`
- Add ScriptsConfig Zod schema to contracts if not present

**Verify:** Workspace switch shows cached scripts instantly. Fresh data loads in background. Old entries evicted after 20.

---

## T10 — Migrate existing localStorage helpers to `LocalCache`

**Files:** `apps/web/src/stores/sidebar.ts`, `apps/web/src/stores/app.ts` (selection), `apps/web/src/hooks/useTheme.ts`
**Deps:** T2

- Replace `loadFromStorage`/`saveToStorage` in sidebar with `LocalCache` + Zod schema for `{ expandedProjectIds: string[], projectOrder: string[] }`
- Replace `loadSelection`/`saveSelection` in app with `LocalCache` + Zod schema for `{ projectId, workspaceId }`
- Replace raw `localStorage` in useTheme with `LocalCache` + Zod schema for theme enum
- Old localStorage keys are abandoned (new versioned keys)

**Verify:** All existing persistence works as before. `bun typecheck`, `bun lint` pass.

---

## T11 — Final verification

**Deps:** T1–T10

- `bun fmt && bun lint && bun typecheck`
- `bun run test`
- `bun build:desktop`
- Manual test: cold start → instant render from cache → server reconciles → switch workspaces → no skeletons

---

## Dependency Graph

```
T1 ──┬── T2 ──┬── T5 ──┬── T6
     │        │        └── T7
     ├── T3 ──┤
     │        ├── T8
     │        └── T9
     └── T4 ──┘
                T2 ──── T10
                        T11 (all)
```

## Parallelization

- **T2 + T3 + T4** can run in parallel after T1
- **T6 + T7 + T8 + T9 + T10** can run in parallel after T5 (T6/T7 depend on T5; T8/T9/T10 only need T2+T3)
