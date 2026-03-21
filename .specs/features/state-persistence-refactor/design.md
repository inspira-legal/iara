# State & Data Persistence Refactor — Design

## 1. JsonFile\<T\> Abstraction

**Location:** `packages/shared/src/json-file.ts`, exported via `@iara/shared/json-file`

Replaces `safeReadJson`/`safeWriteJson` in `packages/shared/src/fs.ts` with Zod-validated, atomic-write alternative.

```typescript
import { type ZodSchema } from "zod";

export class JsonFile<T> {
  constructor(
    private readonly filePath: string,
    private readonly schema: ZodSchema<T>,
  ) {}

  /** Read + validate. Returns null if file missing or invalid. */
  read(): T | null;

  /** Read + validate. Throws if file missing or invalid. */
  readOrThrow(): T;

  /** Validate + atomic write (write to .tmp, rename). */
  write(data: T): void;

  /** Check if file exists on disk. */
  exists(): boolean;

  /** Delete file if it exists. */
  delete(): void;

  /** Full path for external use (watcher, logging). */
  get path(): string;
}
```

**Atomic write:** Write to `${filePath}.tmp` then `fs.renameSync()`. This prevents partial reads from FS watchers.

**Zod as dependency:** Added to `packages/shared` (runtime dep) and `packages/contracts` (for schema definitions). Zod is already in the server — now shared across packages.

## 2. Zod Schemas in Contracts

**Location:** `packages/contracts/src/schemas.ts`

Schemas define the **file format** (what's stored on disk). The TypeScript interfaces define the **runtime type** (what's used in code, includes derived fields like `id`).

```typescript
import { z } from "zod";

// --- File schemas (what's on disk) ---

export const ProjectFileSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  repoSources: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type ProjectFile = z.infer<typeof ProjectFileSchema>;

export const WorkspaceFileSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("default"),
    name: z.string(),
    description: z.string().default(""),
    createdAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal("task"),
    name: z.string(),
    description: z.string().default(""),
    branch: z.string(),
    createdAt: z.string().datetime(),
  }),
]);
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;

export const SettingsFileSchema = z.record(z.string(), z.string());
export type SettingsFile = z.infer<typeof SettingsFileSchema>;
```

**Runtime types** (in `models.ts`, derived from file + directory context):

```typescript
export interface Workspace {
  id: string; // `${projectSlug}/${workspaceSlug}`
  projectId: string; // project slug
  slug: string; // directory name
  type: "default" | "task";
  name: string;
  description: string;
  branch?: string;
  createdAt: string;
}

export interface Project {
  id: string; // slug (directory name)
  slug: string;
  name: string;
  description: string;
  repoSources: string[];
  workspaces: Workspace[];
  createdAt: string;
}
```

**Key difference:** File schemas don't have `id`, `slug`, `projectId`, `workspaces[]` — those are derived at read time from the directory structure.

**contracts/package.json update:** Add `zod` as a dependency. Change exports to include both types and runtime schemas:

```json
{
  "dependencies": { "zod": "^3.x" },
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./src/index.ts" },
    "./schemas": { "types": "./src/schemas.ts", "import": "./src/schemas.ts" }
  }
}
```

## 3. Port Allocation — Hash-Based

**Location:** Replace `PortStore` interface + DB implementation with a pure function in `packages/orchestrator/src/ports.ts`.

**Algorithm:**

```typescript
import { createHash } from "node:crypto";

const PORT_START = 3000;
const PORT_SPACING = 20;
const PORT_RANGE = 1000; // 50 workspaces × 20 ports = 1000 ports total
// Port range: 3000–3999

export function deriveBasePort(workspaceId: string): number {
  const hash = createHash("md5").update(workspaceId).digest();
  const num = hash.readUInt32BE(0);
  const slot = num % Math.floor(PORT_RANGE / PORT_SPACING); // 0–49
  return PORT_START + slot * PORT_SPACING;
}
```

**Collision handling:** `PortAllocator` becomes simpler:

```typescript
export class PortAllocator {
  private allocated = new Map<string, number>(); // workspaceId → basePort

  allocate(workspaceId: string): number {
    const existing = this.allocated.get(workspaceId);
    if (existing !== undefined) return existing;

    let base = deriveBasePort(workspaceId);

    // Collision: another workspace has same hash slot → linear probe
    const usedPorts = new Set(this.allocated.values());
    while (usedPorts.has(base)) {
      base += PORT_SPACING;
      if (base >= PORT_START + PORT_RANGE) base = PORT_START; // wrap
    }

    this.allocated.set(workspaceId, base);
    return base;
  }

  release(workspaceId: string): void {
    this.allocated.delete(workspaceId);
  }

  resolve(services: ServiceDef[], basePort: number): Map<string, number> {
    // unchanged — same logic
  }
}
```

