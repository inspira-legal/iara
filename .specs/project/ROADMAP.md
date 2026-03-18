# Roadmap

**Current Milestone:** M2 — Project, Task & Claude Launcher
**Status:** Planning

---

## M1 — Scaffold & Worktrees ✓

**Goal:** Monorepo funcional, Electron rodando com shell basico, git worktree operations funcionais. Nenhuma feature user-facing alem do shell.

### Features

**Monorepo Scaffold** - DONE

- Estrutura Turborepo (desktop, web, contracts, shared)
- Electron main + preload + renderer com Vite
- Build pipeline (dev, build, typecheck, lint, fmt, test)
- Tooling (oxlint, oxfmt, vitest, mise)
- Cross-platform: macOS, Linux, Windows
- DX: dev-runner, hot-restart Electron, smoke test

**App Shell** - DONE

- Layout base: sidebar + main panel (placeholder content)
- Electron window management (size, position)
- IPC bridge tipado (contracts)
- syncShellEnvironment (importar PATH do shell do user)

**Data Layer** - DONE

- SQLite + Drizzle ORM no userData do Electron
- Project model (nome, slug, repos originais, metadata)
- Task model (nome, slug, branch, status, timestamps)
- Environment model (global + override por repo)
- Migrations tipadas via Drizzle

**Git Operations** - DONE

- Branch create/switch/delete via child_process git
- Worktree create/remove
- Status (dirty files, current branch)
- Scan de repos (branches, dirty files)

---

## M2 — Project, Task & Claude Launcher

**Goal:** Gerenciamento completo de projetos e tasks na UI. Lancar Claude Code com contexto. Fluxos com claude -p. Socket para comunicacao.

### Features

**Project Management** - DONE

- Criar/listar/renomear/deletar projetos na sidebar
- Adicionar/remover repos a um projeto
- Setup project via claude -p (mapeia codebase, sugere metadata → UI confirma)

**Task Management** - DONE

- Criar/listar/completar tasks
- Git worktree setup/teardown por task
- New task via claude -p (analisa contexto, sugere nome/branch → UI confirma)
- Sidebar metadata (branch, dirty files, last active)
- Toda interacao requer task — nao existe abrir projeto sem worktree

**Session Management** - DONE

- Listar sessions lendo JSONL do Claude (~/.claude/projects/<path-hash>/)
- Extrair metadata: session ID, timestamps, summary do transcript
- Resume session existente (--resume <id>) ou iniciar nova
- Zero duplicacao — Claude Code e a fonte de verdade

**Claude Launcher** - DONE

- Lancar Claude Code no terminal externo (platform-specific)
- --append-system-prompt com contexto efemero (editavel na UI)
- --add-dir para cada repo do projeto
- --plugin-dir com slash commands gerados
- Env vars injetadas (session ID, task ID, project dir, socket path, projeto envs)
- Resume session (--resume <id>) ou nova (--session-id <uuid>)

**System Prompt Editor** - DONE

- PROJECT.md na raiz do projeto (compartilhado entre tasks)
- TASK.md no task root (especifico por task)
- Task root tem symlink PROJECT.md → ../PROJECT.md
- Editavel na UI e em qualquer editor (sao .md files)
- Ambos injetados via --append-system-prompt ao lancar Claude
- Preview do prompt completo antes de lancar

**Plugin-Dir Generation** - DONE

- Gerar .claude-plugin/plugin.json + commands/\*.md em dir temporario
- Slash commands: /browser (navigate, click, fill, screenshot, get-tree)
- Slash commands: /notify (enviar notificacao ao desktop)
- Slash commands: /dev (launch, stop, status, logs)
- Template com variaveis ($ARGUMENTS, etc)

**Socket Server & CLI Bridge** - DONE

- Unix socket (Linux/macOS) / Named pipe (Windows) — padrao unico
- Desktop inicia socket ao abrir, IARA_DESKTOP_SOCKET em env
- CLI bridge bundled: conecta ao socket, envia JSON, recebe resposta, sai
- Comandos: browser._, notify._, status.\*
- Respostas sincronas (screenshot retorna path da imagem)

**Environment Management** - DONE

- Env files no projeto (como iara CLI) com symlinks globais
- Editor visual na UI + editavel em qualquer IDE/editor
- Layering: .env.<repo>.global (symlink) + .env.<repo>.override → merged .env
- Filesystem watcher detecta mudancas nos env files
- Prompt de restart ao detectar alteracao
- Restart relanca Claude Code com --resume <same-session-id> + novas envs

**Hooks Integration** - DONE

- Merge hooks em ~/.claude/settings.json (nao overwrite)
- Guard: hooks checam IARA_DESKTOP_SOCKET env var, no-op se ausente
- PostToolUse → notifica desktop via CLI bridge
- Session lifecycle events → atualiza sidebar

---

## M3 — Browser Panel & Dev Servers

**Goal:** Browser panel funcional controlavel por agents. Dev servers com integracao browser.

### Features

**Browser Panel** - DONE

- Webview embutido (Electron BrowserView/webContentsView)
- Agent-browser API (navigate, click, fill, screenshot, get_accessibility_tree)
- Controlavel por Claude via plugin commands + socket
- Toggle split vertical (main panel | browser)

**Dev Server Supervisor** - DONE

- Auto-discover dev commands (package.json, Makefile, etc)
- Launch/stop/restart servers via child_process
- Priority-based execution (one-shots primeiro, long-running depois)
- Health check (TCP port ready)
- Log streaming em tempo real
- Status na sidebar (porta, health, PID)
- Env vars do projeto injetadas nos dev servers

**Dev + Browser Integration** - DONE

- Frontend server pronto → auto-abre browser panel
- Heuristica: vite/next/remix/astro = frontend → browseable
- Backend: go/python/uvicorn/rails = API → nao abre browser
- Fallback: config explicita `browseable: true`
- URL auto-populated: localhost:PORT

---

## M4 — Polish & Release

**Goal:** UX polish, crossplatform testing, packaging.

### Features

**Notifications** - DONE

- Notificacoes por task (dev server crash, session events)
- Badge na sidebar
- System notifications nativas (Electron Notification API)

**UX Polish** - DONE

- Keyboard shortcuts
- Error handling visual
- Loading states
- Dark/light theme

**Packaging** - DONE

- DMG para macOS
- AppImage para Linux
- NSIS installer para Windows

---

## Future Considerations

- Terminal embutido (xterm.js) para sessions inline
- Split panes (multiplos paineis)
- Plugin system para extensibilidade de terceiros
- Dashboard com metricas de sessoes
- Git visualization (branch graph)
- Auto-updater
