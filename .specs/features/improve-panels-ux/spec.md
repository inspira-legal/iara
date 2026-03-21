# Feature: Improve Panels UX

## Scope: Large

Migrate the panel layout system from custom imperative resize logic to `react-resizable-panels`, improving resize feel, collapse/expand behavior, layout persistence, and visual feedback.

## Context

The current layout uses manual mouse-event-based resize handlers in `Sidebar.tsx` and `BottomPanel.tsx`, with partial persistence (only sidebar width persists via `iara:sidebar-state:v2` localStorage key; bottom panel resets on reload). The resize UX is functional but lacks polish — no smooth animations, no keyboard accessibility for resize, and inconsistent persistence.

## Requirements

### R1 — Replace custom resize with react-resizable-panels

- **R1.1** Install `react-resizable-panels` as dependency in `apps/web`
- **R1.2** Refactor `AppShell.tsx` to use a horizontal `<PanelGroup>` with two `<Panel>` children (Sidebar, MainPanel)
- **R1.3** Nest a vertical `<PanelGroup>` inside MainPanel for the content/bottom-panel split
- **R1.4** Remove all custom resize logic (mousedown/mousemove/mouseup handlers, refs, overlay divs) from `Sidebar.tsx` and `BottomPanel.tsx`
- **R1.5** Preserve existing width constraints: sidebar 200-480px, bottom panel 120-600px (translate to percentage-based min/max or use pixel constraints if supported)

### R2 — Collapse/Expand

- **R2.1** Sidebar must be collapsible via existing toggle button + keyboard shortcut
- **R2.2** Bottom panel must be collapsible via existing toggle button
- **R2.3** Use `collapsible` and `collapsedSize` props from the library
- **R2.4** Double-click on resize handle toggles collapse (sidebar already has double-click-to-reset; migrate to collapse toggle)
- **R2.5** Collapse/expand should animate smoothly (CSS transition or library-supported)

### R3 — Layout Persistence

- **R3.1** Use `autoSaveId` on both `PanelGroup` components to persist layout to localStorage
- **R3.2** Migrate existing sidebar width persistence to the library's built-in system
- **R3.3** Bottom panel height AND collapsed state must persist across reloads
- **R3.4** Remove manual localStorage logic from sidebar store (width-related only; keep `expandedProjectIds` and `projectOrder`)

### R4 — Visual Feedback

- **R4.1** Style resize handles to match current design (zinc-700/zinc-600 colors, thin line aesthetic)
- **R4.2** Hover state on resize handle (highlight or width change)
- **R4.3** Active/dragging state (blue accent or similar visual indicator, matching current behavior)
- **R4.4** Cursor changes: `col-resize` for sidebar handle, `row-resize` for bottom panel handle

### R5 — Behavioral Parity

- **R5.1** Sidebar content (ProjectTree, header, buttons) must remain unchanged
- **R5.2** Bottom panel tabs (Scripts/Output) and content must remain unchanged
- **R5.3** All existing keyboard shortcuts must continue to work
- **R5.4** MainPanel children (DefaultWorkspace/TaskWorkspace) rendering unaffected
- **R5.5** No visual regression — overall look and feel stays the same

## Non-Goals

- Draggable/floating panels
- Additional panels beyond current three (sidebar, main, bottom)
- Changes to panel content/features
- Tab reordering or tab management changes

## Technical Notes

- Library: `react-resizable-panels` (v4.x, zero deps, ~7-8 kB gzipped)
- The library uses percentage-based sizes internally; pixel constraints need `minSize`/`maxSize` as percentages or use `onResize` callback
- `autoSaveId` uses localStorage by default — compatible with current persistence approach
- Existing stores: `sidebar.ts` (width persistence to remove), `scripts.ts` (add persistence for panelHeight + collapsed)
- The library provides imperative `Panel` refs for programmatic collapse/expand — useful for keyboard shortcuts
