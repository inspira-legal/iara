# State & Data Persistence Refactor

## Context

The current architecture has friction:

1. **No unified workspace entity.** "Default" is implicit (just a directory), tasks are DB records. Code constantly branches on `workspace === "default"` vs task-based.
2. **DB duplicates filesystem.** Projects are folders on disk AND rows in SQLite. `syncProjects()` must reconcile them on every load. Tasks similarly — FS has the directory, DB has the metadata.
3. **Lazy loading makes the app feel slow.** Each store fetches independently via RPC on navigation. Projects load, then tasks load, then sessions load — cascading spinners.
4. **Cross-store sync bugs.** Documented in `review-all-states/spec.md` — deleting a project doesn't clean tasks store, cache invalidation is incomplete, etc.

## Goals

- **G1:** Unified `Workspace` entity — default and task workspaces are the same type, same code paths
- **G2:** Filesystem as single source of truth — zero DB for domain data
- **G3:** Instant app — global state pre-loaded at startup, no cascading loads
- **G4:** FS watcher drives state — changes on disk propagate to UI automatically
- **G5:** Fix all cross-store sync issues from `review-all-states/spec.md`
- **G6:** JSON file abstraction with Zod validation for all persisted data

## Requirements

### R1. JSON File Abstraction

- **R1.1:** Create a generic `JsonFile<T>` abstraction that:
  - Reads a JSON file from disk and parses it
  - Validates with a Zod schema, returning typed `T`
  - Writes typed `T` to disk (serialize + atomic write via temp file + rename)
  - Returns `null` (or error) if file doesn't exist or validation fails
- **R1.2:** All domain JSON files (`project.json`, `workspace.json`, `settings.json`) use this abstraction.
- **R1.3:** Zod schemas live in `packages/contracts` alongside the TypeScript types — single source of truth for shape + validation.

### R2. Workspace Entity

