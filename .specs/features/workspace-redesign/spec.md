# Workspace Experience Redesign

## Goal

Simplify the workspace view to focus on what matters: understanding the project (CLAUDE.md) and working with sessions. Move configuration concerns (repos, regeneration) to an "Edit Project" view in the main panel (triggered from sidebar). Make environment variables quickly accessible via a collapsible right panel.

## Requirements

### WR-01: Workspace Main View — CLAUDE.md as Hero

When a workspace is selected, the main content area shows:

1. **CLAUDE.md rendered as rich markdown** — always expanded, full rendering (headers, code blocks, lists, tables, inline code). No collapse toggle. Uses a markdown renderer.
2. **Sessions list** below — unchanged behavior, with "New" button and session resume.
3. **Nothing else** — no repos section, no env editor, no regeneration banner in this view.

If CLAUDE.md is empty/missing, show a subtle empty state with a link to "Edit Project" to generate it.

### WR-02: Right Panel — Environment Variables

A **resizable right panel** (like VS Code's secondary sidebar) for environment variables:

- **Toggle**: Env button in topbar opens/closes the panel.
- **Close button**: inside the panel header for closing.
- **Resizable**: draggable left edge, same pattern as the left sidebar.
- **Content**: existing `EnvEditor` component (global + local tabs, auto-save).
- **Available on all workspaces** (main and non-root).
- **Hidden when**: Edit Project view is active, settings page, or any non-workspace screen.
- **Default width**: ~360px. Min ~280px, max ~500px.

Topbar layout:

```
[< Back]  Project / Workspace        [Env] [Git Sync] [Editor] [Explorer]
```

### WR-03: Edit Project — Main Panel View

A project-level editing view that **replaces** the main panel content (not a dialog). Accessible from:

1. **Sidebar project context menu** → "Edit Project" menu item.
2. **Edit button** on the project row (pencil icon, visible on hover).

When active, the main panel shows:

- **Repos section**: full repo list with add/remove, branch management.
- **Regenerate CLAUDE.md** action with progress/banner.
- **Delete Project** action (danger zone, with confirmation).
- A **back/close** mechanism to return to the workspace view.

When Edit Project is active:

- The **right env panel is hidden** (not just collapsed — not rendered).
- The topbar adapts to show "Edit Project" context instead of workspace breadcrumb.

### WR-05: Sidebar Project Row — Action Buttons

The project row in the sidebar gets two action buttons on the right side (visible on hover, same row as the project name):

```
[▶ Project Name]                    [+ New Workspace] [✏ Edit]
```

- **New Workspace** (`Plus` icon): moves here from the bottom of the expanded workspace list. Same behavior — opens CreateWorkspaceDialog.
- **Edit Project** (`Pencil` icon): opens the Edit Project view in the main panel.
- Both buttons appear on hover over the project row.
- The "New workspace" button at the bottom of the expanded workspace list is **removed**.

### WR-04: Non-Root Workspace Behavior

- Same main view: CLAUDE.md + Sessions.
- Env right panel available (with workspace-local env vars).
- No repo/project editing in the right panel — that's only in Edit Project.

## Out of Scope

- Changing session list behavior or design
- Changing sidebar tree structure (beyond adding edit button + menu item)
- Changing bottom panel (scripts/services)
- Project creation flow changes

## Component Plan

| Component                 | Change                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceView`           | Remove repos, env, regeneration. Add markdown renderer for CLAUDE.md. Keep sessions.                                                                           |
| `PromptPreview`           | Replace with new `ClaudeMdView` — renders markdown, not raw `<pre>`.                                                                                           |
| `MainPanel` (in AppShell) | Conditionally render Edit Project view or WorkspaceView. Host right panel.                                                                                     |
| `RightPanel` (new)        | Resizable panel with EnvEditor. Toggled from topbar. Hidden in non-workspace views.                                                                            |
| `EditProjectView` (new)   | Full-page view with repos + regeneration. Replaces main content.                                                                                               |
| `ProjectNode`             | Move "New workspace" button to project row. Add edit pencil button. Add "Edit Project" to context menu. Remove bottom "New workspace" link from expanded list. |
| Topbar (in WorkspaceView) | Add Env panel toggle button.                                                                                                                                   |
| App store or UI store     | Track `editingProjectId` and `rightPanelOpen` state.                                                                                                           |

## Dependencies

- Markdown rendering library (e.g., `react-markdown` + `remark-gfm`)
