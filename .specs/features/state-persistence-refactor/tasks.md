# State & Data Persistence Refactor — Tasks

## Dependency Graph

```
T1 (zod in contracts) ──┐
                         ├─→ T3 (JsonFile) ──→ T5 (AppState) ──→ T7 (handlers) ──→ T10 (UI components)
T2 (schemas)  ───────────┘                         │                    │
                                                   ├─→ T6 (watcher) ───┘
T4 (ports) ────────────────────────────────────────┘

T8 (useAppStore) ──→ T9 (other stores) ──→ T10 (UI components)

T11 (delete DB) — after T7

T12 (typecheck + lint + fix) — after T10
```

## Tasks

### T1. Add Zod to contracts and shared packages

**Deps:** none

- Add `zod` dependency to `packages/contracts/package.json`
- Add `zod` dependency to `packages/shared/package.json`
- Add `"./schemas"` subpath export to `packages/contracts/package.json`
- Run `bun install`

**Verify:** `bun typecheck` passes

---

### T2. Create Zod schemas and update models

**Deps:** T1

- Create `packages/contracts/src/schemas.ts`:
  - `ProjectFileSchema` (name, description, repoSources, createdAt)
  - `WorkspaceFileSchema` (discriminated union on type: default | task)
  - `SettingsFileSchema` (record string→string)
- Update `packages/contracts/src/models.ts`:
  - Remove `Task` interface
  - Add `Workspace` interface (id, projectId, slug, type, name, description, branch?, createdAt)
  - Update `Project` interface (id=slug, remove updatedAt, add workspaces[])
- Update `packages/contracts/src/index.ts`:
  - Remove `Task` export
  - Add `Workspace` export
  - Export schemas from `./schemas.js`
- Update `packages/contracts/src/ws.ts`:
  - Add `"state.init"` method
  - Rename `tasks.*` → `workspaces.*` methods
  - Update params: `taskId` → `workspaceId` across all methods
  - Add push events: `project:changed`, `workspace:changed`, `state:resync`
  - Remove `notifications.list`, `notifications.unreadCount`, `notifications.markRead`, `notifications.markAllRead` methods
  - Update `session:changed` push event params

**Verify:** `bun typecheck` on contracts package passes

---

### T3. Create JsonFile\<T\> abstraction

**Deps:** T1

- Create `packages/shared/src/json-file.ts`:
  - `JsonFile<T>` class with `read()`, `readOrThrow()`, `write()`, `exists()`, `delete()`, `path` getter
  - Atomic write: write to `.tmp`, then `fs.renameSync`
  - Zod validation on read
- Add `"./json-file"` subpath export to `packages/shared/package.json`
- Remove `safeReadJson` and `safeWriteJson` from `packages/shared/src/fs.ts`
- Update any imports of `safeReadJson`/`safeWriteJson` in server to use JsonFile (or fix later in T5/T7)

**Verify:** Unit test for JsonFile — read, write, validate, atomic write, missing file returns null

---

### T4. Refactor port allocation — hash-based

**Deps:** none

- Update `packages/orchestrator/src/ports.ts`:
  - Remove `PortStore` interface
  - Add `deriveBasePort(workspaceId: string): number` function
  - Simplify `PortAllocator`: no constructor args, in-memory `allocated` map
  - `allocate(workspaceId)` instead of `allocate(projectId, workspace)`
  - `release(workspaceId)` instead of `release(projectId, workspace)`
  - `resolve()` unchanged
- Delete `apps/server/src/services/port-store.ts`

**Verify:** Unit test for `deriveBasePort` — deterministic, within range. `bun typecheck` on orchestrator passes.

---

### T5. Create AppState — server state tree

**Deps:** T2, T3

- Create `apps/server/src/services/state.ts`:
  - `AppState` class with `scan()`, `getState()`, `getProject()`, `getWorkspace()`
  - `rescanProject(slug)` for incremental updates
  - Settings CRUD: `getSetting()`, `setSetting()`, `getAllSettings()` — reads/writes `settings.json` via JsonFile
  - Project CRUD helpers: `writeProject()`, `deleteProjectDir()`
  - Workspace CRUD helpers: `writeWorkspace()`, `deleteWorkspaceDir()`
- Wire `JsonFile<ProjectFile>` and `JsonFile<WorkspaceFile>` for each project/workspace
- Wire `JsonFile<SettingsFile>` for settings

**Verify:** Unit test — scan empty dir returns empty. Scan dir with valid project.json + workspace.json returns correct tree.

---

### T6. Create FS watcher

**Deps:** T5

- Create `apps/server/src/services/watcher.ts`:
  - `ProjectsWatcher` class
  - `start()` — `fs.watch` recursive on projects dir
  - Filter: only `project.json` and `workspace.json` filenames
  - `suppressNext(path)` — own-write tracking with 1s expiry
  - Debounce 100ms, batch changes, then flush
  - On flush: call `appState.rescanProject()`, push events to clients
  - `stop()` — close watcher

**Verify:** Manual test — create a project.json on disk, verify push event fires.

---

### T7. Rewrite server handlers

**Deps:** T4, T5, T6

- Update `apps/server/src/main.ts`:
  - Remove DB initialization
  - Create `AppState`, `PortAllocator` (no args), `ProjectsWatcher`
  - Start watcher
  - Pass to handler registration
