# Workspace Redesign — Tasks

## T1: Install markdown renderer

- Add `react-markdown` + `remark-gfm` to `apps/web`
- Verify it works with the existing build (Vite)

## T2: Create `ClaudeMdView` component

- New component that fetches CLAUDE.md content and renders it as rich markdown
- Replace the old `PromptPreview` usage in workspace view
- Style markdown output to match the dark theme (zinc palette)
- Empty state: subtle message with link to Edit Project

## T3: Simplify `WorkspaceView` / `DetailView`

- Remove: repos section, env editor, regeneration banner
- Keep: topbar (with modifications), terminal view, session list
- Main content: `ClaudeMdView` + `SessionList`

## T4: Create `RightPanel` component

- Resizable right panel (like left sidebar pattern)
- Hosts `EnvEditor`
- Close button in panel header
- Default ~360px, min 280px, max 500px
- Draggable left edge

## T5: Create `rightPanelStore` or extend existing store

- Track `rightPanelOpen` state
- Track `rightPanelWidth` (persisted to localStorage)
- Panel hidden when `editingProjectId` is set or on non-workspace screens

## T6: Wire right panel into `AppShell` layout

- Add right panel to the layout: `[Sidebar | Main | RightPanel]`
- Topbar Env button toggles the panel
- Hide panel when editing project or on settings page

## T7: Create `EditProjectView` component

- Full main-panel view with: repos list, add repo, regenerate CLAUDE.md, delete project
- Reuse existing `RepoCard`, `AddRepoDialog`, `RegenerationBanner`, `ConfirmDialog`
- Back button to return to workspace view

## T8: Add `editingProjectId` state to app store

- When set, main panel renders `EditProjectView` instead of `WorkspaceView`
- Clearing it returns to workspace view
- Setting a new workspace selection also clears it

## T9: Update `ProjectNode` — action buttons + context menu

- Add `[+]` and `[✏]` buttons on project row (visible on hover)
- `[+]` opens CreateWorkspaceDialog (moved from bottom of workspace list)
- `[✏]` sets `editingProjectId` → opens Edit Project in main panel
- Add "Edit Project" to context menu
- Remove "New workspace" button from bottom of expanded list

## T10: Verify & polish

- `bun typecheck`, `bun lint`, `bun fmt`
- Test all flows: workspace view, env panel, edit project, delete project
- Ensure terminal view still works (back button, session resume)
