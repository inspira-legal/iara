# Tasks: iara-scripts

## Phase 1 — Contracts & Package Scaffold

### T1: Add script types to contracts

**Files:** `packages/contracts/src/ipc.ts`
**Do:**

- Add `ScriptOutputLevel`, `ScriptEntry`, `EssencialKey`, `ServiceDef`, `ResolvedServiceDef`, `ScriptStatus`, `ScriptsConfig` types
- Remove `DevCommand`, `DevServerStatus` types
  **Verify:** `bun typecheck` passes, no imports of removed types remain

### T2: Add scripts WS methods and push events to contracts

**Files:** `packages/contracts/src/ws.ts`
**Do:**

- Add `scripts.load`, `scripts.run`, `scripts.stop`, `scripts.runAll`, `scripts.stopAll`, `scripts.status`, `scripts.logs`, `scripts.discover` methods
- Add `scripts:status`, `scripts:log`, `scripts:reload` push events
- Remove `dev.*` methods and `dev:healthy`, `dev:log` push events
  **Verify:** `bun typecheck` passes

### T3: Scaffold packages/orchestrator

**Files:** `packages/orchestrator/package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/index.ts`
**Do:**

- Create package with `@iara/orchestrator` name
- Subpath exports: `./supervisor`, `./parser`, `./ports`, `./discovery`, `./interpolation`
- Depends on `@iara/contracts`
- Build config matching `packages/shared` pattern (tsdown → ESM+CJS+DTS)
- Add to Turbo pipeline: builds after contracts, before server
  **Verify:** `bun install`, `bun build` succeeds for package

---

## Phase 2 — Orchestrator Core (packages/orchestrator)

### T4: scripts.yaml parser

**Files:** `packages/orchestrator/src/parser.ts`
**Do:**

- `parseScriptsYaml(content: string): ServiceDef[]`
- `normalizeScriptEntry(key: string, value: unknown): ScriptEntry`
- Handle short form (string, string[]) and object form ({ run, output })
- Defaults: `dev` → output `always`, rest → `on-error`
- Parse `dependsOn`, `port`, `timeout` (default 30), `env`, `essencial`, `advanced`
- Validate essencial keys against fixed set
- Add `yaml` dependency to package
  **Verify:** Unit tests — parse valid yaml, handle edge cases, reject invalid keys

### T5: Port allocator

**Files:** `packages/orchestrator/src/ports.ts`
**Do:**

- `PortStore` interface (injected persistence)
- `PortAllocator` class: `allocate()`, `release()`, `resolve()`
- Allocation: global counter starts at 3000, increments by 20
- Resolve: iterate services, skip pinned, assign base+0, base+1, etc.
  **Verify:** Unit tests — allocation, no overlap, pinned ports excluded, release

### T6: {service.PORT} interpolation

**Files:** `packages/orchestrator/src/interpolation.ts`
**Do:**

- `interpolate(template: string, ports: Map<string, number>): string`
- Resolves `{service.PORT}` patterns in strings
- Works on both env values and script commands
- Throws on unresolved references (unknown service name)
  **Verify:** Unit tests — single ref, multiple refs, unknown service error

### T7: ScriptSupervisor — process lifecycle

**Files:** `packages/orchestrator/src/supervisor.ts`
**Do:**

- `start()`: spawn child process, pipe stdout/stderr, buffer logs (1000 max), push `scripts:status` and `scripts:log`
- `stop()`: SIGTERM → 3s → SIGKILL
- `stopAll()`: stop all running
- `status()`: return all ScriptStatus[]
- `logs()`: return buffered lines
- Long-running vs one-shot detection (isLongRunning flag)
- TCP health check for long-running scripts (interval 3s, retries = timeout/3)
- Sequential command execution for string[] entries
  **Verify:** Unit tests with mocked child_process — start, stop, health transitions, log buffering

### T8: ScriptSupervisor — dependency orchestration (runAll)

**Files:** `packages/orchestrator/src/supervisor.ts`
**Do:**

