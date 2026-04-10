# File Watcher Refactor

## Overview

The file watching pipeline — from native FS events through server-side debounce to client-side state updates — has accumulated performance problems that compound under load. A project with 5 repos across 3 workspaces spawns recursive `@parcel/watcher` subscriptions on `~/iara`, two duplicate subscriptions on the same directory, and pushes un-batched WebSocket messages that trigger redundant store updates and double network requests on the client.

Beyond fixing individual problems, the refactor reduces watcher noise by replacing recursive watches with shallow directory watches, makes push events carry data so clients never re-fetch, and replaces manual JSONL parsing with `@anthropic-ai/claude-agent-sdk`. The client reads from Zustand state populated by `state.init` at boot and kept current via push updates — no re-fetching on navigation. The server is stateless for this data — it computes fresh on `state.init` and on watcher events.

### Push Event Architecture

One event for all state changes. All data flows through `state:patch` — no separate data-fetch events.

**`state:patch`**

```ts
"state:patch": {
  projects?: Project[];
  settings?: Record<string, string>;
  repoInfo?: Record<string, RepoInfo[]>;      // keyed by workspaceId
  sessions?: Record<string, SessionInfo[]>;    // keyed by workspaceId
  env?: Record<string, EnvData>;               // keyed by workspaceId
  scripts?: Record<string, ScriptsConfig>;     // keyed by projectId
  scriptStatuses?: Record<string, ScriptStatus[]>; // keyed by workspaceId
}
```

Server sends only the fields that changed. Client merges with one handler:

- `projects` → full replace, prune orphaned keys from all other maps
- `settings` → full replace
- `repoInfo` → shallow merge by key (`Object.assign`)
- `sessions` → shallow merge by key
- `env` → shallow merge by key
- `scripts` → shallow merge by key (projectId)
- `scriptStatuses` → shallow merge by key

| Trigger                         | Patch sent                                                           |
| ------------------------------- | -------------------------------------------------------------------- |
| Git change in ws `foo/bar`      | `{ repoInfo: { "foo/bar": [...] } }`                                 |
| Session change in ws `foo/bar`  | `{ sessions: { "foo/bar": [...] } }`                                 |
| env.toml change in ws `foo/bar` | `{ env: { "foo/bar": {...} } }`                                      |
| iara-scripts.yaml change        | `{ scripts: { "my-project": {...} } }`                               |
| Script starts/stops             | `{ scriptStatuses: { "foo/bar": [...] } }`                           |
| `settings.set` called           | `{ settings: { ...all } }`                                           |
| Project/workspace add/remove    | `{ projects: [...] }`                                                |
| Git + session fire together     | `{ repoInfo: { "foo/bar": [...] }, sessions: { "foo/bar": [...] } }` |

- **`state.init` (RPC)** returns full hydration: `{ projects, settings, repoInfo, sessions, env, scripts, scriptStatuses, appInfo, capabilities }`

**Replaced events:** `project:changed`, `workspace:changed`, `repos:changed`, `session:changed`, `env:changed`, `state:resync`, `scripts:reload`, `scripts:status`, `settings:changed` → all consolidated into `state:patch`.

**Unchanged events:** `terminal:data/exit`, `scripts:log`, `scripts:discovering`, `notification`, `clone:progress`, `claude:progress/result/error` — these are streaming/transient events, not state.

## Reference Architecture

VS Code's file watcher pipeline provides proven patterns to adopt:

- **Event coalescing**: 75ms window that collapses ADD+DELETE→nothing, DELETE+ADD→CHANGE, prunes nested deletes
- **ThrottledWorker**: 500 events/chunk, 200ms rest between chunks, 30k event cap with backpressure
- **Watch deduplication**: Path-hash + ref counting to avoid duplicate native watchers
- **Correlated streams**: Multiple logical consumers share a single underlying watcher
- **Suspend/resume**: Fallback to polling when watched paths disappear, auto-resume when viable

---

## Requirements

### FW-012: ShallowWatcher utility + shared timing primitives

**Priority: P0 — Foundation**

