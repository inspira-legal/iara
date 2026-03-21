# Data Persistence Audit & Improvements

## Context

After the state-persistence-refactor (DB → JSON files), we need to audit what data we actually persist, what's missing, and fix gaps in regeneration logic and multi-repo branch handling.

The current `JsonFile<T>` abstraction (`packages/shared/src/json-file.ts`) handles read/validate/write but has no concept of regeneration, defaults, or self-healing. Each caller in `state.ts` manually implements the "read or auto-create" pattern with ad-hoc default values. This logic should be formalized into a small ORM-like layer.

## Current State — What We Persist

### Server-side JSON files

| File                      | Location                      | Data                                                   | Writer               |
| ------------------------- | ----------------------------- | ------------------------------------------------------ | -------------------- |
| `project.json`            | `<projects-dir>/<slug>/`      | name, description, repoSources, createdAt              | `state.ts`           |
| `workspace.json`          | `<projects-dir>/<slug>/<ws>/` | type, name, description, branch (task only), createdAt | `state.ts`           |
| `settings.json`           | `~/.config/iara/`             | Key-value app settings                                 | `state.ts`           |
| `config.json`             | `~/.config/iara/`             | `{ projectsDir }`                                      | `config.ts`          |
| `window-state.json`       | `~/.config/iara/`             | x, y, width, height, maximized, zoomLevel              | `main.ts` (Electron) |
| `plugin.json`             | `<tmp>/iara-plugin-<pid>/`    | Plugin metadata for Claude                             | `plugins.ts`         |
| `~/.claude/settings.json` | Claude config dir             | Hooks integration                                      | `hooks.ts`           |

### Client-side (localStorage)

| Key                      | Data                             | Managed By               |
| ------------------------ | -------------------------------- | ------------------------ |
| `iara:main-layout:v3`    | Sidebar/main panel widths        | `react-resizable-panels` |
| `iara:content-layout:v2` | Content/bottom panel heights     | `react-resizable-panels` |
| `iara:sidebar-state:v2`  | expandedProjectIds, projectOrder | Zustand `sidebar.ts`     |
| `iara-theme`             | dark/light/system                | `useTheme` hook          |

### Claude session data (read-only)

| Source                              | Data Extracted                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `~/.claude/projects/{hash}/*.jsonl` | id, title (ai-title or last-prompt fallback), createdAt, lastMessageAt, messageCount |

### Not persisted (ephemeral)

- Notifications (in-memory Zustand)
- Terminal sessions (in-memory Zustand, lost on navigation — known issue P8)
- Script logs & output (in-memory)
- Bottom panel collapse state (not persisted)
- Selected project/workspace (not persisted)

---

## Audit Findings

### F1. Bottom panel collapse UX

`react-resizable-panels` persists panel sizes to localStorage automatically. Sidebar width, content/bottom split — all saved and restored on reload.

**Gap:** Bottom panel collapse state is not persisted. When collapsed, the panel should show just the tab bar with no tab selected. Clicking a tab opens the panel on that tab. Active tab itself is NOT persisted — it's derived from user interaction (collapsed = no tab, click tab = open on that tab).

### F2. JSON auto-regeneration — silent failures and drift

`state.ts` auto-creates missing `project.json` and `workspace.json` on startup if directory structure is valid. But the "read or create" pattern has gaps:

**Problem 1 — Corrupt JSON silently replaced with empty defaults:**
`JsonFile.read()` returns `null` for both "file missing" and "file corrupt". The caller at `state.ts:64-69` can't tell the difference — it always overwrites with bare defaults (`name: slug, repoSources: []`). If `project.json` had real data (name, description, repo sources) and gets corrupted, that data is silently lost with no log or trace.

**Problem 2 — repoSources never auto-populated:**
When `project.json` is auto-created (`state.ts:67`), it writes `repoSources: []` even if there are repos with remotes in `default/`. The field is only populated during explicit `projects.create` (when user provides sources). If a project is created by manually placing repos in the directory, `repoSources` stays empty forever.

**Problem 3 — No distinction between "file missing" and "file invalid":**
`JsonFile.read()` returns `null` for both. The caller can't tell if it needs to create vs. repair. The `exists()` method exists but is never used in the read-or-create flow.

### F3. Per-repo branch support — creation works, persistence doesn't

- `CreateWorkspaceInput` has `branches?: Record<string, string>` for per-repo branches
- UI (`CreateTaskDialog.tsx`) renders per-repo branch inputs
- Server (`workspaces.ts:226`) uses `branchesMap?.[repo] ?? branch` during worktree creation
- **BUT `workspace.json` only stores a single `branch: string`** — the per-repo mapping is lost after creation
- The actual branch per repo can be detected from git at runtime (via `repos.getInfo` → `gitStatus`), so the data isn't truly "lost" — it's just not in the JSON
- `workspaces.renameBranch` works per-repo (renames branch in specific repo worktree)

### F4. Claude session data — minimal extraction (deferred)

Only 6 fields extracted from JSONL. Available but not extracted: `gitBranch`, `version`, token usage. Low priority — defer.

