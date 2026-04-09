# App Redesign

## Summary

Restructure the app's navigation and primary UX flow. The current project-tree sidebar + workspace-view main panel is replaced with a chat-first experience: a prompt textarea as the primary action, running sessions in the sidebar, and a projects page for selection and management.

## Current State

### Screens that exist today

1. **Home (`/`)** — Shows `WorkspaceView` when a workspace is selected, `EditProjectView` when editing a project, or an empty "Select a project" placeholder
2. **Settings (`/settings`)** — Notification, Claude Code, and appearance settings
3. **WorkspaceView** — Header bar + session list OR terminal. Shows CLAUDE.md, sessions, git sync, env editor (right panel)
4. **EditProjectView** — CLAUDE.md regeneration, repo management, delete project
5. **Sidebar** — Project tree (expandable projects → workspaces), "New Project" button, Settings button

### Screens/components to DELETE or heavily refactor

| Component                | Action     | Reason                                               |
| ------------------------ | ---------- | ---------------------------------------------------- |
| `ProjectTree`            | **DELETE** | Replaced by running sessions list + projects page    |
| `ProjectNode`            | **DELETE** | No longer needed — no tree structure in sidebar      |
| `WorkspaceNode`          | **DELETE** | No longer needed — no tree structure in sidebar      |
| `SidebarContextMenu`     | **DELETE** | Context menu for tree nodes no longer applies        |
| `EditProjectView`        | **MOVE**   | Absorbed into the Projects page as inline edit panel |
| `SplashScreen`           | **DELETE** | Replaced by the new home screen                      |
| `CreateProjectDialog`    | **KEEP**   | Triggered from Projects page                         |
| `CreateWorkspaceDialog`  | **KEEP**   | Triggered from Projects page                         |
| `FallbackCreationDialog` | **REVIEW** | May still be needed                                  |

### Stores affected

| Store                              | Change                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `sidebar.ts`                       | Remove `expandedProjectIds`, `projectOrder` — no tree                                              |
| `panels.ts`                        | Remove `editingProjectId` — editing moves to Projects page                                         |
| `app.ts`                           | Track running sessions; add cross-workspace session loading for New Session page                   |
| `terminal.ts` → `activeSession.ts` | Needs to track multiple running sessions (currently keyed by workspaceId)                          |
| `scripts.ts`                       | `activeTab` type changes — terminal tabs are now individual per shell, not a single "terminal" tab |
| `shell.ts`                         | Shells become tabs in bottom panel tab bar instead of nested inside a "Terminal" tab               |

## Naming Convention

| Concept                       | Component           | Store                     | Server mode      |
| ----------------------------- | ------------------- | ------------------------- | ---------------- |
| Claude session (main area)    | `ActiveSessionView` | `activeSession.ts`        | `mode: "claude"` |
| Shell terminal (bottom panel) | `TerminalView`      | `shell.ts` (unchanged)    | `mode: "shell"`  |
| Session history (data)        | —                   | `sessions.ts` (unchanged) | —                |

- **Session** = a Claude Code interactive session (the AI agent)
- **Active Session** = a currently running Claude session with a live process
- **Terminal** = plain shell terminal (bash/zsh) in the bottom panel

### Stores

| Store              | Responsibility                                                        |
| ------------------ | --------------------------------------------------------------------- |
| `activeSession.ts` | Running Claude sessions — create, destroy, PTY lifecycle, handle exit |
| `sessions.ts`      | Session history — fetch lists from server, data cache                 |
| `shell.ts`         | Bottom panel shell terminals (unchanged)                              |

Kept separate: active session manages live processes, sessions store is a data cache. Different concerns, different side effects.

### Renames

| Current                          | New                       |
| -------------------------------- | ------------------------- |
| `stores/terminal.ts`             | `stores/activeSession.ts` |
| `TerminalView` component         | `ActiveSessionView`       |
| `TerminalEntry` type             | `ActiveSessionEntry`      |
| `useTerminalStore`               | `useActiveSessionStore`   |
| `ShellTerminal` (in BottomPanel) | `TerminalView`            |

## Requirements

### R1: New Session Page (Home / Main Content Area)

**R1.1** When no session is active, the main content area shows a centered prompt textarea where the user types what they want to do.

**R1.2** Below the textarea, a button shows the currently selected workspace (formatted as `project / workspace`) or "Select workspace". Clicking it opens a **workspace picker dialog** listing all workspaces grouped or formatted as `project / workspace`. Selecting one sets the working directory for the new session.

**R1.3** A workspace must be selected to launch a session. The "Start" button / Cmd+Ctrl+Enter is disabled until a workspace is chosen.

**R1.4** If a workspace is pre-selected (e.g., came from the Projects page), the button shows that workspace. Clicking it opens the dialog to change it.

**R1.5** Pressing **Cmd/Ctrl+Enter** or clicking a "Start" button launches a new Claude session in the selected workspace with the typed prompt **sent as the first message**. Plain Enter inserts a newline in the textarea. If the textarea is empty, a blank session is launched (no first message).

> **Implementation note:** Claude CLI supports `claude "query"` as a positional arg to start an interactive session with an initial prompt. Add `initialPrompt` param to `terminal.create` → `LaunchConfig` → `buildClaudeArgs`, appended as a positional arg. No PTY write timing needed.

**R1.6** The textarea is focused on app launch and when returning to home.

**R1.7** If a workspace is selected in the picker, the page shows that workspace's **full session history** below the textarea/selector area. Clicking a past session resumes it.

**R1.8** If no workspace is selected yet, no session history is shown.

**R1.9** The workspace picker dialog includes a search/filter input at the top. Filters by project name or workspace name as the user types.

### R2: Sidebar