**No PortStore interface.** No DB. No settings for `nextBase`. Pure in-memory + deterministic hash. The `PortAllocator` constructor takes no arguments.

**Change in orchestrator/ports.ts:** Remove `PortStore` interface, `PORT_START` export stays, add `deriveBasePort`. Update `PortAllocator` as above.

**Delete:** `apps/server/src/services/port-store.ts` entirely.

## 4. Server State Tree

**Location:** `apps/server/src/services/state.ts`

The server maintains an in-memory state tree, built at startup by scanning the filesystem. This replaces `syncProjects()` and all DB queries.

```typescript
import { JsonFile } from "@iara/shared/json-file";
import { ProjectFileSchema, WorkspaceFileSchema } from "@iara/contracts/schemas";

interface StateTree {
  projects: Project[];
  settings: Record<string, string>;
}

class AppState {
  private state: StateTree;
  private settingsFile: JsonFile<SettingsFile>;

  constructor(
    private readonly projectsDir: string,
    private readonly stateDir: string,
  ) {
    this.settingsFile = new JsonFile(path.join(stateDir, "settings.json"), SettingsFileSchema);
    this.state = this.scan();
  }

  /** Full scan — read all project.json + workspace.json from disk. */
  scan(): StateTree {
    const settings = this.settingsFile.read() ?? {};
    const projects: Project[] = [];

    for (const entry of fs.readdirSync(this.projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectDir = path.join(this.projectsDir, entry.name);
      const projectFile = new JsonFile(path.join(projectDir, "project.json"), ProjectFileSchema);
      const data = projectFile.read();
      if (!data) continue; // No project.json → not a valid project

      const workspaces = this.scanWorkspaces(entry.name, projectDir);
      projects.push({
        id: entry.name,
        slug: entry.name,
        ...data,
        workspaces,
      });
    }

    return { projects, settings };
  }

  private scanWorkspaces(projectSlug: string, projectDir: string): Workspace[] {
    const workspaces: Workspace[] = [];
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const wsDir = path.join(projectDir, entry.name);
      const wsFile = new JsonFile(path.join(wsDir, "workspace.json"), WorkspaceFileSchema);
      const data = wsFile.read();
      if (!data) continue; // No workspace.json → not a valid workspace

      workspaces.push({
        id: `${projectSlug}/${entry.name}`,
        projectId: projectSlug,
        slug: entry.name,
        ...data,
      });
    }
    return workspaces;
  }

  /** Get full state for state.init RPC. */
  getState(): StateTree {
    return this.state;
  }

  /** Get single project. */
  getProject(slug: string): Project | null;

  /** Get single workspace. */
  getWorkspace(workspaceId: string): Workspace | null;

  /** Rescan a single project (after project.json or workspace.json change). */
  rescanProject(slug: string): Project | null;

  /** Settings CRUD — reads/writes settings.json. */
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  getAllSettings(): Record<string, string>;
}
```

