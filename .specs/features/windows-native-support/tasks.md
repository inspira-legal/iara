# Windows Native Support Tasks

**Design**: `.specs/features/windows-native-support/design.md`
**Status**: Done

---

## Execution Plan

### Phase 1: Platform Utilities (Sequential)

Core shell/env/process utilities that native Windows terminals depend on.

```
T1 → T2
```

### Phase 2: Desktop + Process Management (Parallel OK)

Mode resolution in Electron and Windows process management. Independent files.

```
     ┌→ T3 ─┐
T2 ──┤      ├──→ T5
     └→ T4 ─┘
```

### Phase 3: Release Pipeline (Sequential)

Build, bundle, and installer changes. T6 shares `electron-builder.ts` with T5's changes.

```
T5 → T6
```

---

## Task Breakdown

### T1: Add Windows shell command construction to platform.ts

**What**: Add `isPowerShell()` helper and Windows branches to `shellQuote()`, `buildInteractiveShell()`, and `buildShellCommand()` in platform.ts
**Where**: `packages/shared/src/platform.ts`, `packages/shared/src/platform.test.ts`
**Depends on**: None
**Reuses**: Existing `isWindows` constant (line 8), existing `defaultShell` import (line 4)
**Requirement**: WIN-03

**Done when**:

- [ ] `isPowerShell(shell)` returns true for paths containing `powershell` or `pwsh` (case-insensitive)
- [ ] `shellQuote("")` returns `""` on Windows, `''` on Unix
- [ ] `shellQuote("hello world")` uses double-quote wrapping on Windows, single-quote on Unix
- [ ] `shellQuote()` escapes inner double quotes on Windows
- [ ] `buildInteractiveShell()` returns `{ command: defaultShell, args: [] }` on Windows (no `--login`)
- [ ] `buildShellCommand("ls")` returns PowerShell args `["-NoProfile", "-Command", "ls"]` when shell is PowerShell
- [ ] `buildShellCommand("dir")` returns cmd args `["/C", "dir"]` when shell is cmd.exe
- [ ] Existing Unix tests still pass unchanged
- [ ] Gate check passes: `bun run test --filter packages/shared`

**Tests**: unit
**Gate**: quick

---

### T2: Add Windows terminal env, spawn, and process CWD to platform.ts

**What**: Add Windows branches to `buildTerminalEnv()`, `spawnWithLoginShell()`, and `getProcessCwd()` in platform.ts
**Where**: `packages/shared/src/platform.ts`, `packages/shared/src/platform.test.ts`
**Depends on**: T1
**Reuses**: Existing function signatures, existing `isWindows` constant
**Requirement**: WIN-03, WIN-05

**Done when**:

- [ ] `buildTerminalEnv()` on Windows returns full `process.env` passthrough plus `TERM` and `COLORTERM` overrides
- [ ] `buildTerminalEnv({ MY_VAR: "x" })` on Windows includes `MY_VAR` in result
- [ ] `spawnWithLoginShell()` uses `detached: false` on Windows (avoids console window popup)
- [ ] `spawnWithLoginShell()` still uses `detached: true` on Unix
- [ ] `getProcessCwd()` on Windows returns `null` (best-effort, no reliable API)
- [ ] Existing Unix tests still pass unchanged
- [ ] Gate check passes: `bun run test --filter packages/shared`

**Tests**: unit
**Gate**: quick

---

### T3: Add mode resolution and single-instance lock to main.ts [P]

**What**: Add `resolveWindowsMode()`, mode-specific `userData` path for single-instance lock, mode-specific state dir, replace WSL-only error with mode-aware check, and update window title
**Where**: `apps/desktop/src/main.ts`
**Depends on**: T2
**Reuses**: Existing `isWindows` import (line 27), existing `getStateDir()` (line 27), existing `isWslAvailable()` (line 19), existing `useWsl` pattern (line 40)
**Requirement**: WIN-02, WIN-04

**Done when**:

- [ ] `type WindowsMode = "native" | "wsl" | null` is defined
- [ ] `resolveWindowsMode()` returns `"wsl"` when `--windows-mode=wsl` is in argv, `"native"` when on Windows without the flag, `null` on non-Windows
- [ ] `useWsl` is set from `windowsMode === "wsl"` instead of `isWindows && isWslAvailable()`
- [ ] `app.setPath("userData", ...)` is called with mode-specific path before `app.whenReady()`
- [ ] `app.requestSingleInstanceLock()` is called after setting userData, before `app.whenReady()`
- [ ] Second instance of same mode quits; different modes can run concurrently
- [ ] `stateDir` uses `getStateDir("iara-wsl")` for WSL mode, `getStateDir("iara")` for native/unix
- [ ] WSL-not-installed error only shows when `windowsMode === "wsl"` (not for native mode)
- [ ] Window title shows "iara (WSL)" in WSL mode, "iara (Dev)" in dev, "iara" otherwise
- [ ] Gate check passes: `bun typecheck`

**Tests**: none (Electron lifecycle — not unit-testable)
**Gate**: build

---

### T4: Add Windows killByPort to supervisor.ts [P]

**What**: Add Windows branch to `killByPort()` using `netstat -ano | findstr` and import `isWindows`
**Where**: `packages/orchestrator/src/supervisor.ts`
**Depends on**: T2
**Reuses**: Existing `killByPort()` function, existing `execAsync` util in supervisor.ts
**Requirement**: WIN-05

**Done when**:

