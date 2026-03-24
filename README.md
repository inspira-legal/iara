# iara

A IDE for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Manage projects, workspaces, worktrees, scripts, terminals, and browser — all from one app.

<!-- TODO: Add hero screenshot -->

## Why

Claude Code runs in a terminal. Everything else — files, browser, dev servers, project context — lives somewhere else. You end up juggling windows, tabs, and terminal sessions just to stay oriented.

iara puts it all in one place. Create a project, spin up a workspace (with its own git worktree), launch Claude with full context, and see your dev servers and browser panel side by side.

## Features

- **Project & workspace management** — organize work into projects with git-worktree-backed workspaces, each with its own branch, env vars, and system prompt. Projects and workspaces are discovered from the filesystem — no config files needed.
- **Claude Code launcher** — launch Claude with the right context: repos, env vars, system prompts, plugins, and session history
- **Embedded terminal** — run Claude Code inside the app with xterm.js + node-pty, one terminal per workspace
- **Browser panel** — built-in browser controllable by Claude via agent-browser API (navigate, click, fill, screenshot)
- **Script orchestration** — define services in `scripts.yaml`, auto-assign ports, manage lifecycle with health checks and log streaming
- **Session tracking** — list, resume, and manage Claude Code sessions per workspace (reads Claude's own JSONL files)
- **Environment management** — per-project env files with global symlinks, editable in the UI or any editor
- **Cross-platform** — macOS (DMG), Linux (AppImage), Windows (NSIS)

## Architecture

```
apps/desktop     Electron thin client — window management, spawns server
apps/server      Node.js backend — WebSocket API, terminals, business logic
apps/web         React renderer — UI, xterm.js, TanStack Router, Zustand

packages/
  contracts      Shared Zod schemas and TypeScript types
  orchestrator   YAML-driven script supervisor + port allocator
  shared         Git, env, JSON I/O, and process utilities
```

The desktop app spawns the server as a child process. The web UI communicates exclusively via WebSocket. No Electron IPC for business logic. State is filesystem-derived — projects are directories with git repos, workspaces are git worktrees under `workspaces/`.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.9
- [Node.js](https://nodejs.org/) >= 24
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

### Development

```bash
bun install          # install deps + rebuild native modules
bun dev:desktop      # launch Electron + server + Vite (hot-reload)
```

### Build & Package

```bash
bun build:desktop    # production build
bun package          # build + package (DMG / AppImage / NSIS)
```

### Quality

```bash
bun typecheck        # TypeScript strict across all packages
bun lint             # oxlint
bun fmt              # oxfmt
bun run test         # Vitest
```

## Scripts System

Define services in `<project-dir>/scripts.yaml`. Each top-level key is a service. Ports are auto-assigned per workspace with 20-port spacing. Reference ports across services with `{service.PORT}`.

## Stack

TypeScript, Electron 40, React 19, Vite 8, Tailwind CSS 4, xterm.js 6, node-pty, Zustand, TanStack Router, Zod, Bun + Turborepo, tsdown, oxlint/oxfmt, Vitest, lefthook.

## License

[MIT](LICENSE)