**Lifecycle:** Created once in `main.ts`. Passed to all handlers via dependency injection (same pattern as today's `HandlerDeps`).

## 5. FS Watcher

**Location:** `apps/server/src/services/watcher.ts`

Uses `fs.watch` (recursive) on the projects directory. Filters for `project.json` and `workspace.json` changes only.

```typescript
class ProjectsWatcher {
  private watcher: fs.FSWatcher | null = null;
  private ownWrites = new Set<string>(); // paths we wrote recently
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges = new Map<string, "project" | "workspace">();

  constructor(
    private readonly projectsDir: string,
    private readonly appState: AppState,
    private readonly pushFn: PushAllFn,
  ) {}

  start(): void {
    this.watcher = fs.watch(this.projectsDir, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const basename = path.basename(filename);
      if (basename !== "project.json" && basename !== "workspace.json") return;

      const fullPath = path.join(this.projectsDir, filename);
      if (this.ownWrites.delete(fullPath)) return; // suppress echo

      const type = basename === "project.json" ? "project" : "workspace";
      this.pendingChanges.set(filename, type);
      this.schedulFlush();
    });
  }

  /** Mark a path as "we wrote this, don't trigger". */
  suppressNext(fullPath: string): void {
    this.ownWrites.add(fullPath);
    // Auto-expire after 1s in case the write doesn't trigger a watch event
    setTimeout(() => this.ownWrites.delete(fullPath), 1000);
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), 100);
  }

  private flush(): void {
    // Group changes, determine if full resync needed
    let needsFullResync = false;

    for (const [filename, type] of this.pendingChanges) {
      const parts = filename.split(path.sep);
      const projectSlug = parts[0];

      if (type === "project") {
        // project.json changed → rescan that project
        const project = this.appState.rescanProject(projectSlug);
        if (project) {
          this.pushFn("project:changed", { project });
        } else {
          needsFullResync = true; // project deleted
        }
      } else {
        // workspace.json changed → rescan parent project
        const project = this.appState.rescanProject(projectSlug);
        if (project) {
          const wsSlug = parts[1];
          const workspace = project.workspaces.find((w) => w.slug === wsSlug);
          if (workspace) {
            this.pushFn("workspace:changed", { workspace });
          } else {
            needsFullResync = true;
          }
        }
      }
    }

    if (needsFullResync) {
      this.appState.scan(); // full rescan
      this.pushFn("state:resync", { state: this.appState.getState() });
    }

    this.pendingChanges.clear();
  }

  stop(): void {
    this.watcher?.close();
  }
}
```

**Platform note:** `fs.watch` with `recursive: true` works on macOS and Windows natively, and on Linux with Node.js 19+. Since we're on Electron 40 (Node 22+), this is fine.

## 6. WS Protocol Changes

### New push events

```typescript
// Add to WsPushEvents
"project:changed": { project: Project }
"workspace:changed": { workspace: Workspace }
"state:resync": { state: { projects: Project[]; settings: Record<string, string> } }
```

### New RPC method

```typescript
// Add to WsMethods
"state.init": {
  params: Record<string, never>;
  result: { projects: Project[]; settings: Record<string, string> };
}
```

### Removed RPC methods

```
projects.list → replaced by state.init
projects.get  → client reads from local store
tasks.list    → replaced by state.init (workspaces nested in projects)
tasks.get     → client reads from local store
settings.getAll → replaced by state.init
settings.get    → client reads from local store
```

### Renamed/updated RPC methods

```
tasks.create      → workspaces.create  (params: { projectId, name, description, branch })
tasks.delete      → workspaces.delete  (params: { workspaceId })
tasks.suggest     → workspaces.suggest (params: { projectId, userGoal })
tasks.regenerate  → workspaces.regenerate (params: { workspaceId })
tasks.renameBranch → workspaces.renameBranch (params: { workspaceId, repoName, newBranch })

sessions.list     → params change: { taskId } → { workspaceId }
sessions.listByProject → unchanged

terminal.create   → params change: { taskId?, projectId?, default? } → { workspaceId }

scripts.load      → params change: { projectId, workspace } → { workspaceId }
scripts.run       → params change: { projectId, workspace, ... } → { workspaceId, ... }
scripts.runAll    → params change: { projectId, workspace, ... } → { workspaceId, ... }
scripts.status    → params change: { projectId, workspace } → { workspaceId }

env.list          → params change: { projectId, workspace } → { workspaceId }
env.write         → params change: { projectId?, workspace?, ... } → { workspaceId?, ... }

launcher.launch   → params update: references workspaceId instead of taskId

notifications.*   → removed (ephemeral, no server persistence)
```

### Push events removed

```
session:changed   → params change: { taskId } → { workspaceId }
notification      → stays (ephemeral push, no persistence)
```

## 7. Store Consolidation (Frontend)

### useAppStore

**Location:** `apps/web/src/stores/app.ts`

Replaces `useProjectStore` + `useTaskStore`. Holds the full state tree.

```typescript
interface AppState {
  // State from server
  projects: Project[];
  settings: Record<string, string>;

  // UI selection state
  selectedProjectId: string | null;
  selectedWorkspaceId: string | null;

  // Loading
  initialized: boolean;
}

interface AppActions {
  // Bootstrap
  init(): Promise<void>; // calls state.init, sets initialized=true

  // Selection
  selectProject(id: string | null): void;
  selectWorkspace(id: string | null): void;

  // Mutations (call server, then update local state from push events)
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: UpdateProjectInput): Promise<void>;
  deleteProject(id: string): Promise<void>;
  createWorkspace(projectId: string, input: CreateWorkspaceInput): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  updateSetting(key: string, value: string): Promise<void>;

  // Push event handlers (patch state directly)
  onProjectChanged(project: Project): void;
  onWorkspaceChanged(workspace: Workspace): void;
  onStateResync(state: { projects: Project[]; settings: Record<string, string> }): void;
  onSettingsChanged(key: string, value: string): void;

  // Derived selectors
  getProject(id: string): Project | undefined;
  getWorkspace(workspaceId: string): Workspace | undefined;
  getWorkspacesForProject(projectId: string): Workspace[];
  selectedProject(): Project | undefined;
  selectedWorkspace(): Workspace | undefined;

  // Push subscription
  subscribePush(): () => void;
}
```

### Other stores — reference by workspaceId

```typescript
// sessions.ts: key changes from taskId to workspaceId
sessionsByWorkspace: Map<string, SessionInfo[]>;

// terminal.ts: key changes from taskId to workspaceId
entries: Map<string, TerminalEntry>; // workspaceId → entry

// scripts.ts: currentWorkspace becomes workspaceId
currentWorkspaceId: string | null;
```

### Sidebar store — stays as-is

Still localStorage-backed, still holds `expandedProjectIds`, `projectOrder`, `sidebarWidth`. References project IDs (slugs now, not UUIDs — but sidebar doesn't care about format).

## 8. Initialization Flow (New)

```
Electron starts
  → spawns server as child process

Server starts (main.ts):
  1. syncShellEnvironment()
  2. new AppState(projectsDir, stateDir)  ← scans all project.json + workspace.json
  3. new PortAllocator()                  ← no args, in-memory
  4. new ProjectsWatcher(projectsDir, appState, pushAll)
  5. watcher.start()
  6. registerAllHandlers({ appState, portAllocator, watcher, ... })
  7. start WS server
  8. start socket server, generate plugin dir, merge hooks

Renderer connects:
  1. WsTransport connects
  2. useAppStore.init() → transport.request("state.init", {})
  3. Server returns full { projects, settings }
  4. Store sets state, initialized=true
  5. subscribePush() registers listeners for project:changed, workspace:changed, state:resync, settings:changed
  6. UI renders immediately — no loading spinners

User navigates:
  - Project/workspace selection = local store update, no server call
  - Sessions load on-demand (still RPC — reads Claude JSONL files)
  - Scripts load on-demand (still RPC — parses scripts.yaml + allocates ports)
```

## 9. Files Changed Summary

### Deleted

- `apps/server/src/db.ts`
- `apps/server/src/db/schema.ts`
- `apps/server/src/db/migrations/*`
- `apps/server/src/services/port-store.ts`
- `apps/server/src/services/settings.ts` (replaced by AppState methods)
- `apps/server/src/services/projects.ts` (replaced by AppState + handler logic)
- `apps/server/src/services/tasks.ts` (replaced by workspace logic in AppState + handlers)
- `apps/web/src/stores/projects.ts`
- `apps/web/src/stores/tasks.ts`

### New

- `packages/shared/src/json-file.ts` — JsonFile\<T\> abstraction
- `packages/contracts/src/schemas.ts` — Zod schemas
- `apps/server/src/services/state.ts` — AppState (in-memory state tree)
- `apps/server/src/services/watcher.ts` — ProjectsWatcher (FS watcher)
- `apps/web/src/stores/app.ts` — useAppStore (consolidated store)

### Modified

- `packages/contracts/src/models.ts` — remove Task, add Workspace, update Project
- `packages/contracts/src/ws.ts` — update WsMethods + WsPushEvents
- `packages/contracts/src/index.ts` — update exports
- `packages/contracts/package.json` — add zod
- `packages/shared/src/fs.ts` — remove safeReadJson/safeWriteJson (replaced by JsonFile)
- `packages/shared/package.json` — add zod, add json-file export
- `packages/orchestrator/src/ports.ts` — remove PortStore, add deriveBasePort, simplify PortAllocator
- `apps/server/src/main.ts` — new startup sequence
- `apps/server/src/handlers/*` — update all handlers to use AppState + workspaceId
- `apps/server/package.json` — remove better-sqlite3, drizzle-orm
- `apps/web/src/routes/__root.tsx` — use useAppStore.init()
- `apps/web/src/stores/sessions.ts` — workspaceId keys
- `apps/web/src/stores/terminal.ts` — workspaceId keys
- `apps/web/src/stores/scripts.ts` — workspaceId references
- `apps/web/src/stores/sidebar.ts` — remove project from removeProject (cleanup)
- All UI components that reference `task`/`taskId` → `workspace`/`workspaceId`