**Problem:** All 4 watchers hand-roll the same patterns: `fs.watch()` lifecycle (start/stop/cleanup), error handling (ENOENT when dir disappears), dynamic add/remove of watched paths, and keyed debounce via `Map<string, setTimeout>`. This is duplicated across `watcher.ts`, `env-watcher.ts`, `git-watcher.ts`, and `session-watcher.ts`.

**Solution:**

1. **`ShallowWatcher`** utility in `@iara/shared` — wraps `fs.watch()` non-recursive with: start/stop lifecycle, dynamic path add/remove, ENOENT error handling (auto-remove dead watches), event callback with filename filtering, cleanup on stop.
2. **`@iara/shared/timing`** module — hand-rolled `createDebounce`, `createKeyedDebounce`, and `createThrottle` (~40 lines total, zero external dependencies). Keyed debounce supports per-key scheduling with `cancelAll()` for watcher stop lifecycle.

**Acceptance Criteria:**

- [ ] `ShallowWatcher` class in `@iara/shared` handles `fs.watch()` lifecycle: watch/unwatch paths, error recovery, cleanup
- [ ] `ShallowWatcher` supports dynamic add/remove of watched directories at runtime
- [ ] `ShallowWatcher` handles ENOENT gracefully (directory deleted while being watched)
- [ ] `@iara/shared/timing` exports `createDebounce(ms, fn)` — single-key debounce with `cancel()` and `flush()`
- [ ] `@iara/shared/timing` exports `createKeyedDebounce(ms, fn)` — per-key debounce with `schedule(key)`, `cancel(key)`, `cancelAll()`, `flush(key)`
- [ ] `@iara/shared/timing` exports `createThrottle(ms, fn)` — for log batching (FW-004) and WS coalescing (FW-007)
- [ ] All hand-rolled `setTimeout`/`clearTimeout` debounce patterns replaced with shared timing primitives
- [ ] ProjectsWatcher, EnvWatcher, and SessionWatcher use `ShallowWatcher` (directory watches) + shared timing
- [ ] `ShallowWatcher` supports watching individual files (not just directories) — `fs.watch()` on a file path, same lifecycle/error handling
- [ ] GitWatcher uses `ShallowWatcher` for `.git/index` and `.git/HEAD` file watches + `createKeyedDebounce` from shared timing
- [ ] Existing watcher tests updated to reflect new primitives
- [ ] No external dependencies added for timing utilities

---

### FW-011: Replace recursive `~/iara` watcher with shallow directory watches

**Priority: P1 — High**

**Problem:** `@parcel/watcher` watches `~/iara` recursively (`apps/server/src/services/watcher.ts:21`, `apps/server/src/services/env-watcher.ts:27`). This means the OS tracks every file in every repo in every project — source code, build output, IDE files, everything. With ignore patterns only for `.git/` and `node_modules/`, a single `vite build` or `turbo run` generates thousands of FS events that hit the JS callback, get filtered, and are discarded. We never need to see repo contents.

**What we actually need to watch:**

| Consumer        | Path                                          | Depth | Events needed                                         |
| --------------- | --------------------------------------------- | ----- | ----------------------------------------------------- |
| ProjectsWatcher | `~/iara/`                                     | 1     | Project dirs added/removed                            |
| ProjectsWatcher | `~/iara/<project>/`                           | 1     | Repo `.git` dirs, `iara-scripts.yaml`                 |
| ProjectsWatcher | `~/iara/<project>/workspaces/`                | 1     | Workspace dirs added/removed                          |
| EnvWatcher      | `~/iara/<project>/env.toml`                   | file  | Content change                                        |
| EnvWatcher      | `~/iara/<project>/workspaces/<slug>/env.toml` | file  | Content change                                        |
| SessionWatcher  | `~/.claude/projects/<hash>/`                  | 1     | `.jsonl` file created or modified (for title renames) |

**Approach:** Use `fs.watch()` in non-recursive mode on specific directories instead of `@parcel/watcher` recursive on `~/iara`. `fs.watch()` is well-suited for shallow directory-listing changes (low frequency, no platform issues at this rate). For `env.toml` files, watch the parent directory non-recursively and filter for the filename. This replaces ~100k+ tracked files with ~10-20 directory watches.

