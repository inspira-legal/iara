# Design: iara-scripts

## Architecture Overview

The scripts system is a vertical slice across all layers: contracts (types) → server (services + handlers) → web (stores + components). It replaces the dev servers subsystem entirely.

```
┌─────────────────────────────────────────────────────┐
│ packages/contracts                                  │
│  ipc.ts: ScriptConfig, ServiceDef, ScriptEntry      │
│  ws.ts:  scripts.* methods, scripts:* push events   │
│  models.ts: ServiceStatus, PortAllocation           │
├─────────────────────────────────────────────────────┤
│ packages/orchestrator (NEW workspace package)            │
│  src/supervisor.ts:   ScriptSupervisor              │
│  src/ports.ts:        PortAllocator                 │
│  src/parser.ts:       scripts.yaml parser           │
│  src/discovery.ts:    Claude discovery prompt/logic  │
│  src/interpolation.ts: {service.PORT} resolver      │
├─────────────────────────────────────────────────────┤
│ apps/server                                         │
│  handlers/scripts.ts: WS method registration        │
│  db/schema.ts:        port_allocations table        │
│  (wires packages/orchestrator into WS + DB)              │
├─────────────────────────────────────────────────────┤
│ apps/web                                            │
│  stores/scripts.ts:       Zustand store             │
│  components/ScriptsPanel.tsx: Sidebar panel          │
│  components/ScriptOutput.tsx: Bottom panel terminal  │
│  components/Sidebar.tsx:  Restructured layout        │
└─────────────────────────────────────────────────────┘
```

### Why a workspace package?

- **Testable independently** — supervisor, parser, port allocator all unit-testable without server/DB
- **Clean separation** — server only wires WS methods to package functions, passes DB callbacks
- **Same pattern as `packages/shared`** — explicit subpath exports (`@iara/orchestrator/supervisor`, `@iara/orchestrator/parser`, etc.)
- **No DB dependency** — package takes port persistence as injected callbacks, server provides the DB implementation

## Data Flow

### scripts.yaml Lifecycle

```
1. Project created → repos cloned
2. Auto-discovery: claude -p analyzes repos → writes scripts.yaml
3. User selects workspace (default or task)
4. UI requests scripts.load → server reads/parses scripts.yaml
5. Server resolves PORTs for workspace → returns config with resolved ports
6. User clicks play → server spawns process, health checks, pushes status
7. User edits scripts.yaml manually → server watches file, pushes reload
```

### Port Resolution Flow

```
scripts.load(projectId, workspace)
  ├── Read scripts.yaml
  ├── Get/create port allocation for workspace
  │   ├── Workspace already has allocation? → reuse
  │   └── New workspace? → allocate next range from global counter
  ├── For each service:
  │   ├── Has `port: N`? → pinned, use N
  │   └── No port field? → assign base + offset (0, 1, 2...)
  ├── Interpolate {service.PORT} in all env values and script commands
  └── Return resolved config
```

## Contracts Layer (`packages/contracts`)

### New Types in `ipc.ts`

```typescript
// Output visibility levels
type ScriptOutputLevel = "always" | "on-error" | "on-warning" | "silent";

// A single script entry (after parsing short/long forms)
interface ScriptEntry {
  run: string[]; // always normalized to array
  output: ScriptOutputLevel;
}

// Well-known essencial keys
type EssencialKey = "setup" | "dev" | "build" | "check" | "test" | "codegen";

// A service definition (parsed from scripts.yaml)
interface ServiceDef {
  name: string;
  dependsOn: string[];
  port: number | null; // null = auto-assigned
  timeout: number; // seconds, default 30
  env: Record<string, string>; // raw, before interpolation
  essencial: Partial<Record<EssencialKey, ScriptEntry>>;
  advanced: Record<string, ScriptEntry>;
  isRepo: boolean; // matched a repo name
}

// Resolved config (ports interpolated)
interface ResolvedServiceDef extends ServiceDef {
  resolvedPort: number; // actual port (pinned or auto)
  resolvedEnv: Record<string, string>; // after {x.PORT} interpolation
}

// Runtime status of a running script
interface ScriptStatus {
  service: string;
  script: string; // e.g., "dev", "build", "setup"
  pid: number | null;
  health: "starting" | "healthy" | "unhealthy" | "stopped" | "running" | "success" | "failed";
  exitCode: number | null;
}

// What the UI receives
interface ScriptsConfig {
  services: ResolvedServiceDef[];
  statuses: ScriptStatus[];
  hasFile: boolean; // scripts.yaml exists
}
```

### New WS Methods in `ws.ts`

```typescript
// Scripts
"scripts.load":     { params: { projectId: string; workspace: string }; result: ScriptsConfig };
"scripts.run":      { params: { projectId: string; workspace: string; service: string; script: string }; result: void };
"scripts.stop":     { params: { service: string; script: string }; result: void };
"scripts.runAll":   { params: { projectId: string; workspace: string; category: EssencialKey }; result: void };
"scripts.stopAll":  { params: Record<string, never>; result: void };
"scripts.status":   { params: Record<string, never>; result: ScriptStatus[] };
"scripts.logs":     { params: { service: string; script: string; limit?: number }; result: string[] };
"scripts.discover": { params: { projectId: string }; result: { requestId: string } };
```

