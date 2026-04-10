# File Watcher Refactor Tasks

**Design**: `.specs/features/file-watcher-refactor/design.md`
**Status**: Complete (all 14 tasks done)

---

## Execution Plan

### Phase 1: Foundation (Parallel)

Independent utilities with no cross-dependencies.

```
┌→ T1 (timing primitives)
┼→ T2 (ShallowWatcher)
┼→ T3 (Agent SDK sessions service)
└→ T4 (WorkspaceView useEffect fix)
```

### Phase 2: Contracts + Push Infrastructure (Sequential)

New `state:patch` event, expanded `state.init`, RPC removals, push coalescing.

```
T1, T2, T3 → T5 (contracts) → T6 (push coalescing) → T7 (state.init expansion) → T8 (RPC removal + server push handlers)
```

### Phase 3: Client State Refactor (Sequential)

Client-side `state:patch` handler and store cleanup.

```
T5, T8 → T9 (client state:patch handler) → T10 (log batching)
```

### Phase 4: Watcher Overhaul (Sequential)

Replace @parcel/watcher with ShallowWatcher, merge Projects+Env.

```
T2, T9 → T11 (ProjectsDirWatcher) → T12 (SessionWatcher refactor) → T13 (remove @parcel/watcher)
```

### Phase 5: Git Optimization (Sequential)

Lazy watching for active workspace only.

```
T11, T13 → T14 (GitWatcher lazy watching)
```

---

## Task Breakdown

### T1: Create `@iara/shared/timing` module [P] ✅ (46c3311)

**What**: Implement `createDebounce`, `createKeyedDebounce`, and `createThrottle` timing primitives in `packages/shared/src/timing.ts`. Add `"./timing"` subpath export to `packages/shared/package.json`.
**Where**: `packages/shared/src/timing.ts`, `packages/shared/package.json`
**Depends on**: None
**Reuses**: None (greenfield)
**Requirement**: FW-012

**Done when**:

- [ ] `createDebounce(ms, fn)` exported — single-key debounce with `call()`, `cancel()`, `flush()`
- [ ] `createKeyedDebounce(ms, fn)` exported — per-key debounce with `schedule(key)`, `cancel(key)`, `cancelAll()`, `flush()`
- [ ] `createThrottle(ms, fn)` exported — batching throttle with `push(item)`, `flush()`, `cancel()`
- [ ] `"./timing"` subpath export added to `packages/shared/package.json`
- [ ] Unit tests cover: basic debounce, cancel, flush, keyed debounce batching, keyed cancelAll, throttle batching, throttle flush
- [ ] Zero external dependencies
- [ ] Gate check passes

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun run test`

---

### T2: Create `@iara/shared/shallow-watcher` utility [P] ✅ (46c3311)

**What**: Implement `ShallowWatcher` class wrapping `fs.watch()` with lifecycle management, dynamic add/remove, ENOENT recovery, and event callback. Add `"./shallow-watcher"` subpath export.
**Where**: `packages/shared/src/shallow-watcher.ts`, `packages/shared/package.json`
**Depends on**: None
**Reuses**: `git-watcher.ts:86-97` pattern for `fs.watch()` usage
**Requirement**: FW-012

**Done when**:

- [ ] `ShallowWatcher` class exported with `add(path)`, `remove(path)`, `has(path)`, `size`, `stop()`
- [ ] Constructor accepts `{ onChange, onError? }` options
- [ ] `add()` creates non-recursive `fs.watch()` handle; idempotent (skips if already watched)
- [ ] ENOENT/EPERM errors auto-remove the path and call `onError`
- [ ] `stop()` closes all handles and clears state
- [ ] `"./shallow-watcher"` subpath export added to `packages/shared/package.json`
- [ ] Unit tests cover: add/remove/has/size lifecycle, idempotent add, ENOENT recovery, stop cleanup
- [ ] Gate check passes

**Tests**: unit
**Gate**: quick — `cd packages/shared && bun run test`

---

### T3: Replace JSONL parsing with Agent SDK in sessions service [P] ✅ (b3aee0f)

**What**: Replace manual JSONL parsing in `apps/server/src/services/sessions.ts` with `@anthropic-ai/claude-agent-sdk` `listSessions()`. Keep `computeProjectHash()`.
**Where**: `apps/server/src/services/sessions.ts`
**Depends on**: None
**Reuses**: Agent SDK `listSessions({ dir })` from `@anthropic-ai/claude-agent-sdk`
**Requirement**: FW-006

**Done when**:

- [ ] `listSessions()` uses Agent SDK `listSessions({ dir })` instead of `readdirSync` + `readFileSync` + JSONL parsing
- [ ] `getSessionMetadata()` and `jsonlEntrySchema` removed
- [ ] `computeProjectHash()` kept and exported
- [ ] `SessionInfo` type updated if SDK provides richer fields (gitBranch, cwd)
- [ ] No `readFileSync`/`readdirSync` calls for session data
- [ ] Gate check passes

**Tests**: none (service function, tested via integration at state.init level)
**Gate**: build — `bun run typecheck && bun run lint`

---

### T4: Fix WorkspaceView useEffect dependency [P] ✅ (b3aee0f)

**What**: Change the git fetch interval `useEffect` dependency from `workspace` (object ref) to `workspace.id` (stable string). Remove the second `useEffect` that calls `refreshRepoInfo` (no longer needed once `state:patch` carries data).
**Where**: `apps/web/src/components/WorkspaceView.tsx`
**Depends on**: None
**Reuses**: None
**Requirement**: FW-003

**Done when**:

- [ ] Fetch interval `useEffect` depends on `workspace.id`, not `workspace` object
- [ ] Second `useEffect` calling `refreshRepoInfo` removed
- [ ] `refreshRepoInfo` import removed from component if no longer used
- [ ] Gate check passes

**Tests**: none (UI component, no unit test infrastructure for React components)
**Gate**: build — `bun run typecheck && bun run lint`

---

### T5: Add `state:patch` contract + expand `state.init` response type ✅ (1747835)

**What**: Add `state:patch` to `WsPushEvents`, expand `state.init` result type to include `env`, `scripts`, `scriptStatuses`, `appInfo`, `capabilities`. Remove deprecated push events and RPC method types from contracts.
**Where**: `packages/contracts/src/ws.ts`, `packages/contracts/src/ipc.ts` (if `AppInfo`/`AppCapabilities` types need adjustment), `packages/contracts/src/models.ts`
**Depends on**: T1 (timing types may be referenced), T2, T3
**Reuses**: Existing `WsPushEvents` and `WsMethods` type patterns
**Requirement**: FW-001

**Done when**:

- [ ] `state:patch` added to `WsPushEvents` with all fields: `projects?`, `settings?`, `repoInfo?`, `sessions?`, `env?`, `scripts?`, `scriptStatuses?`
- [ ] `state.init` result expanded with: `env`, `scripts`, `scriptStatuses`, `appInfo`, `capabilities`
- [ ] Removed from `WsPushEvents`: `project:changed`, `workspace:changed`, `state:resync`, `repos:changed`, `session:changed`, `env:changed`, `settings:changed`, `scripts:reload`, `scripts:status`
- [ ] Removed from `WsMethods`: `app.info`, `app.capabilities`, `repos.getInfo`, `sessions.list`, `sessions.listByProject`, `env.list`, `scripts.load`, `scripts.status`
- [ ] Streaming/transient events kept: `terminal:data`, `terminal:exit`, `scripts:log`, `scripts:discovering`, `notification`, `clone:progress`, `claude:progress`, `claude:result`, `claude:error`
- [ ] Gate check passes (typecheck will fail on server/web — expected, fixed in T7-T10)

**Tests**: none (type-only changes)
**Gate**: build — `cd packages/contracts && bun run typecheck`

---

### T6: Create push coalescing layer (`pushPatch`) ✅ (1747835)

**What**: Create `apps/server/src/services/push.ts` with `createPushPatch()` that coalesces multiple `state:patch` pushes within the same microtask into a single WebSocket message. Export `PushPatchFn` type.
**Where**: `apps/server/src/services/push.ts` (new file)
**Depends on**: T5 (needs `state:patch` type in contracts)
**Reuses**: `ws.ts:pushAll()` as the underlying send mechanism
**Requirement**: FW-007

**Done when**:

- [ ] `createPushPatch(pushAll)` returns a `PushPatchFn` that queues via `queueMicrotask`
- [ ] Multiple calls within the same tick are deep-merged (projects/settings = last-writer-wins, Record fields = shallow merge by key)
- [ ] Single calls have zero added latency (fires at end of microtask queue)
- [ ] `PushPatchFn` type exported for watcher constructors
- [ ] Unit tests cover: single push passthrough, merge of two patches, Record field merging, projects override
- [ ] Gate check passes

**Tests**: unit
**Gate**: quick — `cd apps/server && bun run test`

---

### T7: Expand `state.init` handler + remove `app.info`/`app.capabilities` ✅ (1747835)

**What**: Expand `state.init` handler in `apps/server/src/handlers/app.ts` to return `env`, `scripts`, `scriptStatuses`, `appInfo`, `capabilities`. Remove `app.info` and `app.capabilities` handler registrations.
**Where**: `apps/server/src/handlers/app.ts`
**Depends on**: T5 (expanded contract types), T3 (sessions via Agent SDK)
**Reuses**: Existing `getRepoInfo()`, `listSessions()`, service functions for env/scripts
**Requirement**: FW-001

**Done when**:

- [ ] `state.init` returns `{ projects, settings, repoInfo, sessions, env, scripts, scriptStatuses, appInfo, capabilities }`
- [ ] `registerMethod("app.info", ...)` removed
- [ ] `registerMethod("app.capabilities", ...)` removed
- [ ] All data gathering uses `Promise.allSettled` for resilience
- [ ] Gate check passes

**Tests**: none (handler wiring, tested via integration)
**Gate**: build — `cd apps/server && bun run typecheck`

---

### T8: Remove read-only RPC handlers + add mutation push handlers ✅ (1747835)

**What**: Remove server-side RPC handlers for `repos.getInfo`, `sessions.list`, `sessions.listByProject`, `env.list`, `scripts.load`, `scripts.status`. Add `pushPatch` calls to mutation handlers (`repos.add`, `repos.sync`, `env.write`, `env.delete`, `settings.set`). Wire `pushPatch` into server bootstrap.
**Where**: `apps/server/src/handlers/*.ts`, `apps/server/src/main.ts` (or bootstrap file), `apps/server/src/types.ts`
**Depends on**: T5, T6, T7
**Reuses**: Existing handler patterns, `pushPatch` from T6
**Requirement**: FW-001

**Done when**:

- [ ] `repos.getInfo` handler removed
- [ ] `sessions.list` and `sessions.listByProject` handlers removed
- [ ] `env.list` handler removed
- [ ] `scripts.load` and `scripts.status` handlers removed
- [ ] `repos.add` and `repos.sync` push `repoInfo` via `pushPatch` after completion
- [ ] `env.write` and `env.delete` push `env` via `pushPatch` after completion
- [ ] `settings.set` pushes `settings` via `pushPatch` after completion
- [ ] `PushFn` type in `types.ts` updated or `PushPatchFn` added
- [ ] `pushPatch` wired into server startup and passed to handlers/watchers
- [ ] Gate check passes

**Tests**: none (handler wiring)
**Gate**: build — `cd apps/server && bun run typecheck`

---

### T9: Client-side `state:patch` handler + store cleanup ✅ (1747835)

**What**: Replace all granular push subscribers in `apps/web/src/stores/app.ts` with a single `state:patch` handler. Add `env`, `scripts`, `scriptStatuses`, `appInfo` fields to store. Remove `refreshRepoInfo`, `refreshSessions`, `refreshSessionsByProject` and all individual push handlers. Update `init()` to use expanded `state.init` response. Update `scripts.ts` store to remove `scripts:reload` subscriber and `loadConfig` RPC usage. Use static imports for terminal/scripts store pruning.
**Where**: `apps/web/src/stores/app.ts`, `apps/web/src/stores/scripts.ts`
**Depends on**: T5 (contract types), T8 (server pushes state:patch)
**Reuses**: Design doc merge strategy (section 10)
**Requirement**: FW-001, FW-005

**Done when**:

- [ ] `subscribePush()` has single `state:patch` handler with merge + orphan pruning
- [ ] All removed: `project:changed`, `workspace:changed`, `state:resync`, `settings:changed`, `session:changed`, `repos:changed` subscribers
- [ ] Store state includes `env`, `scripts`, `scriptStatuses`, `appInfo`
- [ ] `init()` reads all fields from `state.init` response (no separate `app.capabilities` call)
- [ ] `refreshRepoInfo`, `refreshSessions`, `refreshSessionsByProject`, `onProjectChanged`, `onWorkspaceChanged`, `onStateResync`, `onSettingsChanged` removed
- [ ] Terminal/scripts store pruning uses static imports (no dynamic `import()`)
- [ ] `scripts.ts` `subscribePush()` updated: `scripts:reload` subscriber removed (handled by `state:patch` via app store), `scripts:status` subscriber updated to read from app store's `scriptStatuses`
- [ ] Gate check passes

**Tests**: none (store logic, no unit test infrastructure for Zustand stores)
**Gate**: build — `bun run typecheck && bun run lint`

---

### T10: Add log line batching in scripts store ✅ (2896b42)

**What**: Replace per-line state updates in `scripts:log` handler with `createThrottle` batching.
**Where**: `apps/web/src/stores/scripts.ts`
**Depends on**: T1 (timing primitives), T9 (store refactored)
**Reuses**: `createThrottle` from `@iara/shared/timing`
**Requirement**: FW-004

**Done when**:

- [ ] `scripts:log` handler uses `createThrottle(50, ...)` to batch log lines
- [ ] Map is replaced at most once per batch (50ms window)
- [ ] MAX_LOG_LINES cap (1000) still enforced
- [ ] Gate check passes

**Tests**: none (store logic)
**Gate**: build — `bun run typecheck && bun run lint`

---

### T11: Create ProjectsDirWatcher (merged Projects + Env watcher) ✅ (fd1d5c3)

**What**: Create `apps/server/src/services/projects-dir-watcher.ts` — single watcher service using `ShallowWatcher` for non-recursive `fs.watch()` on `~/iara` and subdirectories. Dispatches events to project consumer and env consumer. Replace `ProjectsWatcher` and `EnvWatcher`.
**Where**: `apps/server/src/services/projects-dir-watcher.ts` (new), `apps/server/src/services/watcher.ts` (delete), `apps/server/src/services/env-watcher.ts` (delete), server bootstrap
**Depends on**: T1, T2, T6, T8 (pushPatch wired)
**Reuses**: `ShallowWatcher` from `@iara/shared/shallow-watcher`, `createKeyedDebounce` from `@iara/shared/timing`, `appState.rescanProject()`, `generateDotEnvFiles()`
**Requirement**: FW-008, FW-011

**Done when**:

- [ ] Single `ProjectsDirWatcher` class with `start()`, `stop()`, `suppressWrite()`, `refresh()`
- [ ] Watches: `~/iara/`, `~/iara/<project>/`, `~/iara/<project>/workspaces/`, `~/iara/<project>/workspaces/<slug>/`
- [ ] Event dispatch: `.git`/`iara-scripts.yaml`/dir changes → project consumer; `env.toml` → env consumer
- [ ] Both consumers use `createKeyedDebounce` keyed by project slug
- [ ] Own-write suppression with 1s auto-expiry
- [ ] Dynamic path management via `refresh()` — adds missing watches, removes stale
- [ ] `ProjectsWatcher` in `watcher.ts` deleted
- [ ] `EnvWatcher` in `env-watcher.ts` deleted
- [ ] Server bootstrap updated to use `ProjectsDirWatcher`
- [ ] Watcher tests updated for new class
- [ ] Gate check passes

**Tests**: unit
**Gate**: quick — `cd apps/server && bun run test`

---

### T12: Refactor SessionWatcher to use ShallowWatcher + Agent SDK ✅ (6f1345d)

**What**: Replace `@parcel/watcher` in `SessionWatcher` with `ShallowWatcher` for `fs.watch()` on `~/.claude/projects/<hash>/` directories. On debounce flush, call Agent SDK `listSessions()` and push data via `pushPatch`.
**Where**: `apps/server/src/services/session-watcher.ts`
**Depends on**: T1, T2, T3, T6
**Reuses**: `ShallowWatcher`, `createKeyedDebounce(2000)`, `listSessions()` from sessions service
**Requirement**: FW-006, FW-011

**Done when**:

- [ ] `SessionWatcher` uses `ShallowWatcher.add()` instead of `@parcel/watcher.subscribe()`
- [ ] Filters for `.jsonl` filename in onChange callback
- [ ] Uses `createKeyedDebounce(2000)` (2s debounce to avoid reacting to every Claude message write)
- [ ] On flush: calls `listSessions()` and pushes via `pushPatch({ sessions: { [wsId]: sessions } })`
- [ ] No `@parcel/watcher` import in session-watcher.ts
- [ ] Session watcher tests updated
- [ ] Gate check passes

**Tests**: unit
**Gate**: quick — `cd apps/server && bun run test`

---

### T13: Remove `@parcel/watcher` dependency ✅ (6f1345d, via knip-fix)

**What**: Remove `@parcel/watcher` from `apps/server/package.json` and verify no remaining imports.
**Where**: `apps/server/package.json`
**Depends on**: T11, T12 (all @parcel/watcher usages replaced)
**Reuses**: None
**Requirement**: FW-011

**Done when**:

- [ ] `@parcel/watcher` removed from `apps/server/package.json` dependencies
- [ ] No `@parcel/watcher` imports remain in `apps/server/src/`
- [ ] `bun install` succeeds
- [ ] Gate check passes

**Tests**: none
**Gate**: build — `bun run typecheck && bun run lint`

---

### T14: GitWatcher lazy watching (active workspace only) ✅ (ce616c5)

**What**: Refactor `GitWatcher` to use `ShallowWatcher` and `createKeyedDebounce`. Only watch repos for project-root workspaces + the currently active non-main workspace. Add `switchWorkspace()` method.
**Where**: `apps/server/src/services/git-watcher.ts`
**Depends on**: T1, T2, T6, T11 (server bootstrap with pushPatch)
**Reuses**: `ShallowWatcher`, `createKeyedDebounce(300)`, `getRepoInfo()`
**Requirement**: FW-009

**Done when**:

- [ ] `GitWatcher` uses `ShallowWatcher` for `.git/index` and `.git/HEAD` file watches
- [ ] On `start()`: watches project-root repos only
- [ ] `switchWorkspace(wsId)`: adds watches for new workspace repos, tears down previous non-main workspace watches
- [ ] Uses `createKeyedDebounce(300)` keyed by workspace ID — coalesces macOS double-fire from index + HEAD
- [ ] On flush: calls `getRepoInfo()` and pushes via `pushPatch({ repoInfo: { [wsId]: info } })`
- [ ] `unwatchProject()` still works for project deletion
- [ ] Gate check passes

**Tests**: none (fs.watch on .git files is hard to unit test reliably; verified by build + manual)
**Gate**: build — `bun run typecheck && bun run lint`

---

## Parallel Execution Map

```
Phase 1 (Parallel):
  ├── T1 [P]  @iara/shared/timing
  ├── T2 [P]  @iara/shared/shallow-watcher
  ├── T3 [P]  Agent SDK sessions service
  └── T4 [P]  WorkspaceView useEffect fix

Phase 2 (Sequential):
  T1,T2,T3 complete, then:
    T5 → T6 → T7 → T8

Phase 3 (Sequential):
  T5,T8 complete, then:
    T9 → T10

Phase 4 (Sequential):
  T2,T9 complete, then:
    T11 → T12 → T13

Phase 5 (Sequential):
  T11,T13 complete, then:
    T14
```

---

## Validation Tables

### Task Granularity Check

| Task                            | Scope                       | Status                                      |
| ------------------------------- | --------------------------- | ------------------------------------------- |
| T1: timing primitives           | 1 module (3 functions)      | OK — cohesive                               |
| T2: ShallowWatcher              | 1 class                     | OK                                          |
| T3: Agent SDK sessions          | 1 service refactor          | OK                                          |
| T4: WorkspaceView fix           | 1 component fix             | OK                                          |
| T5: contracts                   | 1 type file                 | OK                                          |
| T6: push coalescing             | 1 module                    | OK                                          |
| T7: state.init expansion        | 1 handler                   | OK                                          |
| T8: RPC removal + mutation push | multiple handlers           | OK — cohesive (all RPC cleanup in one pass) |
| T9: client state:patch          | 2 stores (app + scripts)    | OK — tightly coupled changes                |
| T10: log batching               | 1 handler in 1 store        | OK                                          |
| T11: ProjectsDirWatcher         | 1 new service + 2 deletions | OK — merge operation                        |
| T12: SessionWatcher refactor    | 1 service                   | OK                                          |
| T13: Remove @parcel/watcher     | 1 dependency                | OK                                          |
| T14: GitWatcher lazy            | 1 service                   | OK                                          |

### Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows      | Status |
| ---- | ----------------- | ------------------ | ------ |
| T1   | None              | No incoming arrows | Match  |
| T2   | None              | No incoming arrows | Match  |
| T3   | None              | No incoming arrows | Match  |
| T4   | None              | No incoming arrows | Match  |
| T5   | T1, T2, T3        | T1,T2,T3 → T5      | Match  |
| T6   | T5                | T5 → T6            | Match  |
| T7   | T5, T3            | T5 → ... → T7      | Match  |
| T8   | T5, T6, T7        | T7 → T8            | Match  |
| T9   | T5, T8            | T5,T8 → T9         | Match  |
| T10  | T1, T9            | T9 → T10           | Match  |
| T11  | T1, T2, T6, T8    | T2,T9 → T11        | Match  |
| T12  | T1, T2, T3, T6    | T11 → T12          | Match  |
| T13  | T11, T12          | T12 → T13          | Match  |
| T14  | T1, T2, T6, T11   | T11,T13 → T14      | Match  |

### Test Co-location Validation

| Task | Code Layer         | Tests Required                           | Task Says | Status |
| ---- | ------------------ | ---------------------------------------- | --------- | ------ |
| T1   | shared utility     | unit                                     | unit      | OK     |
| T2   | shared utility     | unit                                     | unit      | OK     |
| T3   | server service     | none (no test infra for SDK integration) | none      | OK     |
| T4   | React component    | none (no React test infra)               | none      | OK     |
| T5   | contract types     | none                                     | none      | OK     |
| T6   | server service     | unit                                     | unit      | OK     |
| T7   | server handler     | none                                     | none      | OK     |
| T8   | server handlers    | none                                     | none      | OK     |
| T9   | client stores      | none (no Zustand test infra)             | none      | OK     |
| T10  | client store       | none                                     | none      | OK     |
| T11  | server service     | unit                                     | unit      | OK     |
| T12  | server service     | unit                                     | unit      | OK     |
| T13  | dependency removal | none                                     | none      | OK     |
| T14  | server service     | none (fs.watch unreliable in tests)      | none      | OK     |
