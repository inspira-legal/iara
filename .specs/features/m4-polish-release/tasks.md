# M4 — Polish & Release Tasks

**Status**: Active

---

## Task Breakdown

### T1: Notification service

**What**: System notifications + in-app badge for events.
**Where**: `apps/desktop/src/services/notifications.ts`, `apps/web/src/stores/notifications.ts`

**Done when**:

- [ ] `NotificationService` — queue, dedup, send via Electron Notification API
- [ ] Events: dev server crash, session end, task complete
- [ ] IPC: `desktop:send-notification`, `desktop:get-notifications`
- [ ] In-app notification store + badge count in sidebar
- [ ] Contracts + preload updated
- [ ] Tests: queue, dedup

**Commit**: `feat: add notification service with system and in-app notifications`

---

### T2: Keyboard shortcuts

**What**: Global and local keyboard shortcuts.
**Where**: `apps/desktop/src/services/shortcuts.ts`, `apps/web/src/hooks/useKeyboardShortcuts.ts`

**Done when**:

- [ ] `Cmd/Ctrl+N` — new task
- [ ] `Cmd/Ctrl+L` — launch Claude
- [ ] `Cmd/Ctrl+B` — toggle browser panel
- [ ] `Cmd/Ctrl+,` — settings (placeholder)
- [ ] `Escape` — close dialogs
- [ ] Electron globalShortcut for app-level, React hook for UI-level
- [ ] Shortcuts registered in main process + communicated via IPC

**Commit**: `feat: add keyboard shortcuts for common actions`

---

### T3: Error handling + loading states

**What**: Visual error boundaries, loading skeletons, toast notifications.
**Where**: `apps/web/src/components/`

**Done when**:

- [ ] `ErrorBoundary.tsx` — catches React errors, shows retry
- [ ] `Toast.tsx` — ephemeral messages (success, error, info)
- [ ] `useToast()` hook
- [ ] Loading skeletons for sidebar (project list, task list)
- [ ] Error states for IPC failures (project load, task create, etc)
- [ ] Toast on successful actions (project created, task completed, Claude launched)

**Commit**: `feat: add error boundaries, toast notifications, and loading states`

---

### T4: Theme support (dark/light/system)

**What**: Dark and light themes with system preference detection.
**Where**: `apps/web/src/hooks/useTheme.ts`, `apps/web/src/index.css`

**Done when**:

- [ ] `useTheme()` hook — dark/light/system with localStorage persistence
- [ ] CSS variables for colors in index.css
- [ ] `prefers-color-scheme` media query for system mode
- [ ] Theme toggle in settings area or sidebar footer
- [ ] All components use theme-aware classes (already dark-first)

**Commit**: `feat: add dark/light/system theme support`

---

### T5: Electron packaging configs

**What**: Platform packaging configuration for DMG, AppImage, NSIS.
**Where**: `apps/desktop/electron-builder.yml`, root scripts

**Done when**:

- [ ] `electron-builder.yml` with macOS (DMG), Linux (AppImage), Windows (NSIS) targets
- [ ] App icons placeholder (icon.png, icon.ico, icon.icns)
- [ ] `bun package` script in root package.json
- [ ] productName, appId, copyright configured
- [ ] File associations and protocols registered
- [ ] Build output in `release/` directory

**Commit**: `feat: add Electron packaging configuration for all platforms`

---

### T6: Final verification + CLAUDE.md update

**What**: Full verification, update docs to reflect complete state.
**Where**: Root

**Done when**:

- [ ] `bun install` from clean state works
- [ ] `bun build:desktop` succeeds
- [ ] `bun typecheck && bun lint && bun fmt:check` all pass
- [ ] `bun run test` all pass
- [ ] CLAUDE.md updated with current milestone
- [ ] ROADMAP.md M4 marked complete

**Commit**: `docs: mark M4 complete — MVP scaffold ready`