### New Push Events in `ws.ts`

```typescript
"scripts:status":   { service: string; script: string; status: ScriptStatus };
"scripts:log":      { service: string; script: string; line: string };
"scripts:reload":   {};  // scripts.yaml changed on disk
```

### Remove from contracts

- `DevCommand` interface
- `DevServerStatus` interface
- All `dev.*` method types
- `dev:healthy` and `dev:log` push events

## Scripts Package (`packages/orchestrator`)

Package with explicit subpath exports: `@iara/orchestrator/supervisor`, `@iara/orchestrator/parser`, `@iara/orchestrator/ports`, `@iara/orchestrator/discovery`, `@iara/orchestrator/interpolation`. Build: tsdown → ESM+CJS+DTS (same as contracts).

### PortAllocator (`src/ports.ts`)

```typescript
// Injected persistence — package has no DB dependency
interface PortStore {
  get(projectId: string, workspace: string): number | null;
  set(projectId: string, workspace: string, basePort: number): void;
  remove(projectId: string, workspace: string): void;
  getNextBase(): number;
  setNextBase(port: number): void;
}

class PortAllocator {
  constructor(store: PortStore);

  /** Get or create port allocation for a workspace */
  allocate(projectId: string, workspace: string): number;

  /** Release ports when task is deleted */
  release(projectId: string, workspace: string): void;

  /** Resolve ports for all services in a config */
  resolve(services: ServiceDef[], basePort: number): Map<string, number>;
}
```

**Allocation strategy:**

- `getNextBase()` starts at 3000, increments by 20 per allocation
- `resolve()`: iterate services in definition order, skip pinned, assign base+0, base+1, etc.

**DB table** (implemented in server, passed to package via `PortStore`):

```sql
CREATE TABLE port_allocations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  base_port INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, workspace)
);
```

### ScriptSupervisor (`src/supervisor.ts`)

Generalized from DevServerSupervisor. Manages process lifecycle for all script types.

```typescript
class ScriptSupervisor {
  constructor(pushFn: PushFn);

  /** Start a script. Resolves env and cwd. */
  start(opts: {
    service: string;
    script: string;
    commands: string[]; // sequential commands to run
    cwd: string;
    env: Record<string, string>;
    port: number; // for health check
    output: ScriptOutputLevel;
    isLongRunning: boolean; // dev = true, others = false
  }): void;

  /** Stop a running script */
  stop(service: string, script: string): void;

  /** Stop all running scripts */
  stopAll(): void;

  /** Get status of all running scripts */
  status(): ScriptStatus[];

  /** Get buffered logs */
  logs(service: string, script: string, limit?: number): string[];

  /** Run essencial category for all services respecting dependsOn */
  async runAll(opts: {
    category: EssencialKey;
    services: ResolvedServiceDef[];
    cwd: (service: string) => string;
  }): Promise<void>;
}
```

**Key behaviors:**

- `runAll` performs topological sort on `dependsOn`, starts services in order
- For `dev` category: start service, then wait for TCP health on `resolvedPort` before starting dependents (30s or custom timeout)
- For one-shot categories (setup, build, check, test, codegen): run sequentially per service, wait for exit code 0 before starting dependents
- Health check: same TCP connect logic as current DevServerSupervisor (3s interval, retries = timeout/3)
- Log buffer: 1000 lines per script instance
- Push events: `scripts:status` on state change, `scripts:log` per line

### ScriptDiscovery (`src/discovery.ts`)

```typescript
async function discoverScripts(projectId: string, pushFn: PushFn): Promise<string> {
  // 1. Get project, list repos
  // 2. Build prompt: analyze each repo's build config
  // 3. Spawn `claude -p` with prompt, stream progress via pushFn
  // 4. Parse YAML output
  // 5. Write to <projectDir>/scripts.yaml
  // 6. Return requestId for tracking
}
```

**Claude prompt template:**

- Lists all repos with their detected files (package.json, Makefile, etc.)
- Provides the scripts.yaml schema with examples
- Instructs to use `{service.PORT}` syntax (never bare `{PORT}`)
- If existing scripts.yaml provided, instructs to merge/update

### scripts.yaml Parser (`src/parser.ts`)

```typescript
function parseScriptsYaml(content: string): ServiceDef[];
function normalizeScriptEntry(key: string, value: unknown): ScriptEntry;
// Handles: string → { run: [string], output: default }
//          string[] → { run: string[], output: default }
//          { run, output } → as-is
// Defaults: dev → output: "always", rest → output: "on-error"
```

## Server Layer (`apps/server`)

Server is a thin wiring layer — it provides DB-backed `PortStore`, registers WS handlers, and delegates to `packages/orchestrator`.

### Handler Registration (`handlers/scripts.ts`)

