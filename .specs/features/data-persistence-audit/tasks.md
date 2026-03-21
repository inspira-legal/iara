# Tasks — Data Persistence Audit & Improvements

## T1. `createJsonFile` factory (R1)

**Files:** `packages/shared/src/json-file.ts`, `packages/shared/src/json-file.test.ts`

- [ ] T1.1: Replace `class JsonFile<T>` with `createJsonFile<T>(path, schema, regenerate?)` factory
- [ ] T1.2: Implement `read()` — parse + validate; with regenerate fn: self-heal on missing/corrupt; without: throw
- [ ] T1.3: Implement `write(data)` — validate via schema, atomic write (tmp + rename)
- [ ] T1.4: Implement `update(partial)` — calls `read()` first (self-heals if needed), shallow-merge, validate, atomic write
- [ ] T1.5: Implement `exists()`, `delete()`, `path` getter
- [ ] T1.6: Log warning on regeneration (file path + error reason)
- [ ] T1.7: Tests: read valid, read missing (with/without regenerate), read corrupt JSON, read Zod-invalid, update merge, update on missing with regenerate, write validates

**Verify:** `bun run test -- packages/shared`

---

## T2. Migrate `state.ts` to new API (R1.4)

**Files:** `apps/server/src/services/state.ts`

- [ ] T2.1: Replace `readProject` ad-hoc "read or create" with `createJsonFile(path, ProjectFileSchema, regenerateFn).read()`
- [ ] T2.2: Replace `scanWorkspaces` ad-hoc "read or create" with `createJsonFile(path, WorkspaceFileSchema, regenerateFn).read()`
- [ ] T2.3: Replace `updateProject` (readOrThrow → spread → write) with `file.update(partial)`
- [ ] T2.4: Replace `writeWorkspace` / `writeProject` with `file.write(data)`
- [ ] T2.5: Regenerate fns capture context via closure (wsDir for branch detection, defaultDir for repo scanning)
- [ ] T2.6: Remove old `JsonFile` class import, update all imports to `createJsonFile`

**Depends on:** T1
**Verify:** `bun run test -- apps/server` + `bun typecheck`

---

## T3. Fix project.json regeneration — populate repoSources (R2)

**Files:** `apps/server/src/services/state.ts`, `packages/shared/src/git.ts`

- [ ] T3.1: Add `gitRemoteUrl(repoDir): string | null` helper to `packages/shared/src/git.ts` — runs `git remote get-url origin`, returns null on failure
- [ ] T3.2: In the project regenerate fn, iterate repos in `default/`, call `gitRemoteUrl()` for each, populate `repoSources` with non-null results

**Depends on:** T2
**Verify:** Delete a `project.json`, restart server, check regenerated file has `repoSources` populated

---

## T4. Per-repo branch persistence in workspace.json (R3)

**Files:** `packages/contracts/src/schemas.ts`, `apps/server/src/services/state.ts`, `apps/server/src/handlers/workspaces.ts`

- [ ] T4.1: Add `branches?: z.record(z.string(), z.string())` to task workspace in `WorkspaceFileSchema` (`.optional()` for backward compat)
- [ ] T4.2: In `workspaces.create` handler, persist `branches` map to `workspace.json` alongside `branch`
- [ ] T4.3: In workspace regenerate fn, detect each repo's worktree HEAD and populate `branches` map
- [ ] T4.4: Update `Workspace` type in `packages/contracts/src/models.ts` to include `branches?: Record<string, string>`

**Depends on:** T2
**Verify:** Create a multi-repo task workspace, check `workspace.json` has `branches` map. Delete file, check regenerated has correct branches.

---

## T5. Bottom panel tab deselection UX (R4)

**Files:** `apps/web/src/components/BottomPanel.tsx`, `apps/web/src/stores/scripts.ts`

- [ ] T5.1: When `collapsed` is true, set `activeTab` to `null` (no tab selected)
- [ ] T5.2: Update tab bar rendering — all tabs visually deselected when collapsed
- [ ] T5.3: Clicking a tab when collapsed → expand panel + set that tab as active
- [ ] T5.4: Update `activeTab` type from `"scripts" | "output"` to `"scripts" | "output" | null`

**Depends on:** none
**Verify:** Collapse panel → tabs deselected. Click "Scripts" → panel opens on Scripts tab. Reload → still collapsed, tabs deselected.

---

## T6. Persist selected workspace (R5)

**Files:** `apps/web/src/stores/app.ts`

- [ ] T6.1: Add localStorage read/write for `iara:selection:v1` key (`{ projectId, workspaceId }`)
- [ ] T6.2: On `selectProject` / `selectWorkspace`, save to localStorage
- [ ] T6.3: After `init()` completes, restore selection from localStorage — validate that project/workspace exists in loaded state
- [ ] T6.4: If persisted selection is stale (deleted project/workspace), clear from localStorage silently
- [ ] T6.5: Default remains `null` — no auto-select

**Depends on:** none
**Verify:** Select a workspace, reload → same workspace selected. Delete that workspace, reload → no selection.

---

## T7. Migrate remaining JsonFile consumers (R1)

**Files:** `apps/server/src/services/config.ts`, `apps/server/src/services/hooks.ts`, `apps/desktop/src/main.ts`

- [ ] T7.1: Migrate `config.ts` to `createJsonFile(path, schema)` — no regenerate fn (throw on missing/corrupt)
- [ ] T7.2: Migrate `hooks.ts` Claude settings to `createJsonFile` — no regenerate (throw on corrupt, Claude owns this file)
- [ ] T7.3: Migrate `window-state.json` in `main.ts` to `createJsonFile` with regenerate fn (default window dimensions)
- [ ] T7.4: Remove old `class JsonFile` if no consumers remain

**Depends on:** T1, T2
**Verify:** `bun typecheck` + `bun run test`

---

## Execution Order

```
T1 (createJsonFile)
├── T2 (migrate state.ts)  ─── T3 (repoSources)
│                           └── T4 (per-repo branches)
├── T7 (migrate other consumers)
│
T5 (bottom panel UX)       ← independent
T6 (persist selection)     ← independent
```

T1 first. Then T2. Then T3/T4/T7 can parallel. T5 and T6 are independent — can start anytime.