SessionWatcher also moves from `@parcel/watcher` to `fs.watch()` — it watches for `.jsonl` file creation (new sessions) and modifications (title renames). To avoid noise from every Claude message write, use a longer debounce (e.g., 2-5s), then call Agent SDK `listSessions({ projectDir })` to get the full updated list for that workspace. This eliminates `@parcel/watcher` as a dependency entirely.

**Acceptance Criteria:**

- [ ] No recursive watcher on `~/iara` — neither `@parcel/watcher` nor `fs.watch({ recursive: true })`
- [ ] `~/iara/` is watched non-recursively for project dir add/remove
- [ ] Each `~/iara/<project>/` is watched non-recursively for repo `.git` dirs, `iara-scripts.yaml`, and `env.toml`
- [ ] Each `~/iara/<project>/workspaces/` is watched non-recursively for workspace dir add/remove
- [ ] Each `~/iara/<project>/workspaces/<slug>/` is watched non-recursively for `env.toml` changes
- [ ] Watches are added/removed dynamically as projects and workspaces are created/deleted
- [ ] SessionWatcher uses `fs.watch()` on `~/.claude/projects/<hash>/` directories for `.jsonl` files
- [ ] SessionWatcher debounce for modifications is longer (2-5s) to avoid reacting to every Claude message write — only needs to catch title renames
- [ ] On debounce flush, SessionWatcher calls Agent SDK `listSessions({ projectDir })` to get the full updated list and pushes via `state:patch` with `sessions` field
- [ ] `@parcel/watcher` is fully removed as a dependency
- [ ] A build running inside a repo (`bun build`, `vite build`, `turbo run`) generates zero watcher callbacks
- [ ] No regression: project/workspace/repo/env.toml changes are still detected within 500ms
- [ ] New sessions are detected within 1s of file creation

---

### FW-001: Push carries data + contract cleanup

**Priority: P0 — Critical**

**Problem:** Multiple push events are "go re-fetch" signals that trigger redundant RPC calls. Two independent subscribers react to `session:changed`, firing duplicate `sessions.list` RPCs. Several read-only RPC endpoints duplicate data already available in Zustand state. `app.info` and `app.capabilities` are separate boot-time round trips for static data. Six granular push events (`project:changed`, `workspace:changed`, `repos:changed`, `session:changed`, `env:changed`, `state:resync`) can be consolidated into one `state:patch` event.

**Solution:** Consolidate push events into one `state:patch` for all state changes. Expand `state.init` to return full hydration including `appInfo`, `capabilities`, `env`, `scripts`, and `scriptStatuses`. Remove read-only RPC endpoints that duplicate state. Client reads from Zustand (populated by `state.init` at boot, updated by `state:patch`).

**Acceptance Criteria:**

_Push event consolidation:_

- [ ] Replace `project:changed`, `workspace:changed`, `repos:changed`, `session:changed`, `env:changed`, `scripts:reload`, `scripts:status`, `settings:changed`, `state:resync` with a single `state:patch` event — partial state update with only changed fields
- [ ] `state:patch` fields coalesce when multiple sources fire within the same debounce window (e.g., git + session change → single patch with both `repoInfo` and `sessions`)
- [ ] Client has one `state:patch` handler — merges each present field into Zustand (projects/settings = full replace + orphan pruning, all Record fields = shallow merge by key)

_Push carries data:_

- [ ] All state flows through `state:patch` — no "go re-fetch" signals, no duplicate read paths
- [ ] Only one subscriber handles `state:patch` (remove all duplicate subscribers)
- [ ] All panels render instantly from Zustand state — no loading spinners, no network round trips on navigation

_`state.init` expansion:_

- [ ] `state.init` returns `{ projects, settings, repoInfo, sessions, env, scripts, scriptStatuses, appInfo, capabilities }` — full hydration in one RPC
- [ ] Remove `app.info` RPC contract + handler — client reads from `state.init` response
- [ ] Remove `app.capabilities` RPC contract + handler — client reads from `state.init` response

_RPC endpoint removal (read-only endpoints replaced by state):_