```typescript
function registerScriptHandlers(
  supervisor: ScriptSupervisor,
  portAllocator: PortAllocator,
): void {
  registerMethod("scripts.load", async (params) => { ... });
  registerMethod("scripts.run", async (params) => { ... });
  registerMethod("scripts.stop", async (params) => { ... });
  registerMethod("scripts.runAll", async (params) => { ... });
  registerMethod("scripts.stopAll", async () => { ... });
  registerMethod("scripts.status", async () => { ... });
  registerMethod("scripts.logs", async (params) => { ... });
  registerMethod("scripts.discover", async (params) => { ... });
}
```

### DB PortStore Implementation

Implements `PortStore` interface using Drizzle + `port_allocations` table + `settings` table (for `ports.next_base`).

### File Watcher

Watch `scripts.yaml` for changes (fs.watch). On change:

1. Re-parse
2. Push `scripts:reload` event
3. UI re-fetches config

## Web Layer (`apps/web`)

### Scripts Store (`stores/scripts.ts`)

```typescript
interface ScriptsState {
  config: ScriptsConfig | null;
  loading: boolean;
  discovering: boolean;
}

interface ScriptsActions {
  loadConfig(projectId: string, workspace: string): Promise<void>;
  runScript(projectId: string, workspace: string, service: string, script: string): Promise<void>;
  stopScript(service: string, script: string): Promise<void>;
  runAll(projectId: string, workspace: string, category: EssencialKey): Promise<void>;
  stopAll(): Promise<void>;
  discover(projectId: string): Promise<void>;
  subscribePush(): () => void;
}
```

### Sidebar Store Changes (`stores/sidebar.ts`)

```diff
- devServerPanelOpen: boolean;
- toggleDevServerPanel(): void;
+ scriptsPanelOpen: boolean;
+ toggleScriptsPanel(): void;
```

LocalStorage key bumped to `"iara:sidebar-state:v2"`.

### Component Changes

**Sidebar.tsx:**

- Header: add Settings icon button (gear icon, navigates to /settings)
- Remove DevServerPanel import and usage
- Remove Settings footer section
- Add ScriptsPanel in the bottom sticky area
- Remove devserver-related effects (discoverCommands)

**ScriptsPanel.tsx** (new):

- Collapsible header: "Scripts" + chevron + running count badge
- Empty state: "Discover Scripts" button (when `hasFile === false`)
- Service list: grouped by service, essencial scripts shown with play/stop
- Quick actions bar: "Setup All", "Dev All" buttons
- Status dots per service (green = healthy, yellow = starting, red = failed)
- Click script → opens ScriptOutput in bottom panel

**ScriptOutput.tsx** (new):

- Bottom panel (resizable, like a terminal panel)
- Tab per running script with output level `always`
- Auto-opens on error for `on-error` scripts
- Auto-opens on warning for `on-warning` scripts
- Never opens for `silent` scripts
- Scrollable log output, auto-scroll to bottom

**ProjectNode.tsx / TaskNode.tsx:**

- Add running service indicator (small colored dots or count badge)
- Shows when any scripts are running in that workspace

## Migration Plan

### Files to Delete

- `apps/server/src/services/devservers.ts`
- `apps/server/src/handlers/devservers.ts`
- `apps/web/src/stores/devservers.ts`
- `apps/web/src/components/DevServerPanel.tsx`

### Package to Create

- `packages/orchestrator/` — new workspace package
  - `src/supervisor.ts` (ScriptSupervisor)
  - `src/ports.ts` (PortAllocator)
  - `src/discovery.ts` (Claude discovery)
  - `src/parser.ts` (scripts.yaml parser)
  - `src/interpolation.ts` ({service.PORT} resolver)
  - `package.json`, `tsconfig.json`, `tsdown.config.ts`

### Files to Create

- `apps/server/src/handlers/scripts.ts`
- `apps/server/src/services/port-store.ts` (DB-backed PortStore impl)
- `apps/web/src/stores/scripts.ts`
- `apps/web/src/components/ScriptsPanel.tsx`
- `apps/web/src/components/ScriptOutput.tsx`
- DB migration: `port_allocations` table

### Files to Modify

- `packages/contracts/src/ipc.ts` — add script types, remove dev types
- `packages/contracts/src/ws.ts` — add scripts._ methods, remove dev._ methods
- `packages/contracts/src/models.ts` — add ScriptStatus if needed
- `apps/server/src/router.ts` or main entry — register new handlers
- `apps/server/src/db/schema.ts` — add port_allocations table
- `apps/web/src/components/Sidebar.tsx` — restructure layout
- `apps/web/src/components/ProjectNode.tsx` — add running indicator
- `apps/web/src/components/TaskNode.tsx` — add running indicator
- `apps/web/src/stores/sidebar.ts` — rename panel state
- `apps/server/src/services/projects.ts` — trigger auto-discovery on create
- `apps/server/src/services/tasks.ts` — release ports on task delete

## Dependency Graph

```
packages/contracts (types) ← no deps
    ↓
packages/orchestrator ← contracts only (no DB, no server)
    ↓
apps/server ← contracts, scripts, shared
    ↓
apps/web ← contracts
```

Build order: contracts → scripts → server → web (Turbo pipeline updated).
