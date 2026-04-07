# App Redesign Tasks

**Design**: `.specs/features/app-redesign/design.md`
**Status**: Done

---

## Gate Check Commands

| Level | Command                                                      |
| ----- | ------------------------------------------------------------ |
| Quick | `bun typecheck`                                              |
| Build | `bun typecheck && bun lint && bun fmt:check`                 |
| Full  | `bun typecheck && bun lint && bun fmt:check && bun run test` |

---

## Execution Plan

### Phase 1: Foundation (Sequential)

No visual changes. Rename store, add server plumbing, create hooks.

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Routes & Pages (Partially Parallel)

New route components and shared UI.

```
T6 (WorkspaceHeader) → T7 (ActiveSessionView)
                     → T8 (WorkspacePickerDialog) → T9 (NewSessionPage)
                                                   → T10 (ProjectsPage)
```

### Phase 3: Sidebar & Navigation (Sequential)

```
T11 (Sidebar rewrite) → T12 (AppShell) → T13 (Cleanup logic)
```

### Phase 4: Bottom Panel (Sequential)

```
T14 (Tab types) → T15 (Flatten terminal tabs)
```

### Phase 5: Cleanup (Partially Parallel)

```
     ┌→ T16 (Delete old components) [P]
T15 ─┼→ T17 (Delete sidebar store) [P]
     └→ T18 (Update root + fix imports) [P]
```

---

## Task Breakdown

### T1: Rename `stores/terminal.ts` → `stores/activeSession.ts` with new types

**What**: Rename the store file, update all types (`TerminalEntry` → `ActiveSessionEntry`, `TerminalStatus` → `ActiveSessionStatus`, `useTerminalStore` → `useActiveSessionStore`), re-key the Map by client UUID instead of `workspaceId`, add `id`, `workspaceId`, `initialPrompt`, `title` fields to entries, add `updateTitle` and `orderedEntries`. Update all existing imports across the codebase.
**Where**: `apps/web/src/stores/terminal.ts` → `apps/web/src/stores/activeSession.ts`, plus all importers
**Depends on**: None
**Reuses**: Existing store logic, just renames + adds fields
**Requirement**: Spec naming convention table, design store changes section

**Done when**:

- [ ] File renamed to `activeSession.ts`
- [ ] All types renamed (`ActiveSessionEntry`, `ActiveSessionStatus`, `useActiveSessionStore`)
- [ ] Map keyed by client UUID (`id`) not `workspaceId`
- [ ] Entry has `id`, `workspaceId`, `initialPrompt`, `title` fields
- [ ] `create()` accepts `opts?: { initialPrompt?, resumeSessionId?, sessionCwd? }` and returns `id`
- [ ] `orderedEntries` derived getter (entries ordered by insertion/creation)
- [ ] `updateTitle(sessionId, title)` action added
- [ ] All imports across codebase updated
- [ ] Gate check passes: `bun typecheck`

**Tests**: none (rename + field additions, existing test updated in place)
**Gate**: quick

---

### T2: Add `initialPrompt` to contracts

**What**: Add `initialPrompt?: string` to `terminal.create` params in `ws.ts`. Add to `DesktopBridge.terminalCreate` in `ipc.ts`.
**Where**: `packages/contracts/src/ws.ts`, `packages/contracts/src/ipc.ts`
**Depends on**: None
**Reuses**: Existing param patterns in `terminal.create`
**Requirement**: R1.5, design server changes section

**Done when**:

- [ ] `terminal.create` params in `ws.ts` include `initialPrompt?: string`
- [ ] `DesktopBridge.terminalCreate` in `ipc.ts` includes `initialPrompt?: string`
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T3: Add `initialPrompt` to server (launcher + handler + terminal manager)

**What**: Thread `initialPrompt` through the server: add to `LaunchConfig`, `buildClaudeArgs` (as positional arg at end), `TerminalCreateConfig`, terminal handler, and terminal manager `create()`.
**Where**: `apps/server/src/services/launcher.ts`, `apps/server/src/handlers/terminal.ts`, `apps/server/src/services/terminal.ts`
**Depends on**: T2
**Reuses**: Existing `LaunchConfig` and `buildClaudeArgs` patterns
**Requirement**: R1.5, design server changes section

**Done when**:

- [ ] `LaunchConfig` has `initialPrompt?: string`
- [ ] `buildClaudeArgs` appends `initialPrompt` as last positional arg when present
- [ ] `TerminalCreateConfig` has `initialPrompt?: string`
- [ ] Terminal handler passes `params.initialPrompt` to manager
- [ ] Terminal manager passes `initialPrompt` to `LaunchConfig`
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T4: Create `useActiveWorkspace` hook