- [ ] Remove `repos.getInfo` — client reads from `repoInfo[workspaceId]` in Zustand
- [ ] Remove `sessions.list` — client reads from `sessions[workspaceId]` in Zustand
- [ ] Remove `sessions.listByProject` — client derives from sessions map
- [ ] Remove `env.list` — client reads from `env[workspaceId]` in Zustand
- [ ] Remove `scripts.load` — client reads from `scripts[projectId]` in Zustand
- [ ] Remove `scripts.status` — client reads from `scriptStatuses[workspaceId]` in Zustand
- [ ] Service functions stay server-side for internal use by `state.init` and push logic

_Mutation handlers push state:patch on completion:_

- [ ] `repos.add` and `repos.sync` → push `repoInfo`
- [ ] `env.write` and `env.delete` → push `env`
- [ ] `settings.set` → push `settings`
- [ ] Script supervisor status changes → push `scriptStatuses`

_Cleanup:_

- [ ] Remove deprecated `ProjectFileSchema` and `WorkspaceFileSchema` from `packages/contracts/src/schemas.ts`

- [ ] No regression: new sessions appear within 2s, workspace navigation is instant, env/scripts changes reflected within 1s

---

### FW-003: Stabilize `workspace` dependency in WorkspaceView useEffect

**Priority: P2 — High**

**Problem:** `apps/web/src/components/WorkspaceView.tsx:52` — the git fetch interval `useEffect` depends on `workspace` (the entire object reference) instead of `workspace.id`. Every `state:patch` push (e.g., with `repoInfo` field) causes the app store to shallow-copy the workspace's parent project, which creates a new workspace object reference, which re-triggers the effect, which clears and restarts the interval and fires an immediate `repos.fetch`.

**Acceptance Criteria:**

- [ ] The fetch interval `useEffect` depends on `workspace.id` (stable string), not the `workspace` object
- [ ] A `state:patch` push (with `repoInfo` field) does NOT cause the fetch interval to restart
- [ ] The 5-minute background fetch interval remains functional after the fix

---

### FW-004: Optimize high-frequency log line state updates

**Priority: P3 — Medium**

**Problem:** `apps/web/src/stores/scripts.ts:204-213` — every `scripts:log` push event creates a new `Map` via `new Map(get().logs)` and a new array via `[...existing.slice(-(MAX_LOG_LINES - 1)), line]`. At high log output rates (e.g., webpack dev server, test runner), this produces O(n) copies per line, triggering a full Zustand store notification and React re-render cycle for each line.

**Acceptance Criteria:**

- [ ] Log lines received within a single tick (or configurable window, e.g., 50ms) are batched into a single state update using `createThrottle` from `@iara/shared/timing`
- [ ] The Map is mutated in-place or replaced at most once per batch, not once per line
- [ ] At 100 log lines/second, React re-renders of the log viewer occur at most ~20 times/second
- [ ] The MAX_LOG_LINES cap (1000) is still enforced

---

### FW-005: Throttle `state:patch` cascade

**Priority: P2 — Medium**

**Problem:** `apps/web/src/stores/app.ts:437-459` — `state:patch` (replacing the old `state:resync`) applies partial updates and prunes stale workspace entries via dynamically imported `terminal.js` and `scripts.js` stores. This triggers:

1. A full re-render of every component subscribed to any `useAppStore` selector
2. Dynamic `import()` calls that create microtask delays
3. Additional `setState` calls in terminal and scripts stores, each causing their own re-render cascade

With the new `state:patch` event, the handler must merge partial updates and prune orphans when `projects` changes. The cascade problem remains: replacing the projects list triggers re-renders + prune chain across terminal/scripts stores.

**Acceptance Criteria:**

- [ ] `state:patch` handler applies all state changes (merge + terminal prune + scripts prune) in a single synchronous batch, or defers secondary updates to `requestAnimationFrame`
- [ ] Dynamic imports for terminal/scripts stores are replaced with static imports (eliminating microtask delay)
- [ ] When `state:patch` includes `projects`, handler prunes orphaned entries from all state maps (`repoInfo`, `sessions`, `env`, `scripts`, `scriptStatuses`, terminal)
- [ ] A `state:patch` event causes at most 2 React commit cycles (one for app state, one for dependent stores), not N cycles

---