- `runAll()`: topological sort on dependsOn graph
- For `dev`: start service → wait for TCP health (30s/custom timeout) → start dependents
- For one-shot: run → wait for exit 0 → start dependents
- Timeout error: don't start dependents, push error status
- Cycle detection in dependency graph
  **Verify:** Unit tests — topo sort, dep wait, timeout, cycle detection

### T9: Script discovery prompt

**Files:** `packages/orchestrator/src/discovery.ts`
**Do:**

- Build Claude prompt template: repo list + detected build files + scripts.yaml schema + examples
- Enforce `{service.PORT}` syntax in prompt (never bare `{PORT}`)
- Parse Claude YAML output, validate against schema
- Handle merge mode (existing scripts.yaml provided)
- Export prompt builder + output parser (spawning claude -p is done by server)
  **Verify:** Unit tests — prompt generation, output parsing, merge logic

---

## Phase 3 — Server Integration

### T10: DB migration — port_allocations table

**Files:** `apps/server/src/db/schema.ts`, new migration file
**Do:**

- Add `port_allocations` table: id, project_id, workspace, base_port, created_at
- Unique constraint on (project_id, workspace)
- Run migration
  **Verify:** `bun run test` passes, table exists

### T11: DB-backed PortStore implementation

**Files:** `apps/server/src/services/port-store.ts`
**Do:**

- Implement `PortStore` interface using Drizzle + port_allocations table
- `getNextBase()` / `setNextBase()` via settings table key `"ports.next_base"`
  **Verify:** Integration test — allocate, get, release

### T12: Register scripts WS handlers

**Files:** `apps/server/src/handlers/scripts.ts`
**Do:**

- `registerScriptHandlers(supervisor, portAllocator)`
- `scripts.load`: read scripts.yaml, parse, resolve ports, attach statuses, return ScriptsConfig
- `scripts.run`: resolve cwd (repo worktree or project root), interpolate, call supervisor.start
- `scripts.stop`: call supervisor.stop
- `scripts.runAll`: resolve all cwds, call supervisor.runAll
- `scripts.stopAll`: call supervisor.stopAll
- `scripts.status`: call supervisor.status
- `scripts.logs`: call supervisor.logs
- `scripts.discover`: spawn claude -p with discovery prompt, write result, push progress
  **Verify:** `bun typecheck` passes

### T13: Wire scripts into server main + remove dev servers

**Files:** `apps/server/src/main.ts` (or entry), `apps/server/src/handlers/devservers.ts` (delete), `apps/server/src/services/devservers.ts` (delete)
**Do:**

- Instantiate PortAllocator with DB-backed PortStore
- Instantiate ScriptSupervisor with pushFn
- Call registerScriptHandlers
- Remove registerDevHandlers call
- Delete devservers service and handler files
- Add scripts.yaml file watcher → push `scripts:reload`
  **Verify:** `bun typecheck`, `bun build:desktop` passes

### T14: Hook into project create + task delete

**Files:** `apps/server/src/services/projects.ts`, `apps/server/src/services/tasks.ts`
**Do:**

- After project creation (repos cloned): trigger script discovery (async, non-blocking)
- On task delete: call portAllocator.release(projectId, taskSlug)
  **Verify:** Create project → scripts.yaml generated. Delete task → port allocation removed.

---

## Phase 4 — Web UI

### T15: Scripts Zustand store

**Files:** `apps/web/src/stores/scripts.ts`
**Do:**

- State: config, loading, discovering, statuses
- Actions: loadConfig, runScript, stopScript, runAll, stopAll, discover
- Push subscriptions: `scripts:status`, `scripts:log`, `scripts:reload`
- On `scripts:reload` → re-fetch config
  **Verify:** Store loads config, updates on push events

### T16: Sidebar restructure

**Files:** `apps/web/src/components/Sidebar.tsx`, `apps/web/src/stores/sidebar.ts`
**Do:**

- Move Settings button to header (gear icon next to BrowserToggle)
- Remove DevServerPanel and its border-t wrapper
- Remove Settings footer section
- Update sidebar store: `devServerPanelOpen` → `scriptsPanelOpen`, bump localStorage key to v2
- Remove devserver store import and discoverCommands effect
- Add ScriptsPanel placeholder in bottom sticky area
  **Verify:** Sidebar renders without dev servers, settings in header, scripts panel placeholder visible

