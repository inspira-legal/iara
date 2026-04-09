# App Redesign — Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ __root.tsx (RootComponent)                                   │
│  ├─ AppShell (sidebar + main layout)                         │
│  │   ├─ Sidebar (new: sessions list, nav buttons)            │
│  │   └─ MainPanel (content + bottom + right panels)          │
│  │       ├─ Content: <Outlet /> (route-based)                │
│  │       │   ├─ / → NewSessionPage                           │
│  │       │   ├─ /session/$id → ActiveSessionView             │
│  │       │   ├─ /projects → ProjectsPage                     │
│  │       │   └─ /settings → Settings (unchanged)             │
│  │       ├─ BottomPanel (scripts, output, terminal tabs)     │
│  │       └─ RightPanel (env editor)                          │
│  └─ Dialogs (CreateProject, CreateWorkspace, WorkspacePicker)│
└─────────────────────────────────────────────────────────────┘
```

The redesign changes the **navigation model** (sidebar → sessions list), **home page** (empty placeholder → prompt textarea), and **bottom panel terminal layout** (nested sidebar → flat tabs). The server and contracts layers need minimal changes (add `initialPrompt` to terminal creation).

## Routing Strategy

Current routes: `/` (home), `/settings`.
New routes: `/` (NewSessionPage), `/session/$id` (ActiveSessionView), `/projects` (ProjectsPage), `/settings` (unchanged).

**Key decision: session views are routes, not conditional renders.**

Currently, `WorkspaceView` conditionally renders `TerminalView` or `SessionList` based on terminal state. In the redesign, each running session gets a stable URL (`/session/$id`) where `$id` is the `activeSessionId` (a client-generated UUID used as the key in the active session store). This enables:

- Browser back/forward (hash history) between sessions
- Direct sidebar links via `navigate({ to: '/session/$id' })`
- Clean separation: NewSessionPage owns the prompt UI, ActiveSessionView owns the xterm UI

### New Route Files

| File                     | Component           | Purpose                                              |
| ------------------------ | ------------------- | ---------------------------------------------------- |
| `routes/index.tsx`       | `NewSessionPage`    | Prompt textarea + workspace picker + session history |
| `routes/session.$id.tsx` | `ActiveSessionView` | Header bar + xterm for a running session             |
| `routes/projects.tsx`    | `ProjectsPage`      | Project list with inline edit panels                 |
| `routes/settings.tsx`    | (unchanged)         | Settings page                                        |

## Component Architecture

### Deleted Components

| Component                | Replacement                                             |
| ------------------------ | ------------------------------------------------------- |
| `ProjectTree.tsx`        | Sidebar running sessions list (inline in `Sidebar.tsx`) |
| `ProjectNode.tsx`        | —                                                       |
| `WorkspaceNode.tsx`      | —                                                       |
| `SidebarContextMenu.tsx` | —                                                       |
| `SplashScreen.tsx`       | — (app shows NewSessionPage immediately after init)     |

### Modified Components

#### `Sidebar.tsx` — Full Rewrite

```
┌──────────────────────┐
│ iara          [⚙]    │ ← header (settings gear)
├──────────────────────┤
│ [+ New Session]      │ ← navigates to /
│ [📁 Projects]        │ ← navigates to /projects
├──────────────────────┤
│ Running Sessions     │
│ ┌──────────────────┐ │
│ │ Fix login bug    │ │ ← title (truncated)
│ │ myapp / main   ✕ │ │ ← workspace label + close
│ └──────────────────┘ │
│ ┌──────────────────┐ │
│ │ New session      │ │ ← fallback title
│ │ myapp / feat-x ✕ │ │ ← workspace never truncated
│ └──────────────────┘ │
└──────────────────────┘
```

**Data source:** `useActiveSessionStore` — iterates `entries` Map, resolves workspace info via `useAppStore.getWorkspace()`.

**Session title resolution:** Each active session entry stores `title` and `initialPrompt`. Display priority:

1. `title` (set via `session:changed` push event when AI generates a title)
2. First line of `initialPrompt` (truncated)
3. `"New session"` fallback

**Interactions:**

- Click row → `navigate({ to: '/session/$id', params: { id } })`
- Click X → `activeSessionStore.destroy(id)` + navigate to `/` if was active
- Alt+1-9 → select by index from `activeSessionStore.orderedEntries`

#### `AppShell.tsx` — Simplify

- Remove `navigableItems` computation (no more project tree)
- Remove `useSidebarStore` dependency
- Alt+1-9 now indexes into `useActiveSessionStore.orderedEntries` instead of expanded project tree
- Layout structure unchanged (sidebar + main with resizable panels)

#### `MainPanel.tsx` — Scope Bottom/Right Panel to Active Workspace

- Currently derives workspace from `useAppStore.selectedWorkspaceId`
- New: derives workspace from **active context** — either the active session's workspace (when on `/session/$id`) or the selected workspace in the picker (when on `/`)
- New hook: `useActiveWorkspace()` replaces `useWorkspace()` — checks route first, falls back to picker selection

#### `BottomPanel.tsx` — Flatten Terminal Tabs

- Remove `ShellTab` component (the one with nested vertical sidebar)
- Remove `"terminal"` from `PanelTab` type
- Tab bar becomes: `Scripts | Output | Shell1 | Shell2 | ... | [+]`
- Each shell tab renders `ConnectedTerminal` directly (same as current `ShellTerminal`, just promoted to a tab)
- "+" pseudo-tab calls `shellStore.addShell(workspaceId)` and creates a new tab
- Shell tabs show X button, middle-click closes, confirmation if running
- When workspace changes (session switch), filter shells to show only current workspace's shells

#### `WorkspaceView.tsx` → Split into Two

**`ActiveSessionView`** (new route component at `routes/session.$id.tsx`):

- Header bar: project name, workspace name, git sync, open-in-editor, open-in-explorer, env toggle — extracted from current `WorkspaceView` header
- Below header: `ConnectedTerminal` with claude session's `terminalId`
- No back button (sidebar handles navigation)
- Reads session data from `useActiveSessionStore.getEntry(id)`

**Header bar** becomes a shared component `WorkspaceHeader.tsx`:

- Used by `ActiveSessionView`
- Props: `project`, `workspace`, `repoInfo`
- Contains: git sync, open-in-editor, open-in-explorer, env toggle

#### `RightPanel.tsx` — Update Workspace Source

- Currently reads `useAppStore.selectedWorkspaceId`
- Change to use `useActiveWorkspace()` hook

#### `SessionList.tsx` — Reuse on NewSessionPage

- Already supports both `workspaceId` and `projectId` props
- Used on NewSessionPage when a workspace is selected
- `onLaunch` callback now needs to flow through `activeSessionStore.create()` instead of `terminalStore.create()`

### New Components

#### `NewSessionPage` (`routes/index.tsx`)

```
┌─────────────────────────────────────────┐
│                                         │
│         ┌───────────────────┐           │
│         │ What do you want  │           │
│         │ to do?            │           │
│         │                   │           │
│         └───────────────────┘           │
│         [myapp / main      ▾] [Start]   │
│                                         │
│  ─────────────────────────────────────  │
│  Session History                        │
│  ┌─────────────────────────────────┐   │
│  │ Fix login bug — 2h ago, 12 msgs │   │
│  │ Add tests — yesterday, 8 msgs   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**State:**

