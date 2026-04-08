# Windows Native Support Specification

## Problem Statement

Iara on Windows currently **requires WSL** — the server always runs inside WSL with a pre-built Linux Node binary. This forces all Windows users to install and configure WSL even if they develop natively on Windows. Users who develop in both environments (native Windows and WSL) have no way to use Iara for their native Windows workflows. The goal is to ship two independent launchers — "Iara" for native Windows and "Iara (WSL)" for WSL — so each mode works fully without interfering with the other.

## Goals

- [ ] Windows users can install and run Iara without WSL installed
- [ ] Users with WSL can still use the WSL-backed mode alongside native mode
- [ ] Both launchers install from the same NSIS installer but operate independently (separate state, separate server processes)
- [ ] Native Windows terminals use the user's default shell (PowerShell, cmd.exe)

## Out of Scope

| Feature                        | Reason                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| macOS/Linux changes            | Already works natively on those platforms                     |
| Switching modes at runtime     | Each launcher is a separate app instance; no in-app toggle    |
| Git Bash / MSYS2 shell support | Can be added later as P3; PowerShell and cmd are the priority |
| WSL distro selection           | Current behavior (default distro) is sufficient               |

---

## User Stories

### P1: Native Windows Server Build ⭐ MVP

**User Story**: As a Windows developer, I want Iara to bundle a native Windows server so that I can use Iara without WSL installed.

**Why P1**: Without this, native Windows mode is impossible — the server is the core runtime.

**Acceptance Criteria**:

1. WHEN the release pipeline runs for Windows THEN it SHALL build the server the same way as Linux/macOS (compile server, install production deps with native modules) and stage it as `server/` in extraResources alongside the existing `wsl-server/`
2. WHEN the native Windows server starts THEN it SHALL use Electron's bundled Node.js (same as Linux/macOS — no separate binary download needed)
3. WHEN the server runs natively on Windows THEN all platform utilities (state dir, process management, path handling) SHALL work without WSL path conversion

**Independent Test**: Build the Windows release, extract the NSIS installer, verify both `server/` and `wsl-server/` directories exist. `server/` should contain `dist/` and `node_modules/` with Windows-native bindings.

---

### P1: Dual Launcher Shortcuts ⭐ MVP

**User Story**: As a Windows user, I want two Start Menu shortcuts — "Iara" and "Iara (WSL)" — so that I can launch the right mode for my workflow.

**Why P1**: This is the user-facing entry point; without it, users can't choose their mode.

**Acceptance Criteria**:

1. WHEN the NSIS installer completes THEN it SHALL create two Start Menu shortcuts: "Iara" (no flag, native default) and "Iara (WSL)" (launches with `--windows-mode=wsl`)
2. WHEN Electron starts without `--windows-mode` on Windows THEN it SHALL default to native mode and spawn the server from `server/`
3. WHEN Electron starts with `--windows-mode=wsl` THEN it SHALL spawn the WSL server from `wsl-server/` (current behavior)
4. WHEN Electron starts on macOS or Linux THEN it SHALL ignore `--windows-mode` and always run natively (no dual shortcuts on non-Windows)
5. WHEN both launchers are running simultaneously THEN they SHALL use different ports, different state directories, and not interfere with each other
6. WHEN Electron acquires a single-instance lock THEN it SHALL use a mode-specific lock key (e.g., `iara-native` vs `iara-wsl`) so both modes can run concurrently without blocking each other

**Independent Test**: Install on Windows, launch both shortcuts, verify two separate Electron windows with independent server processes on different ports.

---

### P1: Native Windows Terminal Support ⭐ MVP

**User Story**: As a Windows developer, I want terminals in Iara to use PowerShell or cmd.exe so that I run native Windows commands.

**Why P1**: Terminals are the core interaction surface — they must work natively.

**Acceptance Criteria**:

