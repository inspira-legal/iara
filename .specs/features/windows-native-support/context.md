# Windows Native Support Context

**Gathered:** 2026-04-07
**Spec:** `.specs/features/windows-native-support/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Ship two independent Windows launchers — "Iara" (native Windows server) and "Iara (WSL)" (current WSL-backed server) — from a single NSIS installer. Each mode runs fully independently with its own server, state, and terminals.

---

## Implementation Decisions

### Launch Mode Flag

- Flag is `--windows-mode=wsl` on the WSL shortcut; no flag on native (native is default)
- Both shortcuts are Windows-only — macOS/Linux have no dual launcher, they're always native
- No first-run chooser dialog; shortcuts are the selection mechanism

### Port Isolation

- Keep current dynamic port allocation via `get-port` — each Electron instance gets an OS-assigned free port at startup
- No fixed ports, no offsets — already collision-proof

### Installer UX

- Always create both shortcuts ("Iara" and "Iara (WSL)") regardless of whether WSL is installed
- If user launches "Iara (WSL)" without WSL, show an error dialog with a link to WSL installation instructions
- Users who install WSL later don't need to reinstall Iara

### State Isolation

- Native mode: `%LOCALAPPDATA%/iara/` (Windows filesystem)
- WSL mode: `~/.config/iara/` (WSL filesystem, current behavior)
- Separate SQLite databases, auth tokens, and server processes — no shared state

### Terminal Shell

- Native mode uses PowerShell (preferred) or cmd.exe as fallback
- WSL mode continues using bash/zsh (current behavior)
- No Git Bash / MSYS2 support initially (deferred)

### Agent's Discretion

- Exact NSIS script syntax for creating dual shortcuts
- `default-shell` package already handles shell detection cross-platform — no custom detection needed
- Whether to use `powershell.exe` or `pwsh.exe` (PowerShell 5 vs 7) — deferred to `default-shell` (returns whichever the user has configured)

---

## Specific References

- Current `get-port` usage at `apps/desktop/src/utils.ts:77-80`
- Current WSL detection at `apps/desktop/src/utils.ts` via `wsl.exe --status`
- Current server spawn logic at `apps/desktop/src/main.ts:128-175`
- Release pipeline at `scripts/release/index.ts` — Windows currently skips server build (line 36-49); non-Windows builds server normally (line 58-61). Fix: remove the special-casing so Windows also builds + stages `server/` using the same process as Linux/macOS. No separate `build-win-server.ts` needed — Electron's Node.js handles native modules via `bun install --production` on Windows

---

## Deferred Ideas

- Git Bash / MSYS2 shell support (P3, after PowerShell/cmd work)
- WSL distro selection UI
- Runtime mode switching (in-app toggle between native/WSL)
- Distinct icons per shortcut variant (P3 in spec)