- `prompt` (local state) — textarea content
- `selectedWorkspaceId` — from `useAppStore.selectedWorkspaceId` (persisted)

**Launch flow:**

1. User types prompt, selects workspace, presses Cmd/Ctrl+Enter or clicks Start
2. Calls `activeSessionStore.create(workspaceId, { initialPrompt })`
3. Store creates server terminal, gets `terminalId`/`sessionId`
4. Navigate to `/session/$newId`

**Workspace picker:** Opens `WorkspacePickerDialog` — lists all workspaces as `project / workspace` with search filter.

#### `WorkspacePickerDialog`

- Modal dialog using existing `DialogShell` component
- Lists all workspaces from `useAppStore.projects` flattened as `project.name / workspace.name`
- Search input at top filters by project name or workspace name
- Click selects → calls `useAppStore.selectWorkspace(id)` → dialog closes
- Groups are optional visual enhancement (flat list with labels is simpler)

#### `ProjectsPage` (`routes/projects.tsx`)

```
┌─────────────────────────────────────────┐
│ Projects                    [+ New]     │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ myapp (3 workspaces)           [⚙]  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ backend-api (1 workspace)      [⚙]  │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Repos: api-server, shared-lib  │ │ │
│ │ │ [+ Add Repo]                   │ │ │
│ │ │ [Regenerate CLAUDE.md]         │ │ │
│ │ │ [+ Create Workspace]          │ │ │
│ │ │ [Delete Project]              │ │ │
│ │ └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- Clicking project name → `selectWorkspace(mainWorkspaceId)` + `navigate({ to: '/' })`
- Gear icon toggles inline edit panel (absorbs `EditProjectView` functionality)
- Inline edit panel reuses: `RepoCard`, `AddRepoDialog`, `CreateWorkspaceDialog`, `ClaudeMdView`, regeneration logic from `useRegenerate` hook

## Store Changes

### `stores/terminal.ts` → `stores/activeSession.ts`

**Renames:**

- `useTerminalStore` → `useActiveSessionStore`
- `TerminalEntry` → `ActiveSessionEntry`
- `TerminalStatus` → `ActiveSessionStatus`

**New fields on `ActiveSessionEntry`:**

```typescript
interface ActiveSessionEntry {
  id: string; // NEW: client-generated UUID (key in Map)
  workspaceId: string; // NEW: moved from Map key to entry
  terminalId: string | null;
  sessionId: string | null;
  status: ActiveSessionStatus;
  exitCode: number | null;
  errorCode: string | null;
  hasData: boolean;
  initialPrompt: string | null; // NEW: for sidebar title fallback
  title: string | null; // NEW: AI-generated title from session:changed
}
```

**Key change: Map key is `id` (client UUID), not `workspaceId`.**

This enables multiple simultaneous sessions (even for the same workspace, though the server currently enforces one claude terminal per workspace — that constraint lives in `TerminalManager.create()` and can be relaxed later).

**New actions:**

```typescript
interface ActiveSessionActions {
  create(
    workspaceId: string,
    opts?: { initialPrompt?: string; resumeSessionId?: string; sessionCwd?: string },
  ): Promise<string>; // returns id
  destroy(id: string): Promise<void>;
  restart(id: string): Promise<void>;
  getEntry(id: string): ActiveSessionEntry | undefined;
  handleExit(terminalId: string, exitCode: number): void;
  updateTitle(sessionId: string, title: string): void; // NEW
  // orderedEntries: derived — entries ordered by creation time
}
```

**Title updates:** Subscribe to `session:changed` push events. When a session file changes, the server re-parses it and the client can fetch the updated title. The `updateTitle` action is called when the session watcher detects a title change. Implementation: listen for `session:changed`, then fetch session info from `sessions.list`, match by `sessionId`, and update the entry's `title`.

### `stores/sidebar.ts` → DELETE

- `expandedProjectIds` and `projectOrder` are no longer needed
- No replacement — sidebar state is derived from `activeSessionStore`

### `stores/panels.ts` — Simplify

- Remove `editingProjectId` — editing moves to `/projects` route (local state)
- Keep `rightPanelOpen`, `rightPanelWidth`

### `stores/app.ts` — Minor Changes

- `selectedWorkspaceId` remains — used by NewSessionPage workspace picker
- `selectWorkspace()` — remove `usePanelsStore.setEditingProjectId(null)` call
- Session-related methods unchanged (used by NewSessionPage session history)

### `stores/scripts.ts` — Tab Type Change

- `PanelTab` type: remove `"terminal"`, add dynamic shell tab IDs
- Actually, simpler: keep `activeTab` as `string | null` where values are `"scripts"`, `"output"`, or a shell ID (UUID)
- `syncCollapsed` logic unchanged

### `stores/shell.ts` — Minor Changes

- Add `destroyByWorkspaceId(workspaceId: string)` action — destroys all shells for a workspace
- Used by workspace cleanup (R7)

### `stores/sessions.ts` — Unchanged

- Already supports `loadForWorkspace` and `loadForProject`
- Used by NewSessionPage for session history display

## Server Changes

### `packages/contracts/src/ws.ts`

Add `initialPrompt` to `terminal.create` params:

```typescript
"terminal.create": {
  params: {
    workspaceId: string;
    mode?: "claude" | "shell";
    resumeSessionId?: string;
    sessionCwd?: string;
    initialPrompt?: string;  // NEW
    cols?: number;
    rows?: number;
  };
  result: { terminalId: string; sessionId: string };
};
```

### `apps/server/src/services/launcher.ts`

Add `initialPrompt` to `LaunchConfig`:

```typescript
export interface LaunchConfig {
  // ... existing fields ...
  initialPrompt?: string | undefined; // NEW
}
```

Add to `buildClaudeArgs`:

```typescript
// At the end, after all flags:
if (config.initialPrompt) {
  args.push(config.initialPrompt); // positional arg for claude "query"
}
```

### `apps/server/src/handlers/terminal.ts`

Pass `initialPrompt` through to `manager.create()`:

```typescript
// In the claude mode branch, add to the config object:
...(params.initialPrompt != null ? { initialPrompt: params.initialPrompt } : {}),
```

### `apps/server/src/services/terminal.ts`

Add `initialPrompt` to `TerminalCreateConfig`:

```typescript
interface TerminalCreateConfig {
  // ... existing fields ...
  initialPrompt?: string; // NEW
}
```

Pass to `LaunchConfig` in `create()`:

```typescript
const launchConfig: LaunchConfig = {
  // ... existing fields ...
  initialPrompt: config.initialPrompt,
};
```

## New Hooks

### `useActiveWorkspace(): string | null`

Replaces `useWorkspace()`. Determines the "current" workspace based on context:

```typescript
export function useActiveWorkspace(): string | null {
  const routeMatch = useMatch({ from: "/session/$id", shouldThrow: false });
  const activeSessionEntry = useActiveSessionStore((s) => {
    if (!routeMatch) return null;
    return s.getEntry(routeMatch.params.id);
  });
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId);

  // On session page: use session's workspace
  if (activeSessionEntry) return activeSessionEntry.workspaceId;
  // On new session / projects page: use picker selection
  return selectedWorkspaceId;
}
```

This is used by `BottomPanel`, `RightPanel`, and `ScriptsStore` config loading.

## Workspace Cleanup (R7)

When an active session is destroyed or exits:

```typescript
// In activeSessionStore.destroy() or handleExit():
const entry = get().entries.get(id);
if (!entry) return;

