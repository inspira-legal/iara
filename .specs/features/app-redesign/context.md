# App Redesign — Context & Decisions

## Decisions

### D1: Sidebar shows running sessions only

Not all sessions — just active terminals. Full session history is shown on the New Session page when a workspace is selected.

### D2: Projects page is both picker and manager

Clicking a project name navigates to New Session with workspace pre-selected. Gear icon on each row opens inline edit panel (repos, CLAUDE.md, delete). No separate management route needed.

### D3: Workspace selector is a picker dialog

A button shows the selected workspace. Clicking it opens a dialog listing all workspaces as `project / workspace`. Pre-filled when navigating from Projects page. Defaults to home directory when nothing is selected.

### D4: Prompt is sent as first message

The textarea content becomes the first user message in the Claude session. Not just a title — it's the actual instruction.

### D5: Alt+1-9 repurposed for running sessions

Switches between running sessions by sidebar position. Replaces the old project-tree navigation shortcuts.

### D6: New Session page shows workspace session history

When a workspace is selected in the dropdown, all past sessions for that workspace appear below. Clicking one resumes it. No workspace selected = no history shown.

### D7: Bottom panel terminal tabs replace nested sidebar

The current "Terminal" tab with a vertical sidebar listing shells is removed. Each open shell becomes its own tab in the bottom panel tab bar (alongside Scripts and Output). A "+" fake tab at the end creates a new terminal. This reduces nesting and matches how VS Code / other IDEs handle terminals.

### D8: Workspace cleanup on last session close

When the last Claude session for a workspace is killed/closed from the sidebar, all scripts and shell terminals for that workspace are automatically stopped and destroyed. Prevents orphaned processes.
