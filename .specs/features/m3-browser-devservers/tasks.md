# M3 — Browser Panel & Dev Servers Tasks

**Status**: Active

---

## Execution Plan

### Phase 1: Dev Server Supervisor (Sequential)

```
T1 → T2 → T3
```

Discover, launch, health check, log streaming.

### Phase 2: Browser Panel (Sequential)

```
T4 → T5 → T6
```

WebContentsView, agent-browser API, socket handlers.

### Phase 3: Integration + UI (Sequential)

```
T7 → T8
```

Dev+browser integration, UI panels.

---

## Task Breakdown

### T1: Dev server discovery

**What**: Auto-discover dev commands from package.json, Makefile, etc.
**Where**: `apps/desktop/src/services/devservers.ts`

**Done when**:

- [ ] `discoverDevCommands(dir)` — scan for dev commands
- [ ] package.json: `scripts.dev`, `scripts.start`, `scripts.serve`
- [ ] Makefile: `dev`, `serve`, `run` targets
- [ ] Cargo.toml: `cargo run`
- [ ] Classify as frontend (vite/next/remix/astro) or backend (go/python/uvicorn)
- [ ] Return `DevCommand[]` with { name, command, args, cwd, type, port? }
- [ ] Tests: discover from fixture package.json

**Commit**: `feat: add dev server command discovery`

---

### T2: Dev server supervisor — launch, stop, health check

**What**: Manage dev server lifecycle via child_process.
**Where**: `apps/desktop/src/services/devservers.ts`

**Done when**:

- [ ] `DevServerSupervisor` class — manages running servers
- [ ] `start(cmd)` — spawn child process, track PID
- [ ] `stop(name)` — kill process + children
- [ ] `restart(name)` — stop then start
- [ ] `status()` — return all servers with { name, pid, port, health, type }
- [ ] Health check: TCP connect to port with retries
- [ ] Env vars from project injected via spawn env
- [ ] Cleanup on app exit (kill all children)
- [ ] Tests: start/stop lifecycle (mock spawn)

**Commit**: `feat: add dev server supervisor with health checks`

---

### T3: Dev server log streaming

**What**: Capture and stream stdout/stderr from dev servers.
**Where**: `apps/desktop/src/services/devservers.ts` (extend)

**Done when**:

- [ ] Capture stdout/stderr per server in ring buffer (last 1000 lines)
- [ ] `getLogs(name, limit?)` — return recent lines
- [ ] Port detection from output (regex: `localhost:(\d+)`, `port (\d+)`)
- [ ] IPC handlers: `desktop:dev-start`, `desktop:dev-stop`, `desktop:dev-status`, `desktop:dev-logs`
- [ ] Contracts + preload updated

**Commit**: `feat: add dev server log streaming and port detection`

---

### T4: Browser panel — WebContentsView

**What**: Embed a browser panel in Electron using WebContentsView.
**Where**: `apps/desktop/src/services/browser-panel.ts`, `apps/desktop/src/main.ts`

**Done when**:

- [ ] `BrowserPanel` class — manages WebContentsView
- [ ] `navigate(url)` — load URL in panel
- [ ] `show()` / `hide()` — toggle visibility
- [ ] `resize(bounds)` — update panel bounds
- [ ] Panel attached to BrowserWindow as child view
- [ ] Split layout: main view (left) + browser panel (right)
- [ ] IPC: `desktop:browser-navigate`, `desktop:browser-show`, `desktop:browser-hide`
- [ ] Contracts + preload updated

**Commit**: `feat: add browser panel with WebContentsView`

---

### T5: Browser panel — agent-browser API

**What**: Implement agent-browser compatible API for the panel.
**Where**: `apps/desktop/src/services/browser-panel.ts` (extend)

**Done when**:

- [ ] `screenshot()` — capture panel, save to tmp, return path
- [ ] `getAccessibilityTree()` — execute JS in panel to build a11y tree
- [ ] `click(selector)` — execute JS click in panel
- [ ] `fill(selector, value)` — execute JS fill in panel
- [ ] `evaluate(script)` — execute arbitrary JS in panel
- [ ] IPC handlers for all operations
- [ ] Socket handlers: `browser.navigate`, `browser.screenshot`, `browser.get-tree`

**Commit**: `feat: add agent-browser API for browser panel`

---

### T6: Socket browser handlers

**What**: Wire browser panel to socket server for Claude access.
**Where**: `apps/desktop/src/main.ts` (wire socket + browser)

**Done when**:

- [ ] Socket handler `browser.navigate` → BrowserPanel.navigate
- [ ] Socket handler `browser.screenshot` → BrowserPanel.screenshot
- [ ] Socket handler `browser.get-tree` → BrowserPanel.getAccessibilityTree
- [ ] Socket handler `notify` → Electron Notification
- [ ] Socket handler `dev.start/stop/status` → DevServerSupervisor
- [ ] Socket started on app ready, path set in env

**Commit**: `feat: wire socket handlers for browser and dev server control`

---

### T7: Dev + Browser integration

**What**: Auto-open browser panel when frontend dev server is ready.
**Where**: `apps/desktop/src/services/devservers.ts` (extend)

**Done when**:

- [ ] On health check success for frontend server → emit event
- [ ] Main process listens for event → auto-navigate browser panel to URL
- [ ] Heuristic classification: vite/next/remix/astro = frontend → browseable
- [ ] Backend servers (go/python/uvicorn) don't trigger browser
- [ ] Config override: `browseable: true/false` per command

**Commit**: `feat: add dev server + browser panel auto-integration`

---

### T8: Dev server + browser UI panels

**What**: UI components for dev server management and browser toggle.
**Where**: `apps/web/src/components/`

**Done when**:

- [ ] `DevServerPanel.tsx` — list servers, start/stop buttons, status indicators
- [ ] `DevServerLogs.tsx` — log viewer with auto-scroll
- [ ] `BrowserToggle.tsx` — button to show/hide browser panel
- [ ] Sidebar shows dev server status (port, health icon)
- [ ] Task workspace shows dev server + browser panels
- [ ] Zustand store for dev servers state
- [ ] Contracts + preload updated with dev server types

**Commit**: `feat: add dev server and browser panel UI components`

---

## Parallel Execution Map

```
Phase 1 (Sequential — Dev Servers):
  T1 → T2 → T3

Phase 2 (Sequential — Browser):
  T4 → T5 → T6

Phase 3 (Sequential — Integration):
  T7 → T8

Note: Phase 1 and Phase 2 can run in parallel since they're independent.
```