// Check if this was the last session for the workspace
const remainingSessions = [...get().entries.values()].filter(
  (e) => e.id !== id && e.workspaceId === entry.workspaceId,
);

if (remainingSessions.length === 0) {
  // Cleanup workspace resources
  const { useScriptsStore } = await import("./scripts");
  const { useShellStore } = await import("./shell");

  await useScriptsStore.getState().stopAll(entry.workspaceId);
  useShellStore.getState().destroyByWorkspaceId(entry.workspaceId);
}
```

## Data Flow Diagrams

### Launch Session Flow

```
User types prompt → clicks Start / Cmd+Ctrl+Enter
  ↓
NewSessionPage: activeSessionStore.create(workspaceId, { initialPrompt })
  ↓
activeSessionStore: generates id, sets status="connecting"
  ↓
transport.request("terminal.create", { workspaceId, initialPrompt })
  ↓
Server handler: builds claude args with initialPrompt as positional arg
  ↓
TerminalManager.create(): spawns PTY with `claude --flags "initial prompt"`
  ↓
Returns { terminalId, sessionId }
  ↓
activeSessionStore: sets status="active", stores terminalId/sessionId
  ↓
navigate({ to: '/session/$id' })
  ↓
ActiveSessionView mounts: renders ConnectedTerminal with terminalId
```

### Session Title Update Flow

```
Claude generates title → writes to JSONL file
  ↓