- [ ] `isWindows` imported from `@iara/shared/platform`
- [ ] On Windows, `killByPort()` runs `netstat -ano | findstr :PORT | findstr LISTENING` to find PIDs
- [ ] Extracted PIDs are killed via `process.kill(pid, "SIGTERM")`
- [ ] Duplicate PIDs are deduplicated (via Set)
- [ ] Errors are silently caught (same as Unix path)
- [ ] Unix path unchanged
- [ ] Gate check passes: `bun typecheck`

**Tests**: none (requires OS-level mocking of netstat — not worth the complexity)
**Gate**: build

---

### T5: Update release pipeline for dual server bundling

**What**: Remove Windows special-casing in release/index.ts so Windows builds the native server the same as non-Windows, while keeping WSL server validation. Update `getExtraResources()` in electron-builder.ts so Windows bundles both `server/` and `wsl-server/`.
**Where**: `scripts/release/index.ts`, `scripts/release/electron-builder.ts`
**Depends on**: T3, T4
**Reuses**: Existing non-Windows build path in index.ts, existing `getExtraResources()` pattern
**Requirement**: WIN-01

**Done when**:

- [ ] `index.ts` Step 1 (Build): Windows builds all packages same as non-Windows (no separate `isWin` branch for build step)
- [ ] `index.ts` Step 1 (--skip-build): Windows validates `apps/server/dist` exists (same as non-Windows)
- [ ] `index.ts` Step 2 (Stage): Windows stages `server/dist` AND validates `wsl-server/` — both present
- [ ] `index.ts` Step 3 (Deps): Windows installs server native deps (removes `if (!isWin)` guard)
- [ ] `electron-builder.ts` `getExtraResources("win")` returns both `server/{dist,node_modules}` and `wsl-server/{node,dist,node_modules}` plus `web`
- [ ] Non-Windows behavior unchanged
- [ ] Gate check passes: `bun typecheck`

**Tests**: none (release scripts — integration test via actual build)
**Gate**: build

---

### T6: Add NSIS dual shortcuts via installer.nsh

**What**: Create `installer.nsh` with `customInstall`/`customUnInstall` macros for the "Iara (WSL)" shortcut, and add `nsis.include` to `winConfig()` in electron-builder.ts
**Where**: `apps/desktop/resources/installer.nsh` (new), `scripts/release/electron-builder.ts`
**Depends on**: T5
**Reuses**: electron-builder's `nsis.include` convention, existing `winConfig()` function
**Requirement**: WIN-02

**Done when**:

- [ ] `installer.nsh` exists at `apps/desktop/resources/installer.nsh`
- [ ] `customInstall` macro creates `$SMPROGRAMS\iara\iara (WSL).lnk` pointing to `$INSTDIR\iara.exe --windows-mode=wsl`
- [ ] `customUnInstall` macro deletes the WSL shortcut
- [ ] `winConfig()` includes `formatConfigs.nsis.include` pointing to `resources/installer.nsh`
- [ ] Gate check passes: `bun typecheck`

**Tests**: none (NSIS script — verified via installer build)
**Gate**: build

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 ──→ T2

Phase 2 (Parallel):
  T2 complete, then:
    ├── T3 [P]  } Can run simultaneously
    └── T4 [P]  } (different packages, no shared files)

Phase 3 (Sequential):
  T3, T4 complete, then:
    T5 ──→ T6
```

---

## Validation Tables

### Task Granularity Check

| Task                                       | Scope                                 | Status                                                |
| ------------------------------------------ | ------------------------------------- | ----------------------------------------------------- |
| T1: Windows shell command construction     | 3 functions + 1 helper in same file   | OK (cohesive — all shell wrapping)                    |
| T2: Windows terminal env/spawn/process     | 3 functions in same file              | OK (cohesive — all process/env)                       |
| T3: Mode resolution + single-instance lock | 1 file, 1 concept (mode resolution)   | OK (single flow — mode determines lock, state, title) |
| T4: Windows killByPort                     | 1 function in 1 file                  | Granular                                              |
| T5: Dual server bundling in release        | 2 files, 1 concept (release pipeline) | OK (both files serve same build step)                 |
| T6: NSIS dual shortcuts                    | 1 new file + 1 config change          | Granular                                              |

### Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows      | Status |
| ---- | ---------------------- | ------------------ | ------ |
| T1   | None                   | No incoming arrows | Match  |
| T2   | T1                     | T1 → T2            | Match  |
| T3   | T2                     | T2 → T3            | Match  |
| T4   | T2                     | T2 → T4            | Match  |
| T5   | T3, T4                 | T3, T4 → T5        | Match  |
| T6   | T5                     | T5 → T6            | Match  |

### Test Co-location Validation

| Task | Code Layer Created/Modified           | Tests Required                                 | Task Says | Status |
| ---- | ------------------------------------- | ---------------------------------------------- | --------- | ------ |
| T1   | packages/shared (platform.ts)         | unit (existing test file)                      | unit      | OK     |
| T2   | packages/shared (platform.ts)         | unit (existing test file)                      | unit      | OK     |
| T3   | apps/desktop (Electron lifecycle)     | none (no test infra for Electron main process) | none      | OK     |
| T4   | packages/orchestrator (supervisor.ts) | none (OS-level netstat mocking impractical)    | none      | OK     |
| T5   | scripts/release (build scripts)       | none (no test infra for release scripts)       | none      | OK     |
| T6   | resources + scripts/release           | none (NSIS script, no test infra)              | none      | OK     |
