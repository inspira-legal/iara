# iara-desktop

**Vision:** Workspace manager para builders que usam Claude Code. Rewrite completo da iara CLI em TypeScript/Electron — gerenciamento visual de projetos, tarefas e sessoes, launcher de Claude Code no terminal, browser panel controlavel por agents, e dev server management integrado.

**For:** Builders que usam Claude Code — desenvolvedores, tech leads, e qualquer pessoa que constroi software com Claude Code como ferramenta principal.

**Solves:** Claude Code opera em terminal puro — sem visao consolidada de projetos, tasks, dev servers, ou progresso. O workflow fragmenta-se entre terminal + file manager + browser. iara-desktop centraliza o contexto visual, lanca sessions com um clique, e oferece browser panel para agents interagirem com web apps em dev.

## Goals

- Rewrite completo da iara CLI em TypeScript — zero dependencia do binary Go
- Workspace visual por task com metadata (branch, ports, status)
- Launch Claude Code no terminal com contexto correto
- Browser panel controlavel por agents (agent-browser API)
- Dev server management integrado com browser (frontend auto-abre)
- Crossplatform: macOS, Linux e Windows

## Tech Stack

**Core:**

- Runtime: Electron 40 (Node.js no main process, Chromium no renderer)
- Language: TypeScript 5.7+ (strict mode)
- UI: React 19 + Tailwind CSS 4
- Build: Vite 8 (renderer) + tsdown (main process)
- Package Manager: Bun 1.3+ (tooling only — install, dev, scripts. Runtime e Node.js via Electron)
- Monorepo: Turborepo

**Key dependencies:**

- Effect-TS (error handling, services, DI)
- Drizzle ORM (SQLite, migrations tipadas)
- Zustand (client state)
- TanStack Router (routing)
- Lucide React (icons)

**Tooling:**

- Lint: oxlint
- Format: oxfmt
- Test: vitest
- E2E: Playwright
- Tool versions: mise

## Architecture

**Main process responsabilidades (reimplementado, nao delegado):**

- Project CRUD (filesystem ops, metadata)
- Task CRUD (git worktrees, task state)
- Session management (le JSONL do Claude direto, sem duplicacao)
- Environment management (env files no projeto com symlinks globais, injetado via child_process.spawn)
- Dev server supervisor (discover, launch, health check, logs)
- Git operations (branch, worktree, status, dirty files)
- System prompt builder (TASK.md por task + PROJECT.md por projeto, injetados via --append-system-prompt)
- Plugin-dir generation (slash commands para browser + desktop notifications)
- Hooks registration (merge em ~/.claude/settings.json, guard por env var)
- Unix socket server (comunicacao Claude Code ↔ desktop)
- Browser panel webview control
- Fluxos com claude -p (setup project, new task — processamento invisivel ao user)

**Comunicacao Claude Code → Desktop (via socket):**

- Unix socket (Linux/macOS) / Named pipe (Windows) — padrao unico
- `--plugin-dir` injeta slash commands (/browser, /dev, /notify)
- Plugin commands instruem Claude a rodar CLI bridge via Bash
- CLI bridge conecta ao socket, envia JSON, recebe resposta, sai
- Env var IARA_DESKTOP_SOCKET aponta pro path do socket
- Hooks globais (~/.claude/settings.json) checam IARA_DESKTOP_SOCKET — no-op se ausente

**Comunicacao Desktop → Claude Code (no launch):**

- `--plugin-dir` (slash commands gerados dinamicamente)
- `--append-system-prompt` (TASK.md task + PROJECT.md projeto, editaveis na UI e em editor)
- `--add-dir` (repos do projeto, carrega CLAUDE.md de cada um)
- Env vars (session ID, task ID, project dir, socket path, env vars do projeto)
- CLAUDE.md e .claude/ do projeto nao sao modificados pelo desktop
- Env files sao escritos no projeto (como iara CLI), editaveis em qualquer editor

## Scope

**v1 (MVP) includes:**

- Project explorer com sidebar
- Task workspaces com metadata (branch, dirty files, dev ports, last active)
- Toda interacao requer task (worktree) — nao existe abrir projeto sem task
- Session list por task (resume, nova session)
- Launch Claude Code no terminal externo com contexto
- Fluxos com claude -p (setup project, new task — UI coleta inputs, Claude processa em background)
- System prompt editavel na UI (conteudo injetado via --append-system-prompt)
- Plugin-dir auto-gerado (slash commands: /browser, /dev, /notify)
- Browser panel (webview com agent-browser API, split vertical toggle)
- Dev server panel (launch, stop, status, logs streaming)
- Dev server frontend auto-abre browser panel (health check + heuristica)
- Environment management (env files no projeto + symlinks globais, editavel via UI e IDE)
- Filesystem watcher (env changes → prompt restart com --resume)
- Hooks de notificacao (Claude Code → desktop via socket, merge em settings global)
- Settings panel

**Explicitly out of scope:**

- Chat rendering (nao renderiza conversa Claude — lanca terminal)
- Mode selection UI
- Terminal embutido (v2 — xterm.js)
- Split panes complexos (apenas vertical split para browser)
- Session persistence / restore layout
- Auto-updater
- Plugin/extension system para terceiros
- Editor de codigo integrado

## Constraints

- Rewrite completo — zero dependencia do iara Go binary
- Main process implementa toda logica core em TypeScript
- Electron main process gerencia child processes (Claude Code, dev servers, git)
- Browser panel deve expor API compativel com Vercel agent-browser spec (mesma API do cmux)
- Plugin-dir segue formato Claude Code (.claude-plugin/plugin.json + commands/\*.md)
- Hooks: merge em ~/.claude/settings.json (nao overwrite), guard por IARA_DESKTOP_SOCKET
- Windows: sem SIGUSR1, usar alternativa para process management
- Desktop nao modifica CLAUDE.md nem .claude/ do projeto
- Env files vivem no projeto (editaveis em IDE), com symlinks globais
- Env vars merged e injetadas via child_process.spawn env