### F5. No selected workspace/project persistence

`selectedProjectId` and `selectedWorkspaceId` start as `null` (`app.ts:71-72`). No auto-selection of first project. Opening the app always shows empty state. Users must re-navigate every restart.

---

## Requirements

### R1. JsonFile ORM — self-healing JSON abstraction

Evolve `JsonFile<T>` from a simple read/write wrapper into a small ORM-like layer that handles the full lifecycle: read → validate → regenerate → heal.

- **R1.1:** Replace `class JsonFile<T>` with a `createJsonFile(path, schema, regenerate?)` factory function that returns a plain object with methods:
  ```typescript
  const file = createJsonFile(path, ProjectFileSchema, () => ({
    name: slug,
    description: "",
    repoSources: detectRemotes(),
    createdAt: now,
  }));
  file.read(); // T — reads, validates; if missing or invalid → regenerate, write, return
  file.write(data); // validate via schema, atomic write (tmp + rename)
  file.update(partial); // read → merge → validate → atomic write, return T
  file.exists(); // boolean
  file.delete(); // remove file
  file.path; // string
  ```
- **R1.2:** `read()` behavior depends on whether `regenerate` was provided:
  - **With regenerate:** file valid → return; missing or corrupt → regenerate → write → return. Never null.
  - **Without regenerate:** file valid → return; missing or corrupt → throw. For files that must exist.
  - Log warning when regenerating (file path + error reason)
- **R1.3:** `update(partial: Partial<T>): T`:
  - Calls `read()` first — so if file is missing/corrupt and has a regenerate fn, it self-heals before merging
  - Shallow-merge `{ ...existing, ...partial }`
  - Validate merged result against Zod schema
  - Atomic write, return merged data
- **R1.4:** Migrate `state.ts` to use the new API:
  - Replace ad-hoc "read or create" blocks with `read()` (self-heals via regenerate fn)
  - Replace `readOrThrow → spread → write` with `update()`
- **R1.5:** Keep `@iara/shared/json-file` as the export path — no new package
- **R1.6:** Note: regenerate fns that need context (e.g., workspace dir to scan repos, detect branches) capture it via closure when `createJsonFile` is called in `state.ts`

### R2. Fix project.json regeneration

- **R2.1:** When `project.json` is regenerated (missing or invalid), detect existing repos in `default/` and populate `repoSources` with their remote URLs (via `git remote get-url origin`). Skip repos without remotes.
- **R2.2:** Pass the detection logic as the `regenerate` fn to `createJsonFile` — `read()` handles healing automatically

### R3. Per-repo branch persistence in workspace.json

- **R3.1:** Add `branches?: Record<string, string>` to task workspace Zod schema (optional for backward compat)
- **R3.2:** On workspace creation, persist the full branch map to `workspace.json`
- **R3.3:** `branch` field stays as the "primary/fallback" branch; `branches` map has per-repo overrides
- **R3.4:** On auto-regeneration, populate `branches` by detecting each repo's worktree HEAD

### R4. Bottom panel collapse behavior

- **R4.1:** When collapsed, show only the tab bar with NO tab selected (visual: all tabs deselected)
- **R4.2:** Clicking a tab when collapsed → expand panel on that tab
- **R4.3:** Active tab is NOT persisted — it's ephemeral. Collapse = no active tab. Expand via tab click = that tab becomes active.
- **Note:** Collapse state itself is already persisted by `react-resizable-panels` via `useDefaultLayout` (panel size 0 = collapsed). No extra localStorage key needed.

### R5. Persist selected workspace

- **R5.1:** Persist `selectedProjectId` and `selectedWorkspaceId` to localStorage (`iara:selection:v1`)
- **R5.2:** Default is `null` (no selection) — do NOT auto-select first project
- **R5.3:** On app load, restore selection only if the project/workspace still exists in loaded state
- **R5.4:** If persisted selection is invalid (deleted project/workspace), clear silently

### R6. Extract more session metadata (deferred)

- **R6.1:** Extract `gitBranch` from first user entry — associate sessions with branches
- **R6.2:** Extract `version` to show which Claude CLI version was used
- **R6.3:** No content extraction — stay metadata-only for performance

---

## Non-Requirements

- **NR1:** No changes to Claude session writing — iara is read-only for JSONL
- **NR2:** No migration from localStorage to server-side — UI state stays client-side
- **NR3:** No sync of panel sizes across devices — purely local preference
- **NR4:** No changes to env file format or scripts.yaml
- **NR5:** No caching server data in localStorage — WebSocket push keeps things live, caching adds staleness risk for no gain

## Risks

- **RISK1:** Adding `branches` map to workspace schema requires Zod schema update + backward compat for existing files without the field (use `.optional()`)
- **RISK2:** `git remote get-url origin` may fail for repos without remotes (local-only repos) — handle gracefully with try/catch, skip
- **RISK3:** `readOrRegenerate` deleting corrupt files is destructive — but the alternative (silent data loss via overwrite with defaults) is already happening today and is worse. The log warning provides an audit trail.