- **R2.1:** A `Workspace` is any directory inside a project that contains a `workspace.json`. Both `default/` and `task-slug/` are workspaces.
- **R2.2:** A directory is only recognized as a valid workspace if it contains `workspace.json`. Directories without it are ignored.
- **R2.3:** Each workspace has a `workspace.json` file in its root:

  ```json
  {
    "type": "default",
    "name": "Default",
    "description": "",
    "createdAt": "2026-03-20T..."
  }
  ```

  ```json
  {
    "type": "task",
    "name": "Fix login bug",
    "description": "...",
    "branch": "feat/fix-login",
    "createdAt": "2026-03-20T..."
  }
  ```

  - For `type: "default"`, `branch` is omitted (uses repo's current branch).
  - For `type: "task"`, `branch` is the worktree branch.

- **R2.4:** `workspace.json` is the source of truth for workspace metadata. No DB record for workspaces.
- **R2.5:** The `tasks` DB table is removed. No migration — clean break.
- **R2.6:** Workspace ID format: `${projectSlug}/${workspaceSlug}` (e.g., `my-app/default`, `my-app/fix-login`).

### R3. Project Metadata on Filesystem

- **R3.1:** A directory is only recognized as a valid project if it contains `project.json`. Directories without it are ignored.
- **R3.2:** Each project has a `project.json` in its root (`~/.config/iara/projects/{slug}/project.json`):
  ```json
  {
    "name": "My App",
    "description": "...",
    "repoSources": ["https://github.com/org/repo"],
    "createdAt": "2026-03-20T..."
  }
  ```
- **R3.3:** `project.json` is the source of truth. The `projects` DB table is dropped.
- **R3.4:** `syncProjects()` is replaced by FS scanning — read `project.json` from each project dir. No reconciliation needed.
- **R3.5:** Project ID = slug (directory name). No UUIDs.
- **R3.6:** No migration — clean break. Users recreate projects.

### R4. Settings on Filesystem

- **R4.1:** App settings move from SQLite `settings` table to `~/.config/iara/settings.json`.
- **R4.2:** `settings.json` validated with Zod schema via `JsonFile<T>` abstraction.
- **R4.3:** `settings` DB table is removed. No migration.

### R5. Port Allocation Derived from Workspace ID

- **R5.1:** Port allocation is deterministic — derived from workspace ID hash, no DB table needed.
- **R5.2:** Algorithm: hash `workspace.id` → map to a port range (e.g., base 3773, 20-port spacing, modulo to avoid collisions).
- **R5.3:** `port_allocations` DB table is dropped.
- **R5.4:** Collision detection at runtime: if a port is already in use, increment and retry.

### R6. No DB

- **R6.1:** SQLite is fully removed. All persistence is JSON files on the filesystem.
- **R6.2:** Drizzle ORM, better-sqlite3, and all migration infrastructure are removed as dependencies.
- **R6.3:** No migration code. Old DB file is simply ignored/deleted.

### R7. Notifications — No Persistence

- **R7.1:** Notifications are ephemeral — in-memory only, lost on restart.
- **R7.2:** Remove notification persistence (DB table or any file).
- **R7.3:** Notifications store stays as Zustand (runtime state, push events).

### R8. Global State at Startup

- **R8.1:** Server scans all projects and workspaces at startup, builds full state tree in memory.
- **R8.2:** A single `"state.init"` RPC returns the entire app state on connect:
  ```typescript
  {
    projects: Project[]  // each with workspaces[] nested
    settings: Record<string, string>
  }
  ```
- **R8.3:** Renderer receives full state in one shot. No cascading loads. No individual `projects.list` + `tasks.list` calls at startup.
- **R8.4:** Sidebar UI state (expanded, order, width) stays in localStorage — pure UI, not domain data.

### R9. FS Watcher Drives State

- **R9.1:** Server watches `~/.config/iara/projects/` for:
  - `project.json` changes → push `"project:changed"` with updated project
  - `workspace.json` changes → push `"workspace:changed"` with updated workspace
  - New/deleted project directories (containing `project.json`) → push `"state:resync"` with full state
  - New/deleted workspace directories (containing `workspace.json`) → push `"state:resync"` with full state
- **R9.2:** Renderer subscribes to push events and updates global store. No manual refetch needed.
- **R9.3:** Debounce FS events (100ms) to batch rapid changes.
- **R9.4:** "Own write" tracking — when server writes a JSON file, suppress the watcher event to avoid echo loops.

### R10. Contracts Update

- **R10.1:** New `Workspace` type + Zod schema in contracts:
  ```typescript
  interface Workspace {
    id: string; // derived: `${projectSlug}/${workspaceSlug}`
    projectId: string; // project slug
    slug: string; // directory name
    type: "default" | "task";
    name: string;
    description: string;
    branch?: string; // only for task workspaces
    createdAt: string;
  }
  ```
- **R10.2:** `Project` type updated + Zod schema:
  ```typescript
  interface Project {
    id: string; // slug (directory name)
    slug: string;
    name: string;
    description: string;
    repoSources: string[];
    workspaces: Workspace[];
    createdAt: string;
  }
  ```
- **R10.3:** `Task` type removed from contracts. All code migrates to `Workspace`.
- **R10.4:** Zod schemas for `project.json` and `workspace.json` file formats (subset of the full types — file doesn't contain derived fields like `id`).

### R11. Store Consolidation

- **R11.1:** Replace `useProjectStore` + `useTaskStore` with a single `useAppStore` that holds the full state tree from `state.init`.
- **R11.2:** `useAppStore` exposes derived selectors: `projects()`, `workspaces(projectId)`, `selectedProject()`, `selectedWorkspace()`.
- **R11.3:** Push events update `useAppStore` directly — no refetch, just patch.
- **R11.4:** Terminal, scripts, sessions stores remain separate (ephemeral/runtime state) but reference workspaces by `workspace.id`.
- **R11.5:** Fix all issues from `review-all-states/spec.md` (P1-P8) as part of consolidation.

## Non-Requirements

- **NR1:** No changes to scripts.yaml format or orchestrator package
- **NR2:** No changes to Claude session reading (still reads JSONL from Claude's dirs)
- **NR3:** No changes to env file format or symlink strategy
- **NR4:** No changes to socket/hooks/plugin-dir system
- **NR5:** No changes to Electron IPC or window management

## Migration

- No backward compatibility. Old DB is ignored — users recreate projects.
- No migration code needed.

## Risks

- **RISK1:** FS watching on large project trees may have performance impact → mitigate with targeted watch paths (only `project.json` and `workspace.json` patterns)
- **RISK2:** Race conditions between FS writes and watches → mitigate with debounce + "own write" tracking
- **RISK4:** Port hash collisions → mitigate with runtime collision detection + retry