SessionWatcher detects file change → pushes "session:changed"
  ↓
Client receives push → refreshSessions(workspaceId)
  ↓
Compares sessions with activeSessionStore entries by sessionId
  ↓
activeSessionStore.updateTitle(sessionId, title)
  ↓
Sidebar re-renders with new title
```

### Session Switch Flow

```
User clicks session in sidebar
  ↓
navigate({ to: '/session/$id' })
  ↓
ActiveSessionView mounts with new id
  ↓
useActiveWorkspace() returns new workspace
  ↓
BottomPanel re-scopes: filters shells to new workspace, reloads scripts config
  ↓
RightPanel re-scopes: shows env for new workspace
```

## Migration Path

### Phase 1: Foundation (no visual changes yet)

1. Rename `stores/terminal.ts` → `stores/activeSession.ts` with new types
2. Add `initialPrompt` to contracts, server handler, launcher, terminal manager
3. Create `useActiveWorkspace` hook
4. Add `destroyByWorkspaceId` to shell store

### Phase 2: New Routes & Pages

5. Create `routes/session.$id.tsx` (ActiveSessionView)
6. Create `routes/projects.tsx` (ProjectsPage)
7. Rewrite `routes/index.tsx` (NewSessionPage)
8. Extract `WorkspaceHeader` from WorkspaceView
9. Create `WorkspacePickerDialog`

### Phase 3: Sidebar & Navigation

10. Rewrite `Sidebar.tsx` — running sessions list, nav buttons
11. Update `AppShell.tsx` — Alt+1-9 for sessions
12. Add workspace cleanup logic (R7)

### Phase 4: Bottom Panel

13. Flatten terminal tabs in `BottomPanel.tsx`
14. Remove `ShellTab` component
15. Update `scripts.ts` tab types

### Phase 5: Cleanup

16. Delete: `ProjectTree.tsx`, `ProjectNode.tsx`, `WorkspaceNode.tsx`, `SidebarContextMenu.tsx`, `SplashScreen.tsx`
17. Delete `stores/sidebar.ts` + its test + cache schema entries
18. Remove `editingProjectId` from `panels.ts`
19. Remove stale imports and update tests

## Tech Decisions

### TD1: Route-based session views vs conditional rendering

**Choice:** Routes (`/session/$id`)
**Rationale:** Enables URL-driven navigation, back/forward, and clean component boundaries. The current conditional rendering in WorkspaceView made the component do too many things.

### TD2: Client-generated session IDs as Map keys

**Choice:** UUID generated in `activeSessionStore.create()`, not `workspaceId`
**Rationale:** Allows multiple sessions per workspace in the future. Decouples session identity from workspace identity.

### TD3: Workspace picker as dialog vs inline dropdown

**Choice:** Dialog (per spec D3)
**Rationale:** More room for search, grouped display, and future enhancements (workspace creation from picker).

### TD4: Shell tabs as dynamic entries in bottom panel tab bar

**Choice:** Each shell = its own tab alongside Scripts and Output
**Rationale:** Matches VS Code terminal UX. Removes one level of nesting. Tab bar already exists — just extend it.

### TD5: Title updates via session:changed push + session list refresh

**Choice:** Piggyback on existing `session:changed` / `sessions.list` infrastructure
**Rationale:** No new server endpoints needed. Session watcher already monitors JSONL files and pushes changes. Client already has `refreshSessions` that parses titles from JSONL.
