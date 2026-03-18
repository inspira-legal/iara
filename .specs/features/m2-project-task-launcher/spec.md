# M2 — Project, Task & Claude Launcher

**Status**: Active
**Milestone**: M2

---

## Requirements

### Project Management

- **PROJ-01**: Criar projeto (nome, slug, repo sources) via UI
- **PROJ-02**: Listar projetos na sidebar com metadata
- **PROJ-03**: Deletar projeto (com confirmação)
- **PROJ-04**: Setup project via claude -p (mapeia codebase, sugere metadata → UI confirma)

### Task Management

- **TASK-01**: Criar task (nome, slug, branch) — cria git worktree automaticamente
- **TASK-02**: Listar tasks por projeto na sidebar (branch, status, last active)
- **TASK-03**: Completar/arquivar task — remove worktree
- **TASK-04**: New task via claude -p (analisa contexto, sugere nome/branch → UI confirma)
- **TASK-05**: Toda interação requer task — não existe abrir projeto sem task ativa

### Claude Launcher

- **LAUNCH-01**: Lançar Claude Code no terminal externo (platform-specific: macOS Terminal/iTerm, Linux gnome-terminal/kitty, Windows wt)
- **LAUNCH-02**: --append-system-prompt com TASK.md + PROJECT.md
- **LAUNCH-03**: --add-dir para cada repo do projeto (worktree paths)
- **LAUNCH-04**: Env vars injetadas (session ID, task ID, project dir, socket path)
- **LAUNCH-05**: Resume session (--resume) ou nova (--session-id)

### Session Management

- **SESS-01**: Listar sessions por task lendo JSONL do Claude (~/.claude/projects/)
- **SESS-02**: Extrair metadata: timestamps, message count
- **SESS-03**: Resume session existente ou iniciar nova

### System Prompt Editor

- **PROMPT-01**: PROJECT.md na raiz do projeto (editável na UI)
- **PROMPT-02**: TASK.md no task root (editável na UI)
- **PROMPT-03**: Preview do prompt completo antes de lançar

### Socket Server & CLI Bridge

- **SOCK-01**: Unix socket (Linux/macOS) / Named pipe (Windows)
- **SOCK-02**: Desktop inicia socket ao abrir, IARA_DESKTOP_SOCKET em env
- **SOCK-03**: CLI bridge: conecta ao socket, envia JSON, recebe resposta, sai

### Plugin-Dir Generation

- **PLUG-01**: Gerar .claude-plugin/ em dir temporário com plugin.json + commands/\*.md
- **PLUG-02**: Slash commands: /browser, /notify, /dev
- **PLUG-03**: --plugin-dir passado ao lançar Claude

### Environment Management

- **ENV-01**: Env files no projeto com symlinks globais
- **ENV-02**: Editor visual na UI
- **ENV-03**: Filesystem watcher detecta mudanças → prompt restart

### Hooks Integration

- **HOOK-01**: Merge hooks em ~/.claude/settings.json (não overwrite)
- **HOOK-02**: Guard por IARA_DESKTOP_SOCKET env var
- **HOOK-03**: PostToolUse → notifica desktop via CLI bridge