### FW-006: Replace manual JSONL parsing with Agent SDK

**Priority: P0 — Foundation**

**Problem:** `apps/server/src/services/sessions.ts:69-70` — `getSessionMetadata()` uses `fs.readFileSync` to read entire JSONL files, then parses every line with `JSON.parse` + Zod. For sessions with thousands of messages, this blocks the Node.js event loop for 10-100ms+ per file. `listSessions()` at line 26 iterates all session files in a directory synchronously. This is reimplementing what the Agent SDK already provides.

**Solution:** Replace custom JSONL parsing with `@anthropic-ai/claude-agent-sdk` `listSessions()` and `getSessionInfo()`. The SDK already handles file reading and metadata extraction. The SDK provides richer metadata too (git branch, cwd, custom title, file size).

**Acceptance Criteria:**

- [ ] `apps/server/src/services/sessions.ts` uses Agent SDK `listSessions({ projectDir })` instead of manual JSONL parsing
- [ ] `getSessionMetadata()` replaced with Agent SDK `getSessionInfo()`
- [ ] Custom JSONL schema (`jsonlEntrySchema`) and line-by-line parsing removed
- [ ] `readFileSync` and `readdirSync` calls for session data removed
- [ ] No regression in session data accuracy — SDK provides at minimum: title, createdAt, lastMessageAt, messageCount
- [ ] Session metadata includes additional SDK fields where useful (gitBranch, cwd, fileSize)

---

### FW-007: Add WebSocket push coalescing

**Priority: P2 — Medium**

**Problem:** `apps/server/src/ws.ts:16-24` — `pushAll()` calls `JSON.stringify` and iterates all clients for every push event with no batching. When multiple watchers flush within the same tick (e.g., git + session watchers fire close together), the client receives multiple separate `state:patch` messages that each trigger independent store updates and React re-renders.

**Acceptance Criteria:**

- [ ] Push events occurring within the same microtask/tick are coalesced into a single WebSocket message per client, using `createThrottle` from `@iara/shared/timing` or `queueMicrotask`
- [ ] The coalescing window is configurable (default: `queueMicrotask` or `setImmediate`)
- [ ] Multiple `state:patch` payloads within a coalescing window are deep-merged (last-writer-wins per field key)
- [ ] Latency for single push events is not increased (no artificial delay — only natural tick batching)

---

### FW-008: Merge ProjectsWatcher + EnvWatcher into a unified shallow watcher

**Priority: P1 — High (ships immediately after FW-011)**

**Problem:** Both `ProjectsWatcher` (`apps/server/src/services/watcher.ts:21`) and `EnvWatcher` (`apps/server/src/services/env-watcher.ts:27`) watch the same directory tree with separate `@parcel/watcher` subscriptions and separate debounce/flush logic. They care about different events in the same directories — structure changes vs `env.toml` changes.

**Decision:** With FW-011 replacing recursive watchers with shallow `fs.watch()` handles, both consumers share the same set of watched directories (`~/iara/`, `~/iara/<project>/`, `~/iara/<project>/workspaces/`, etc.). Merge them into a single watcher service that maintains the shallow `fs.watch()` handles and dispatches events to registered consumers based on filename/path matching.

GitWatcher and SessionWatcher stay independent — they watch different paths entirely.

**Acceptance Criteria:**

- [ ] A single `ProjectsDir` watcher service owns all shallow `fs.watch()` handles for `~/iara` and its subdirectories
- [ ] ProjectsWatcher logic and EnvWatcher logic are registered as event consumers on the shared service
- [ ] Each consumer declares what filenames/patterns it cares about (e.g., `iara-scripts.yaml`, `.git`, `env.toml`)
- [ ] Own-write suppression works for both consumers (when the server writes a file like `env.toml` or `iara-scripts.yaml`, the resulting watcher event is ignored to prevent unnecessary reprocessing cycles)
- [ ] One set of `fs.watch()` handles, not two — no duplicate watches on the same directory
- [ ] GitWatcher and SessionWatcher remain independent

---

### FW-009: GitWatcher lazy watching + verification

**Priority: P2 — Medium**