**What**: Create a hook that returns the "current" workspace ID by checking the route first (if on `/session/$id`, use that session's workspace), then falling back to `selectedWorkspaceId` from app store.
**Where**: `apps/web/src/lib/workspace.ts` (replace existing `useWorkspace`)
**Depends on**: T1
**Reuses**: Existing `useWorkspace` hook in `apps/web/src/lib/workspace.ts`
**Requirement**: Design "New Hooks" section

**Done when**:

- [ ] `useActiveWorkspace()` exported from `lib/workspace.ts`
- [ ] Checks route match for `/session/$id` first, returns session's `workspaceId`
- [ ] Falls back to `useAppStore.selectedWorkspaceId`
- [ ] Old `useWorkspace` replaced or kept as alias if still used
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T5: Add `destroyByWorkspaceId` to shell store

**What**: Add action to destroy all shell terminals for a given workspace. Used by R7 cleanup.
**Where**: `apps/web/src/stores/shell.ts`
**Depends on**: None
**Reuses**: Existing `removeShell` action pattern
**Requirement**: R7, design store changes section

**Done when**:

- [ ] `destroyByWorkspaceId(workspaceId: string)` action exists
- [ ] Iterates shells, calls `transport.request("terminal.destroy")` for each matching shell, removes from state
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T6: Extract `WorkspaceHeader` component from `WorkspaceView`

**What**: Extract the header bar (project name, workspace name, git sync, open-in-editor, open-in-explorer, env toggle) from `WorkspaceView.tsx` into a standalone `WorkspaceHeader.tsx` component. Takes `project`, `workspace`, `repoInfo` as props.
**Where**: `apps/web/src/components/WorkspaceHeader.tsx` (new), `apps/web/src/components/WorkspaceView.tsx` (modify to use it)
**Depends on**: T1
**Reuses**: Existing header code in `WorkspaceView.tsx`
**Requirement**: R4.1, R4.2, design component architecture

**Done when**:

- [ ] `WorkspaceHeader.tsx` exists with extracted header UI
- [ ] Props: project, workspace, repoInfo (no back button)
- [ ] `WorkspaceView.tsx` uses `WorkspaceHeader` (keeps existing behavior)
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T7: Create `routes/session.$id.tsx` (ActiveSessionView)

**What**: New route component that shows `WorkspaceHeader` + `ConnectedTerminal` for a running Claude session. Reads session data from `useActiveSessionStore.getEntry(id)`. Redirects to `/` if session not found.
**Where**: `apps/web/src/routes/session.$id.tsx` (new)
**Depends on**: T1, T6
**Reuses**: `WorkspaceHeader`, `ConnectedTerminal`, patterns from `TerminalView.tsx`
**Requirement**: R4.1, R4.2, R4.3

**Done when**:

- [ ] Route file created with TanStack Router conventions
- [ ] Renders `WorkspaceHeader` + `ConnectedTerminal`
- [ ] Gets session entry from `useActiveSessionStore`
- [ ] Resolves workspace/project from app store
- [ ] Redirects to `/` if session ID not found in store
- [ ] Exit overlay with restart option (from TerminalView patterns)
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T8: Create `WorkspacePickerDialog`

**What**: Modal dialog listing all workspaces as `project / workspace` with search filter. Uses existing `DialogShell` pattern. Selecting a workspace calls `useAppStore.selectWorkspace(id)`.
**Where**: `apps/web/src/components/WorkspacePickerDialog.tsx` (new)
**Depends on**: None
**Reuses**: `DialogShell` or existing dialog patterns (`CreateProjectDialog`, `CreateWorkspaceDialog`)
**Requirement**: R1.2, R1.4, R1.9, D3

**Done when**:

- [ ] Dialog component created
- [ ] Lists all workspaces from `useAppStore.projects` as `project.name / workspace.name`
- [ ] Search input filters by project name or workspace name
- [ ] Click selects workspace and closes dialog
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T9: Rewrite `routes/index.tsx` (NewSessionPage)

**What**: Replace current home page with centered prompt textarea, workspace picker button, start button, and session history (shown when workspace selected). Launches session via `activeSessionStore.create()` and navigates to `/session/$id`.
**Where**: `apps/web/src/routes/index.tsx` (rewrite)
**Depends on**: T1, T4, T8
**Reuses**: `SessionList` component, `WorkspacePickerDialog`, `useActiveSessionStore`
**Requirement**: R1.1-R1.8, D4, D6

**Done when**:

- [ ] Centered textarea for prompt input
- [ ] Workspace picker button showing `project / workspace` or "Select workspace"
- [ ] Start button disabled until workspace selected
- [ ] Cmd/Ctrl+Enter launches session; plain Enter inserts newline
- [ ] Empty textarea launches blank session (no initial prompt)
- [ ] Session history shown below when workspace is selected (using `SessionList`)
- [ ] Textarea focused on mount
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T10: Create `routes/projects.tsx` (ProjectsPage)

**What**: New route showing all projects with inline edit panels. Clicking project name navigates to home with workspace pre-selected. Gear icon expands edit panel (repos, CLAUDE.md regeneration, create workspace, delete project).
**Where**: `apps/web/src/routes/projects.tsx` (new)
**Depends on**: T1
**Reuses**: `EditProjectView` functionality, `RepoCard`, `AddRepoDialog`, `CreateWorkspaceDialog`, `ClaudeMdView`, `useRegenerate`
**Requirement**: R3.1-R3.6, D2

**Done when**:

- [ ] Route file created at `/projects`
- [ ] Lists all projects with name and workspace count
- [ ] Clicking project name → `selectWorkspace(mainWorkspaceId)` + navigate to `/`
- [ ] Gear icon toggles inline edit panel per project
- [ ] Edit panel: repo list, add repo, CLAUDE.md regeneration, create workspace, delete project
- [ ] "New Project" button triggers `CreateProjectDialog`
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T11: Rewrite `Sidebar.tsx`

**What**: Replace project tree with: header (settings gear), "New Session" button (→ `/`), "Projects" button (→ `/projects`), running sessions list from `useActiveSessionStore`. Session rows show title (truncated) + workspace label (never truncated) + close button.
**Where**: `apps/web/src/components/Sidebar.tsx` (rewrite)
**Depends on**: T1, T7, T9, T10
**Reuses**: Existing sidebar header pattern, `useActiveSessionStore`
**Requirement**: R2.1-R2.6, D1

**Done when**:

- [ ] "New Session" button navigates to `/`
- [ ] "Projects" button navigates to `/projects`
- [ ] Running sessions list from `useActiveSessionStore.orderedEntries`
- [ ] Title resolution: AI title → first line of initialPrompt → "New session"
- [ ] Workspace label as `project / workspace`, never truncated
- [ ] Close button calls `activeSessionStore.destroy(id)`, navigates to `/` if was active
- [ ] Active session highlighted
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T12: Update `AppShell.tsx` — Alt+1-9 for sessions

**What**: Replace project-tree based Alt+1-9 navigation with session-based. Alt+N selects the Nth running session from `useActiveSessionStore.orderedEntries`. Remove `useSidebarStore` dependency and `navigableItems` computation.
**Where**: `apps/web/src/components/AppShell.tsx`
**Depends on**: T1, T11
**Reuses**: Existing keyboard shortcut handler pattern
**Requirement**: R2.7, D5

**Done when**:

- [ ] Alt+1-9 navigates to `/session/$id` for the Nth active session
- [ ] No-op if no session at that index
- [ ] `navigableItems` computation removed
- [ ] `useSidebarStore` import removed
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T13: Add workspace cleanup logic (R7)

**What**: When the last running Claude session for a workspace is destroyed or exits, automatically stop all scripts and destroy all shell terminals for that workspace.
**Where**: `apps/web/src/stores/activeSession.ts` (modify `destroy` and `handleExit`)
**Depends on**: T1, T5
**Reuses**: `useScriptsStore.stopAll`, `useShellStore.destroyByWorkspaceId`
**Requirement**: R7.1-R7.3, D8

**Done when**:

- [ ] After destroying/exiting a session, checks if it was the last for that workspace
- [ ] If last: calls `scriptsStore.stopAll(workspaceId)` and `shellStore.destroyByWorkspaceId(workspaceId)`
- [ ] Only triggered by session close/kill, not manual terminal tab closure
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T14: Update `scripts.ts` tab types

**What**: Change `PanelTab` type from `"scripts" | "output" | "terminal" | null` to `string | null` where values are `"scripts"`, `"output"`, or a shell UUID. Remove `"terminal"` literal.
**Where**: `apps/web/src/stores/scripts.ts`
**Depends on**: None
**Reuses**: Existing tab management logic
**Requirement**: R5.3, D7, design store changes

**Done when**:

- [ ] `PanelTab` type is `string | null`
- [ ] `"terminal"` value removed from all usage
- [ ] Existing tab logic still works for `"scripts"` and `"output"`
- [ ] Gate check passes: `bun typecheck`

**Tests**: none (type change + value removal)
**Gate**: quick

---

### T15: Flatten terminal tabs in `BottomPanel.tsx`

**What**: Remove `ShellTab` component (nested vertical sidebar). Each shell becomes its own tab in the bottom panel tab bar. Add "+" pseudo-tab to create new shells. Shell tabs show X button with close confirmation. Filter shells by active workspace.
**Where**: `apps/web/src/components/BottomPanel.tsx`
**Depends on**: T4, T5, T14
**Reuses**: `ConnectedTerminal`, `ShellTerminal` rendering logic, existing close confirmation
**Requirement**: R5.1-R5.5, D7

**Done when**:

- [ ] Tab bar: Scripts | Output | Shell1 | Shell2 | ... | [+]
- [ ] `ShellTab` component removed (the one with vertical sidebar)
- [ ] Each shell tab renders `ConnectedTerminal` directly
- [ ] "+" tab calls `shellStore.addShell(workspaceId)` using `useActiveWorkspace()`
- [ ] Shell tabs show X, middle-click closes, confirmation if process running
- [ ] Shells filtered to show only current workspace's shells
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T16: Delete old components [P]

**What**: Delete `ProjectTree.tsx`, `ProjectNode.tsx`, `WorkspaceNode.tsx`, `SidebarContextMenu.tsx`, `SplashScreen.tsx`. Remove their imports from any remaining files.
**Where**: `apps/web/src/components/` (delete 5 files)
**Depends on**: T11, T12
**Reuses**: None
**Requirement**: Spec "Screens/components to DELETE" table

**Done when**:

- [ ] All 5 files deleted
- [ ] No remaining imports of deleted components
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T17: Delete `stores/sidebar.ts` + simplify `panels.ts` [P]

**What**: Delete `stores/sidebar.ts` and its test file. Remove `editingProjectId` from `panels.ts`. Remove `setEditingProjectId` call from `app.ts` `selectWorkspace`. Remove all imports of `useSidebarStore` and `usePanelsStore.editingProjectId`.
**Where**: `apps/web/src/stores/sidebar.ts` (delete), `apps/web/src/stores/sidebar.test.ts` (delete), `apps/web/src/stores/panels.ts` (modify), `apps/web/src/stores/app.ts` (modify)
**Depends on**: T11, T12
**Reuses**: None
**Requirement**: Spec stores affected table, design store changes

**Done when**:

- [ ] `sidebar.ts` and `sidebar.test.ts` deleted
- [ ] `editingProjectId` removed from `panels.ts`
- [ ] `setEditingProjectId(null)` call removed from `app.ts` `selectWorkspace`
- [ ] No remaining imports of `useSidebarStore`
- [ ] Gate check passes: `bun typecheck`

**Tests**: none
**Gate**: quick

---

### T18: Update `__root.tsx`, `MainPanel.tsx`, `RightPanel.tsx` + fix stale imports [P]

**What**: Update `__root.tsx` to import `activeSession` instead of `terminal`. Update `MainPanel.tsx` and `RightPanel.tsx` to use `useActiveWorkspace()`. Remove `EditProjectView` from `routes/index.tsx` (already rewritten). Fix any remaining stale imports across codebase. Remove `WorkspaceView.tsx` if fully replaced. Delete `terminal.test.ts` if the store was renamed.
**Where**: `apps/web/src/routes/__root.tsx`, `apps/web/src/components/MainPanel.tsx`, `apps/web/src/components/RightPanel.tsx`, various
**Depends on**: T1, T4, T9, T15
**Reuses**: `useActiveWorkspace` hook
**Requirement**: Design component architecture (MainPanel, RightPanel sections)

**Done when**:

- [ ] `__root.tsx` imports `~/stores/activeSession` instead of `~/stores/terminal`
- [ ] `MainPanel.tsx` uses `useActiveWorkspace()` for workspace scoping
- [ ] `RightPanel.tsx` uses `useActiveWorkspace()`, removes `editingProjectId` check
- [ ] `WorkspaceView.tsx` deleted or gutted (functionality moved to ActiveSessionView + WorkspaceHeader)
- [ ] `EditProjectView.tsx` deleted (functionality moved to ProjectsPage)
- [ ] No stale imports remain
- [ ] Gate check passes: `bun typecheck && bun lint && bun fmt:check`

**Tests**: none
**Gate**: build

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 → T2 → T3
  T4 (after T1)
  T5 (independent)

Phase 2 (Partially Parallel):
  T6 (after T1)
  T7 (after T1, T6) [P with T8]
  T8 (independent) [P with T7]
  T9 (after T1, T4, T8)
  T10 (after T1) [P with T9]

Phase 3 (Sequential):
  T11 (after T1, T7, T9, T10)
  T12 (after T1, T11)
  T13 (after T1, T5)

Phase 4 (Sequential):
  T14 (independent)
  T15 (after T4, T5, T14)

Phase 5 (Parallel):
  T16 (after T11, T12) [P]
  T17 (after T11, T12) [P]
  T18 (after T1, T4, T9, T15) [P]
```

---

## Validation Tables

### Task Granularity Check

| Task                                        | Scope                                 | Status                                                       |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| T1: Rename terminal store                   | 1 store file + import updates         | ✅ Granular                                                  |
| T2: Add initialPrompt to contracts          | 2 type files                          | ✅ Granular                                                  |
| T3: Add initialPrompt to server             | 3 server files (same field threading) | ✅ Granular                                                  |
| T4: Create useActiveWorkspace hook          | 1 hook file                           | ✅ Granular                                                  |
| T5: Add destroyByWorkspaceId                | 1 action in 1 store                   | ✅ Granular                                                  |
| T6: Extract WorkspaceHeader                 | 1 new component + 1 modify            | ✅ Granular                                                  |
| T7: Create ActiveSessionView route          | 1 route file                          | ✅ Granular                                                  |
| T8: Create WorkspacePickerDialog            | 1 component                           | ✅ Granular                                                  |
| T9: Rewrite NewSessionPage                  | 1 route file (rewrite)                | ✅ Granular                                                  |
| T10: Create ProjectsPage                    | 1 route file                          | ⚠️ Larger (absorbs EditProjectView) but cohesive single page |
| T11: Rewrite Sidebar                        | 1 component (rewrite)                 | ✅ Granular                                                  |
| T12: Update AppShell                        | 1 component (modify shortcuts)        | ✅ Granular                                                  |
| T13: Workspace cleanup logic                | 1 store (add cleanup to 2 actions)    | ✅ Granular                                                  |
| T14: Update tab types                       | 1 store type change                   | ✅ Granular                                                  |
| T15: Flatten terminal tabs                  | 1 component (major modify)            | ⚠️ Larger but single component                               |
| T16: Delete old components                  | 5 file deletions                      | ✅ Granular (just deletions)                                 |
| T17: Delete sidebar store + simplify panels | 2 deletions + 2 modifications         | ✅ Granular                                                  |
| T18: Update root + fix imports              | 3-5 file updates                      | ⚠️ Cleanup sweep, acceptable as final task                   |

### Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows                | Status   |
| ---- | ----------------- | ---------------------------- | -------- |
| T1   | None              | None                         | ✅ Match |
| T2   | None              | None                         | ✅ Match |
| T3   | T2                | T2 → T3                      | ✅ Match |
| T4   | T1                | T1 → T4                      | ✅ Match |
| T5   | None              | Independent                  | ✅ Match |
| T6   | T1                | T1 → T6                      | ✅ Match |
| T7   | T1, T6            | T6 → T7 (T1 implicit via T6) | ✅ Match |
| T8   | None              | Independent                  | ✅ Match |
| T9   | T1, T4, T8        | T8 → T9, T1/T4 implicit      | ✅ Match |
| T10  | T1                | After T1                     | ✅ Match |
| T11  | T1, T7, T9, T10   | After T7, T9, T10            | ✅ Match |
| T12  | T1, T11           | T11 → T12                    | ✅ Match |
| T13  | T1, T5            | After T1, T5                 | ✅ Match |
| T14  | None              | Independent                  | ✅ Match |
| T15  | T4, T5, T14       | After T4, T5, T14            | ✅ Match |
| T16  | T11, T12          | After T11, T12 [P]           | ✅ Match |
| T17  | T11, T12          | After T11, T12 [P]           | ✅ Match |
| T18  | T1, T4, T9, T15   | After T1, T4, T9, T15 [P]    | ✅ Match |

### Test Co-location Validation

No TESTING.md exists. All tasks use `Tests: none` with gate checks (`bun typecheck` or build-level). This is acceptable for a UI/store refactor with no defined test coverage matrix. Existing tests for renamed stores are updated in-place (T1 updates terminal.test.ts → activeSession.test.ts).

| Task   | Code Layer                                  | Tests | Gate        | Status                     |
| ------ | ------------------------------------------- | ----- | ----------- | -------------------------- |
| T1-T18 | Stores, components, routes, server handlers | none  | quick/build | ✅ OK (no coverage matrix) |