### T17: ScriptsPanel component

**Files:** `apps/web/src/components/ScriptsPanel.tsx`
**Do:**

- Collapsible header: "Scripts" + chevron + running count badge
- Empty state: "Discover Scripts" button when `config.hasFile === false`
- Discovering state: spinner + "Discovering..."
- Service list: service name + essencial scripts as buttons (play/stop icon per script)
- Status dots: green (healthy), yellow (starting), red (failed/unhealthy), gray (stopped)
- Quick actions: "Setup All", "Dev All" buttons at top
- Click script name → dispatch event to open in ScriptOutput bottom panel
  **Verify:** Renders all states (empty, loading, populated, running)

### T18: ScriptOutput bottom panel

**Files:** `apps/web/src/components/ScriptOutput.tsx`
**Do:**

- Bottom panel below main content (resizable height)
- Tab bar: one tab per script with output level `always` or that triggered on-error/on-warning
- Log display: scrollable, auto-scroll, monospace
- Auto-open rules: `always` → always visible, `on-error` → opens on non-zero exit, `on-warning` → opens on stderr output, `silent` → never
- Close/minimize tab
- Subscribe to `scripts:log` push events for visible tabs
  **Verify:** Logs stream in real-time, tabs open/close correctly per output level

### T19: Workspace running indicators

**Files:** `apps/web/src/components/ProjectNode.tsx`, `apps/web/src/components/TaskNode.tsx`
**Do:**

- Show small colored dot or count badge when scripts are running in that workspace
- Green if all healthy, yellow if any starting, red if any failed
- Query from scripts store statuses
  **Verify:** Indicators appear/disappear as scripts start/stop

### T20: Remove devservers store + DevServerPanel

**Files:** `apps/web/src/stores/devservers.ts` (delete), `apps/web/src/components/DevServerPanel.tsx` (delete)
**Do:**

- Delete both files
- Remove all imports across codebase
- Ensure no remaining references
  **Verify:** `bun typecheck`, `bun lint`, `bun build:desktop` all pass

---

## Phase 5 — Polish

### T21: Update CLAUDE.md

**Files:** `CLAUDE.md`
**Do:**

- Add `packages/orchestrator` to Package Roles section
- Update architecture notes to reflect scripts system replacing dev servers
- Document scripts.yaml location and schema reference
- Add `@iara/orchestrator` to dependency/build order
  **Verify:** CLAUDE.md accurately reflects new architecture

### T22: Full build + lint + typecheck pass

**Do:**

- Run `bun fmt`, `bun lint`, `bun typecheck`, `bun build:desktop`
- Fix any remaining issues
  **Verify:** All pass clean

---

## Dependency Graph

```
T1 ─┬─→ T2 ─→ T3 ─┬─→ T4 (parser)
    │               ├─→ T5 (ports)
    │               ├─→ T6 (interpolation)
    │               ├─→ T7 (supervisor)
    │               │     ↓
    │               ├─→ T8 (runAll) ← T7
    │               └─→ T9 (discovery)
    │
    │   T4,T5,T6,T7,T8,T9 ──→ T10 (migration)
    │                              ↓
    │                          T11 (port-store)
    │                              ↓
    │                          T12 (handlers)
    │                              ↓
    │                          T13 (wire + delete devservers)
    │                              ↓
    │                          T14 (hooks: project create, task delete)
    │
    │   T2,T13 ──→ T15 (scripts store)
    │                 ↓
    │              T16 (sidebar restructure)
    │                 ↓
    │              T17 (ScriptsPanel)
    │                 ↓
    │              T18 (ScriptOutput)
    │                 ↓
    │              T19 (workspace indicators)
    │                 ↓
    │              T20 (cleanup devservers)
    │                 ↓
    │              T21 (polish)
```

## Parallel Opportunities

- **T4, T5, T6** can be built in parallel (no deps between them)
- **T7** depends on T6 (interpolation used when starting scripts)
- **T9** is independent of T7/T8 (just prompt building + output parsing)
- **T15** can start as soon as contracts (T2) are done, with mock data
- **T17, T18** can be built in parallel once T15 + T16 are done