1. WHEN native mode spawns a terminal THEN it SHALL use the shell returned by `default-shell` (already used — returns PowerShell or cmd.exe on Windows)
2. WHEN a terminal is spawned with PowerShell THEN node-pty SHALL create a working interactive PowerShell session with proper escape sequences and prompt rendering
3. WHEN a terminal is spawned with cmd.exe THEN node-pty SHALL create a working interactive cmd session
4. WHEN `buildInteractiveShell()` is called on Windows THEN it SHALL use `default-shell` for the command and Windows-appropriate args (no `--login` flag — that's Unix-only)
5. WHEN `buildShellCommand()` wraps a command on Windows THEN it SHALL use the correct syntax for the detected shell (PowerShell: `-Command "..."`, cmd: `/C "..."`)
6. WHEN `buildTerminalEnv()` is called on Windows THEN it SHALL inherit the full Windows environment (process.env passthrough) including USERPROFILE, APPDATA, LOCALAPPDATA, PATH, and PATHEXT

**Independent Test**: Launch native mode, open a terminal, run `Get-Process` in PowerShell — verify output renders correctly. Run `$env:PATH` — verify it matches a normal PowerShell window.

---

### P1: Isolated State Per Mode ⭐ MVP

**User Story**: As a user running both modes, I want each mode to have its own state directory so that WSL and native Windows don't corrupt each other's data.

**Why P1**: Without isolation, running both modes simultaneously would cause SQLite conflicts and data corruption.

**Acceptance Criteria**:

1. WHEN native mode runs THEN its state directory SHALL be `%LOCALAPPDATA%/iara/`
2. WHEN WSL mode runs THEN its state directory SHALL be `~/.config/iara/` (inside WSL filesystem)
3. WHEN both modes run simultaneously THEN they SHALL use different SQLite databases, different ports, and different auth tokens
4. WHEN the desktop layer assigns ports THEN it SHALL ensure no port collision between concurrent native and WSL instances

**Independent Test**: Launch both modes, create a project in each, verify projects are independent and don't appear in the other mode.

---

### P1: Native Windows Process Management ⭐ MVP

**User Story**: As a Windows developer, I want process spawning and cleanup to work correctly on native Windows so that scripts and services managed by Iara don't leak.

**Why P1**: The orchestrator and terminal service both spawn child processes — they must terminate cleanly on Windows.

**Acceptance Criteria**:

1. WHEN `killProcessTree()` is called on Windows THEN it SHALL terminate the process and all descendants (using `taskkill /F /T /PID` or tree-kill's Windows support)
2. WHEN a terminal is closed in native mode THEN the underlying shell process and its children SHALL be terminated
3. WHEN the server shuts down in native mode THEN all spawned processes SHALL be cleaned up
4. WHEN `getProcessCwd()` is called on Windows THEN it SHALL return the correct working directory (currently unsupported — needs implementation)

**Independent Test**: Open terminal in native mode, run a long-running process, close terminal, verify process is gone in Task Manager.

---

### P2: Claude Mode on Native Windows

**User Story**: As a Windows developer, I want to launch Claude Code sessions from Iara in native mode so that Claude runs as a native Windows process.

**Why P2**: Claude terminal mode requires wrapping the claude command in a shell — the wrapper must use Windows shell syntax. Most of the work is already covered by WIN-03 (`buildShellCommand()`); this story covers Claude-specific behavior.

**Acceptance Criteria**:

1. WHEN Claude mode is launched in native Windows THEN `buildShellCommand()` SHALL wrap the claude command in PowerShell or cmd
2. WHEN the Claude process runs natively THEN IPC, stdin/stdout, and terminal rendering SHALL work correctly through node-pty on Windows
3. WHEN Claude mode exits THEN the process tree SHALL be fully cleaned up

**Independent Test**: Launch Claude mode in native Iara, send a message, verify response renders in xterm.js.

---

### P3: Desktop Shortcuts with Custom Icons

**User Story**: As a Windows user, I want the two shortcuts to have visually distinct icons so I can quickly tell them apart.

**Why P3**: Nice-to-have polish; functionality works without it.

**Acceptance Criteria**:

1. WHEN the installer creates shortcuts THEN "Iara" SHALL use the standard icon and "Iara (WSL)" SHALL use a variant icon (e.g., with a Linux/penguin badge)

---

## Edge Cases

- WHEN WSL is not installed and user launches "Iara (WSL)" THEN system SHALL show an error dialog explaining WSL is required and link to installation instructions
- WHEN a user upgrades from current (WSL-only) version THEN the installer SHALL preserve existing WSL state and add the native shortcut
- WHEN Electron uses `app.requestSingleInstanceLock()` THEN each mode SHALL use a mode-specific lock so launching "Iara" does not block "Iara (WSL)" and vice versa
- WHEN node-pty fails to load native Windows bindings THEN system SHALL show a clear error (not a silent crash)
- WHEN a PowerShell execution policy blocks scripts THEN terminals SHALL still work for interactive commands (no profile script dependency)

---

## Requirement Traceability

| Requirement ID | Story                                                 | Phase  | Status  |
| -------------- | ----------------------------------------------------- | ------ | ------- |
| WIN-01         | P1: Native Windows Server Build                       | Design | Pending |
| WIN-02         | P1: Dual Launcher Shortcuts                           | Design | Pending |
| WIN-03         | P1: Native Windows Terminal Support (incl. shell env) | Design | Pending |
| WIN-04         | P1: Isolated State Per Mode                           | Design | Pending |
| WIN-05         | P1: Native Windows Process Management                 | Design | Pending |
| WIN-06         | P2: Claude Mode on Native Windows                     | -      | Pending |
| WIN-07         | P3: Desktop Shortcuts with Custom Icons               | -      | Pending |

**Coverage:** 7 total, 0 mapped to tasks, 7 unmapped

---

## Success Criteria

- [ ] A Windows user without WSL can install Iara and use it fully (terminals, Claude, orchestrator)
- [ ] A Windows user with WSL can run both "Iara" and "Iara (WSL)" simultaneously without interference
- [ ] Native Windows terminals render correctly in xterm.js with PowerShell and cmd.exe
- [ ] The release pipeline produces a single installer that bundles both server modes