**R2.1** Top of sidebar: **"New Session"** button. Navigates to the New Session page (R1) with no workspace pre-selected.

**R2.2** Below: **"Projects"** button. Navigates to the Projects page (R3).

**R2.3** Below: list of **running sessions only** (active Claude sessions). Each row shows:

- Session title (truncated with ellipsis). If no AI-generated title yet, show the first line of the initial prompt (truncated), or "New session" as fallback.
- Workspace label as `project / workspace` (never truncated — always fully visible)

**R2.4** Clicking a running session switches the main content area to that session's Claude View.

**R2.5** The currently active session is highlighted in the list.

**R2.6** Each running session row has a close/kill button (X icon) to terminate the session. Removes it from the sidebar and destroys the Claude process.

**R2.7** **Alt+1 through Alt+9** switch between running sessions by position (Alt+1 = first, etc.). No-op if no session at that index.

**R2.8** Settings button remains in the sidebar header (gear icon).

### R3: Projects Page

**R3.1** A new route (`/projects` or similar) shows a list of all projects.

**R3.2** Each project row shows:

- Project name
- Number of workspaces
- A gear icon that expands an inline edit panel (repos, CLAUDE.md regeneration, delete project — functionality from current `EditProjectView`)

**R3.3** Clicking a project name navigates to the New Session page (R1) with the project's default workspace (`main`) pre-selected in the picker.

**R3.4** A **"New Project"** button at the top triggers `CreateProjectDialog`.

**R3.5** The inline edit panel per project includes:

- Repo list with add/remove
- CLAUDE.md regeneration
- Create workspace (triggers `CreateWorkspaceDialog`)
- Delete project (with confirmation)

**R3.6** A back button or sidebar navigation returns to the previous view.

### R4: Claude View (Active Session)

**R4.1** When a session is active, the main content area shows the **Claude View**: workspace header bar (project name, workspace name, git sync, open-in-editor, open-in-explorer, env toggle — same as current `WorkspaceView` header) followed by the Claude session (xterm) below it.

**R4.2** The header bar does **not** have a back button. Navigation between sessions and back to the New Session page is handled via the sidebar.

**R4.3** Multiple running sessions can exist simultaneously. Switching between them preserves session state and updates the header bar to reflect the active session's workspace.

### R5: Bottom Panel

**R5.1** The bottom panel shows content scoped to the **active session's workspace**. When the user switches sessions, the bottom panel updates to reflect the new workspace.

**R5.2** When on the New Session page with no active session, the bottom panel shows content for the selected workspace, or is hidden if no workspace is selected yet.

**R5.3** The bottom panel tab bar contains:

- **Scripts** tab — script management (unchanged)
- **Output** tab — script output viewer (unchanged)
- One tab **per open shell terminal** — labeled with the shell's title or workspace name. Each tab shows its terminal directly (no nested sidebar).
- **"+" tab** (rightmost) — a fake tab that creates a new shell terminal in the current workspace when clicked. Adds a new terminal tab and switches to it.

**R5.4** The current `ShellTab` with its vertical terminal sidebar is removed. Each shell is promoted to its own tab in the bottom panel tab bar.

**R5.5** Closing a terminal tab (X on the tab, or middle-click) destroys that shell. If the process is still running, show a confirmation prompt before closing.

### R6: Right Panel (Env Editor)

**R6.1** The right panel shows env variables for the **active session's workspace**. Follows the same scoping as the bottom panel (R5.1, R5.2).

### R7: Workspace Cleanup

**R7.1** When the last running Claude session for a workspace is closed (or killed), automatically stop all scripts and destroy all shell terminals associated with that workspace.

**R7.2** This cleanup applies to both scripts (via `stopAll`) and shell terminals in the bottom panel.

**R7.3** The cleanup is triggered by session close/kill in the sidebar (R2.6), not by manual terminal tab closure in the bottom panel.

## Acceptance Criteria

- [ ] App launches to centered textarea + workspace picker (no empty "Select a project" state)
- [ ] Workspace selection is mandatory — launch disabled until a workspace is chosen
- [ ] Workspace picker dialog shows all workspaces as `project / workspace` with search/filter
- [ ] Cmd/Ctrl+Enter or Start button launches session; plain Enter inserts newline
- [ ] Typed prompt is sent as first message when launching a session
- [ ] When a workspace is selected, session history for that workspace appears below
- [ ] Sidebar shows only running sessions with workspace labels
- [ ] Running session title falls back to first prompt line or "New session" when no AI title exists
- [ ] Running sessions can be closed/killed via X button on the row
- [ ] "New Session" button navigates to home with empty state
- [ ] "Projects" button navigates to projects page
- [ ] Clicking a project navigates to New Session with its main workspace pre-selected
- [ ] Projects page has inline edit (repos, CLAUDE.md, delete) via gear icon
- [ ] Clicking a running session in sidebar switches to its Claude View
- [ ] Alt+1-9 switches between running sessions
- [ ] Currently active session is highlighted in sidebar
- [ ] Multiple simultaneous running sessions are supported
- [ ] Bottom panel tabs: Scripts, Output, individual terminal tabs, "+" to create new terminal
- [ ] No nested terminal sidebar — each shell is its own tab
- [ ] Terminal tab close destroys the shell (with confirmation if running)
- [ ] "+" tab creates a new shell terminal in the current workspace
- [ ] When last session for a workspace closes, all scripts and terminals for that workspace are cleaned up
- [ ] Bottom panel and right panel scope to the active session's workspace
- [ ] Settings remains accessible from sidebar
- [ ] `ProjectTree`, `ProjectNode`, `WorkspaceNode`, `SidebarContextMenu` are removed
- [ ] All existing functionality preserved (git sync, env editing, scripts, CLAUDE.md)