- Rewrite `apps/server/src/handlers/projects.ts`:
  - `projects.create` — write project.json + workspace.json for default/, mkdir, clone repos
  - `projects.update` — update project.json via AppState
  - `projects.delete` — delete project dir, rescan
  - Remove `projects.list`, `projects.get` (served by state.init)
- Rewrite `apps/server/src/handlers/tasks.ts` → rename file to `handlers/workspaces.ts`:
  - `workspaces.create` — create dir, worktrees, write workspace.json, push event
  - `workspaces.delete` — remove worktrees, delete dir, release port, push event
  - `workspaces.suggest` — same logic, updated params
  - `workspaces.regenerate` — same logic, updated params
  - `workspaces.renameBranch` — same logic, updated params
- Add `state.init` handler — returns `appState.getState()`
- Update `handlers/scripts.ts` — use workspaceId, derive projectId/workspace from it
- Update `handlers/sessions.ts` — use workspaceId
- Update `handlers/terminal.ts` — use workspaceId
- Update `handlers/env.ts` — use workspaceId
- Update `handlers/settings.ts` — use `appState.setSetting()` instead of DB
- Update `handlers/launcher.ts` — use workspaceId
- Remove `handlers/notifications.ts` (or keep ephemeral in-memory only)
- Update `handlers/index.ts` — new registration, new deps
- Delete old service files: `services/projects.ts`, `services/tasks.ts`, `services/settings.ts`

**Verify:** `bun typecheck` on server passes. Server starts without errors.

---

### T8. Create useAppStore — frontend store consolidation

**Deps:** T2

- Create `apps/web/src/stores/app.ts`:
  - State: `projects`, `settings`, `selectedProjectId`, `selectedWorkspaceId`, `initialized`
  - `init()` — calls `state.init` RPC, sets state
  - Selection: `selectProject()`, `selectWorkspace()`
  - Mutations: `createProject()`, `updateProject()`, `deleteProject()`, `createWorkspace()`, `deleteWorkspace()`, `updateSetting()`
  - Push handlers: `onProjectChanged()`, `onWorkspaceChanged()`, `onStateResync()`, `onSettingsChanged()`
  - Selectors: `getProject()`, `getWorkspace()`, `getWorkspacesForProject()`, `selectedProject()`, `selectedWorkspace()`
  - `subscribePush()` — registers all push listeners, returns unsub
- Delete `apps/web/src/stores/projects.ts`
- Delete `apps/web/src/stores/tasks.ts`
- Delete `apps/web/src/stores/settings.ts` (settings now in useAppStore)
- Update `apps/web/src/stores/notifications.ts` — remove persistence methods (markRead, markAllRead), keep ephemeral push subscription

**Verify:** `bun typecheck` on web passes (may have component errors — fixed in T10).

---

### T9. Update other frontend stores

**Deps:** T8

- Update `apps/web/src/stores/sessions.ts`:
  - Key by `workspaceId` instead of `taskId`
  - Update method signatures
- Update `apps/web/src/stores/terminal.ts`:
  - Key by `workspaceId` instead of `taskId`
- Update `apps/web/src/stores/scripts.ts`:
  - `currentWorkspaceId` instead of `currentProjectId` + `currentWorkspace`
  - Update all RPC calls to use workspaceId params
- Update `apps/web/src/stores/sidebar.ts`:
  - `removeProject()` — cleanup only, no store cross-ref needed since useAppStore handles deletions

**Verify:** `bun typecheck` on web passes.

---

### T10. Update UI components

**Deps:** T7, T8, T9

- Update `apps/web/src/routes/__root.tsx`:
  - Replace `loadSettings()` + `loadNotifications()` with `useAppStore.init()`
  - Single `subscribePush()` from useAppStore
- Update `apps/web/src/routes/index.tsx`:
  - Use `useAppStore` instead of `useProjectStore` + `useTaskStore`
- Update all components that reference `Task` type → `Workspace`:
  - Sidebar components (ProjectTree, etc.)
  - TaskWorkspace → WorkspaceView (or similar rename)
  - Session list components
  - Terminal components
  - Scripts panel components
  - Env management components
  - Prompt editor components
  - Create/delete dialogs
- Update all `taskId` references → `workspaceId`
- Update all `task.slug` / `task.name` → `workspace.slug` / `workspace.name`

**Verify:** `bun typecheck` and `bun lint` pass. App renders without crashes.

---

### T11. Delete DB infrastructure

**Deps:** T7

- Delete `apps/server/src/db.ts`
- Delete `apps/server/src/db/schema.ts`
- Delete `apps/server/src/db/migrations/` directory
- Remove `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `@electron/rebuild` (if only for sqlite) from `apps/server/package.json`
- Remove any drizzle config files (`drizzle.config.ts`, etc.)
- Run `bun install`

**Verify:** `bun typecheck` passes. No import errors for db/drizzle.

---

### T12. Final verification

**Deps:** T10, T11

- `bun fmt`
- `bun lint`
- `bun typecheck`
- `bun build:desktop`
- Manual smoke test: start app, create project, create workspace, see it in sidebar, delete workspace, delete project
- Verify FS watcher: edit a project.json externally, see UI update

**Verify:** All checks green. App works end-to-end.