**Problem:** GitWatcher watches `.git/index` and `.git/HEAD` for every repo in every workspace simultaneously. With 5 repos × 3 workspaces = 30 file watches and 15 git processes per debounce flush. Only the active workspace's git status matters to the user.

**Solution:** Lazy watching — only watch repos for the currently selected workspace. Start watches on workspace switch, stop watches for the previous workspace. Reduces handles from 2 × repos × all_workspaces to 2 × repos × 1_workspace, and git subprocess count to at most 5 repos × 3 = 15 per flush (active workspace only). On workspace switch, recompute `getRepoInfo()` for the newly selected workspace and push via `state:patch`.

**Acceptance Criteria:**

- [ ] GitWatcher only watches `.git/index` and `.git/HEAD` for repos in the active workspace
- [ ] On workspace switch, GitWatcher stops watches for the previous workspace and starts watches for the new one
- [ ] On workspace switch, GitWatcher recomputes `getRepoInfo()` for the new workspace and pushes via `state:patch` with `repoInfo` field
- [ ] On debounce flush, GitWatcher recomputes `getRepoInfo()` for the entire affected workspace (server stays stateless — no in-memory repo cache)
- [ ] macOS double-fire from `.git/index` + `.git/HEAD` is coalesced by `createKeyedDebounce` with 300-500ms window (verify, don't just assume)
- [ ] Under sustained git activity (e.g., `git rebase`), subprocess count stays below 15 concurrent processes

---

## Out of Scope

- **Merging all four watchers**: GitWatcher watches resolved `.git` dirs (often outside `~/iara`), SessionWatcher watches `~/.claude/projects/`. Only ProjectsWatcher + EnvWatcher merge (FW-008). GitWatcher and SessionWatcher remain independent services.
- **Suspend/resume with polling fallback**: VS Code implements this for network filesystems. Our watchers target local dirs only — defer unless user-reported.
- **Client-side event coalescing in `ws-transport.ts`**: Server-side coalescing (FW-007) plus `state:patch` consolidation (FW-001) should eliminate the need. Revisit if still needed after FW-007.
- **Custom JSONL parsing optimizations**: With Agent SDK handling session reads, optimizations like incremental parsing or first/last-N-lines are the SDK's concern, not ours.

## Dependency Graph

```
FW-012 (ShallowWatcher+timing) ──→ FW-011 (all watchers built on ShallowWatcher)
                                ──→ FW-009 (GitWatcher uses ShallowWatcher + keyed debounce)
FW-006 (Agent SDK sessions)    ──→ FW-001 (push carries data via SDK listSessions)
                                ──→ FW-011 (SessionWatcher uses SDK on debounce flush)
FW-001 (push + contracts)      ──→ FW-011 (all watchers push via state:patch)
                                ──→ FW-005 (state:patch handler with merge + orphan pruning)
FW-011 (shallow watches)       ──→ FW-008 (merge Projects+Env into shared shallow watcher)
                                ──→ removes @parcel/watcher entirely

FW-003 (useEffect dep)         ← standalone, no deps
FW-004 (log batching)          ← standalone, no deps
FW-005 (patch cascade)         ← depends on FW-001 (new state:patch shape)
FW-007 (WS coalescing)         ← standalone, no deps (but amplifies benefits of all other changes)
FW-009 (lazy git watches)      ← depends on FW-012 (ShallowWatcher + timing)
```

## Suggested Implementation Order

1. **Foundation:** FW-012 (ShallowWatcher + `@iara/shared/timing`) + FW-006 (Agent SDK) — independent, build in parallel
2. **Contract + data flow:** FW-001 (`state:patch` event, `state.init` expansion, RPC removal, deprecated schema cleanup) + FW-003 (stable useEffect dep) — establishes the new push architecture
3. **Watcher overhaul:** FW-011 (shallow watches) → FW-008 (merge into single service) — all watchers push via `state:patch`, drops `@parcel/watcher`
4. **Client-side batching:** FW-004, FW-005 — reduce re-render pressure (FW-005 updated for `state:patch` merge + orphan pruning)
5. **Git optimization:** FW-009 (lazy watching + debounce verification) — active workspace only
6. **Polish:** FW-007 — WebSocket push coalescing
