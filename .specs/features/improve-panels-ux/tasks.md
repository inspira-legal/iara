# Tasks: Improve Panels UX

## Dependencies

```
T1 → T2 → T3 → T4 → T5 → T6 → T7
```

All tasks are sequential — each builds on the previous.

---

## T1 — Install react-resizable-panels

**Files:** `apps/web/package.json`

- Add `react-resizable-panels` to `apps/web`
- Run `bun install`
- Verify import works with `bun typecheck`

**Verify:** `bun typecheck` passes, package appears in node_modules

---

## T2 — Refactor AppShell with horizontal PanelGroup

**Files:** `AppShell.tsx`, `Sidebar.tsx`

- Import `PanelGroup`, `Panel`, `PanelResizeHandle` from `react-resizable-panels`
- Replace the `<div className="flex ...">` wrapper with a horizontal `<PanelGroup direction="horizontal" autoSaveId="iara:main-layout">`
- Sidebar becomes a `<Panel>` with `defaultSize={20} minSize={15} maxSize={35} collapsible collapsedSize={0}`
- MainPanel becomes a `<Panel>` with `minSize={40}`
- Add `<PanelResizeHandle>` between them styled to match current look (thin vertical bar, hover:blue)
- Remove from `Sidebar.tsx`:
  - `isResizing` state, `startXRef`, `startWidthRef`
  - `onResizeStart` callback
  - `useEffect` for mousemove/mouseup
  - The resize handle `<div role="separator" ...>`
  - The overlay `<div className="fixed inset-0 z-50 ..."`
  - `style={{ width: sidebarWidth }}` on `<aside>` (panel controls width now)
- Keep all dialog rendering, ProjectTree, header unchanged
- Sidebar `<aside>` keeps `className` but removes `shrink-0` and inline width style

**Verify:** Sidebar resizes by dragging the handle. Layout persists on reload via `autoSaveId`. `bun typecheck` passes.

---

## T3 — Refactor MainPanel with vertical PanelGroup

**Files:** `MainPanel.tsx`, `BottomPanel.tsx`

- Replace MainPanel's `<main>` internals with a vertical `<PanelGroup direction="vertical" autoSaveId="iara:content-layout">`
- Content area becomes `<Panel defaultSize={70} minSize={30}>`
- BottomPanel area becomes `<Panel defaultSize={30} minSize={10} maxSize={60} collapsible collapsedSize={0}>`
- Add `<PanelResizeHandle>` between them styled as thin horizontal bar
- Remove from `BottomPanel.tsx`:
  - `isResizing` state, `startYRef`, `startHeightRef`
  - `onResizeStart` callback
  - `useEffect` for mousemove/mouseup
  - The resize handle `<div role="separator" ...>`
  - The overlay `<div className="fixed inset-0 z-50 ..."`
  - `style={{ height: panelHeight }}` on content div
- BottomPanel content area uses `className="flex-1 overflow-y-auto"` instead of fixed height
- Keep tab bar, ScriptsTab, OutputTab, auto-open-on-error logic unchanged

**Verify:** Bottom panel resizes by dragging. Layout persists on reload. `bun typecheck` passes.

---

## T4 — Wire collapse/expand with imperative Panel API

**Files:** `AppShell.tsx`, `BottomPanel.tsx` (or parent), `Sidebar.tsx`

- Create refs: `const sidebarRef = useRef<ImperativePanelHandle>(null)` in AppShell
- Create refs: `const bottomPanelRef = useRef<ImperativePanelHandle>(null)` in MainPanel
- Pass refs to respective `<Panel ref={...}>` components
- Wire sidebar collapse toggle (if exists) to `sidebarRef.current?.collapse()` / `expand()`
- Wire bottom panel collapse button (`ChevronUp/ChevronDown`) to `bottomPanelRef.current?.collapse()` / `expand()`
- Use `onCollapse` and `onExpand` callbacks on `<Panel>` to sync `collapsed` state in scripts store (for auto-open-on-error logic)
- Double-click on `<PanelResizeHandle>` toggles collapse via `onDoubleClick` handler

**Verify:** Click collapse buttons → panels collapse/expand. Double-click handle → toggles. Auto-open-on-error still works. `bun typecheck` passes.

---

## T5 — Clean up stores

**Files:** `stores/sidebar.ts`, `stores/scripts.ts`

- Remove `sidebarWidth`, `setSidebarWidth` from sidebar store (library handles persistence)
- Remove `sidebarWidth` from `SidebarState`, `SidebarActions`, `loadFromStorage`, `saveToStorage`
- Remove `panelHeight`, `setPanelHeight` from scripts store (library handles persistence)
- Keep `collapsed` in scripts store (needed for auto-open-on-error logic — synced via `onCollapse`/`onExpand`)
- Remove `hydrateFromStorage` call for width from Sidebar component (no longer needed for width; keep if still needed for expandedProjectIds)
- Update any remaining references to removed state

**Verify:** `bun typecheck` passes. `bun lint` passes. No references to removed state.

---

## T6 — Style resize handles

**Files:** `AppShell.tsx`, `MainPanel.tsx` (or a shared `ResizeHandle` component)

- Create a reusable styled handle or inline styles on `<PanelResizeHandle>`
- Idle: `w-1` (vertical) / `h-1` (horizontal), transparent or `bg-zinc-800`
- Hover: `bg-blue-500/50` (matches current behavior)
- Active/dragging: `bg-blue-500/70`
- Use `data-resize-handle-active` attribute (provided by library) for active state styling
- Cursor: `cursor-col-resize` / `cursor-row-resize` (library may handle this)
- Ensure handles don't push content — use absolute positioning or zero-width approach if needed

**Verify:** Visual: hover shows blue highlight, dragging shows stronger blue. No layout shift. Matches current zinc/blue theme.

---

## T7 — Final verification

- `bun fmt` passes
- `bun lint` passes
- `bun typecheck` passes
- `bun build:desktop` passes
- Manual test: sidebar resizes, bottom panel resizes, collapse/expand works, layout persists on reload, keyboard shortcuts still work, scripts tab/output tab render correctly
