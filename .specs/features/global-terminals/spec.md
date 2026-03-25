# Global Terminals

## Summary

Terminals become a global resource — not scoped per workspace. All terminals from all workspaces are visible in the terminal tab sidebar. Switching workspaces no longer destroys terminals. Terminal titles follow Ghostty behavior (OSC 0/2 from the shell showing the foreground process).

## Requirements

### RT01 — No auto-create on workspace switch

The terminal tab must NOT automatically create a terminal when the user switches workspaces. The tab starts empty until the user explicitly creates one.

### RT02 — Explicit creation in current workspace

The "+" button creates a new terminal in the **currently active** workspace. The terminal's initial CWD is the workspace root.

### RT03 — Global terminal list

The terminal sidebar shows ALL terminals across ALL workspaces, always visible. Each entry displays:

- Workspace name (as a prefix/group label)
- Terminal title (from OSC 0/2, see RT04)

### RT04 — Dynamic title via OSC 0/2

Terminal titles update in real-time from xterm.js `onTitleChange` (OSC 0/2 sequences). Modern shells automatically set this to the foreground process name (e.g., `vim`, `npm run dev`, `zsh`). Fallback when no title has been set: workspace name.

### RT05 — Workspace switch preserves terminals

Switching workspaces must NOT destroy any terminals. All PTY processes and XTerm instances remain alive.

### RT06 — Selecting a terminal from another workspace

Clicking a terminal from a different workspace shows that terminal's output. It does NOT switch the active workspace.

### RT07 — No terminal limit

No cap on the number of terminals.

### RT08 — Close with confirmation

Each terminal entry has a close button. If the shell process is still running (not exited), show a confirmation before killing it.

## Out of Scope

- Renaming terminals manually
- Drag-and-drop reordering
- Terminal search/filter
- Split panes
