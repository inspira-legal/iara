# M2 Tasks

**Spec**: `spec.md`
**Status**: Active

---

## Execution Plan

### Phase 1: Backend Services + IPC Refactor (Sequential)

```
T1 → T2 → T3 → T4
```

Reorganiza IPC, cria service layer para projetos e tasks.

### Phase 2: UI — Sidebar + Project/Task Management (Sequential)

```
T4 → T5 → T6 → T7
```

Zustand stores, sidebar, project/task views.

### Phase 3: Claude Launcher + Sessions (Sequential)

```
T7 → T8 → T9 → T10
```

Terminal launcher, session reader, system prompt editor.

### Phase 4: Socket + Plugins + Hooks (Sequential)

```
T10 → T11 → T12 → T13 → T14
```

Socket server, CLI bridge, plugin-dir, hooks, env management.

---

## Task Breakdown

### T1: IPC refactor — channels + handler modules

**What**: Extrair IPC handlers de main.ts para módulos organizados por domínio.
**Where**: `apps/desktop/src/ipc/`, `apps/desktop/src/main.ts`
**Depends on**: M1
**Requirements**: Foundation for all M2 IPC

**Done when**:

- [ ] `src/ipc/channels.ts` — constantes de canais (`desktop:get-app-info`, etc)
- [ ] `src/ipc/projects.ts` — handlers de projeto (get, create, update, delete)
- [ ] `src/ipc/tasks.ts` — handlers de task (get, create, complete, delete)
- [ ] `src/ipc/git.ts` — handlers git (status, worktree ops)
- [ ] `src/ipc/register.ts` — registerIpcHandlers() que importa todos
- [ ] `main.ts` simplificado — chama registerIpcHandlers()
- [ ] Contracts atualizado com novos tipos IPC
- [ ] Preload bridge expõe todos os handlers
- [ ] `bun typecheck` passa

**Commit**: `refactor: extract IPC handlers into domain modules`

---

### T2: Project service — CRUD completo

**What**: Service layer para projetos com filesystem operations.
**Where**: `apps/desktop/src/services/projects.ts`
**Depends on**: T1
**Requirements**: PROJ-01, PROJ-02, PROJ-03

**Done when**:

- [ ] `createProject(input)` — insert DB + cria diretório projeto + PROJECT.md
- [ ] `listProjects()` — query DB
- [ ] `getProject(id)` — query DB by ID
- [ ] `deleteProject(id)` — remove DB + cleanup diretório
- [ ] `getProjectDir(slug)` — resolve path no projectsDir
- [ ] Projects dir configurável (default: ~/iara/)
- [ ] IPC handlers em `ipc/projects.ts` usam este service
- [ ] Testes: create → list → get → delete

**Commit**: `feat: add project service with CRUD operations`

---

### T3: Task service — CRUD + worktree lifecycle

**What**: Service layer para tasks com git worktree integration.
**Where**: `apps/desktop/src/services/tasks.ts`
**Depends on**: T2
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-05

**Done when**:

- [ ] `createTask(projectId, input)` — insert DB + git worktree add para cada repo
- [ ] `listTasks(projectId)` — query DB
- [ ] `getTask(id)` — query DB by ID
- [ ] `completeTask(id)` — update status + git worktree remove
- [ ] `deleteTask(id)` — remove DB + git worktree remove
- [ ] `getTaskDir(project, task)` — resolve worktree path
- [ ] Worktree criada em `<projectDir>/<taskSlug>/<repoName>/`
- [ ] IPC handlers em `ipc/tasks.ts` usam este service
- [ ] Testes: create task → verify worktree → complete → verify cleanup

**Commit**: `feat: add task service with worktree lifecycle`

---

### T4: Contracts expansion + nativeApi update

**What**: Expandir contracts com todos os tipos M2, atualizar nativeApi no renderer.
**Where**: `packages/contracts/src/`, `apps/web/src/nativeApi.ts`
**Depends on**: T1, T2, T3
**Requirements**: Foundation for UI

**Done when**:

- [ ] contracts/src/projects.ts — Project types, CreateProjectInput, UpdateProjectInput
- [ ] contracts/src/tasks.ts — Task types, CreateTaskInput
- [ ] contracts/src/sessions.ts — Session types
- [ ] contracts/src/ipc.ts — DesktopBridge atualizado com todos os métodos
- [ ] nativeApi.ts no renderer — wrapper tipado para window.desktopBridge
- [ ] `bun typecheck` passa em todos os packages

**Commit**: `feat: expand contracts with project, task, and session types`

---

### T5: Zustand stores — projects + tasks + ui

**What**: Client state management com Zustand.
**Where**: `apps/web/src/stores/`
**Depends on**: T4
**Requirements**: PROJ-02, TASK-02

**Done when**:

- [ ] `stores/projects.ts` — useProjectStore (projects[], selectedProjectId, actions)
- [ ] `stores/tasks.ts` — useTaskStore (tasks[], selectedTaskId, actions)
- [ ] `stores/ui.ts` — useUiStore (sidebarWidth, sidebarCollapsed, etc)
- [ ] Actions chamam nativeApi → atualizam state
- [ ] Funções puras de transição separadas do store (testáveis)
- [ ] `bun typecheck` passa

**Commit**: `feat: add Zustand stores for projects, tasks, and UI state`

---

### T6: Sidebar — project list + task list

**What**: Sidebar funcional com projetos e tasks.
**Where**: `apps/web/src/components/`
**Depends on**: T5
**Requirements**: PROJ-01, PROJ-02, TASK-02

**Done when**:

- [ ] `Sidebar.tsx` refatorado — seções: projects, tasks da task selecionada
- [ ] `ProjectList.tsx` — lista projetos, seleção, botão criar
- [ ] `TaskList.tsx` — lista tasks do projeto selecionado
- [ ] `CreateProjectDialog.tsx` — form: nome, slug, repo paths (folder picker)
- [ ] `CreateTaskDialog.tsx` — form: nome, descrição (slug/branch auto-gerados)
- [ ] Sidebar mostra metadata: branch, status, last active
- [ ] Seleção de projeto/task atualiza stores e route

**Commit**: `feat: add sidebar with project and task management`

---

### T7: Main panel — task workspace view

**What**: Área principal mostra workspace da task selecionada.
**Where**: `apps/web/src/components/`, `apps/web/src/routes/`
**Depends on**: T6
**Requirements**: TASK-02, TASK-05

**Done when**:

- [ ] Route: `/projects/$projectId/tasks/$taskId`
- [ ] `TaskWorkspace.tsx` — overview da task (nome, branch, status, repos, actions)
- [ ] Empty state quando nenhum projeto/task selecionado
- [ ] Action buttons: Launch Claude, Complete Task, Delete Task
- [ ] Task metadata: branch name, worktree paths, created/updated dates
- [ ] `bun typecheck` e `bun lint` passam

**Commit**: `feat: add task workspace view with route navigation`

---

### T8: Claude launcher service

**What**: Lançar Claude Code no terminal externo com contexto completo.
**Where**: `apps/desktop/src/services/launcher.ts`, `apps/desktop/src/ipc/launcher.ts`
**Depends on**: T3
**Requirements**: LAUNCH-01 thru LAUNCH-05

**Done when**:

- [ ] `launchClaude(config)` — spawna terminal com claude command
- [ ] macOS: `open -a Terminal` ou detecta iTerm2/Warp/Ghostty
- [ ] Linux: detecta gnome-terminal/konsole/kitty/alacritty
- [ ] Windows: `wt.exe` (Windows Terminal)
- [ ] Monta CLI args: --append-system-prompt, --add-dir, --session-id/--resume
- [ ] Env vars injetadas via spawn env
- [ ] IPC handler: `desktop:launch-claude`
- [ ] Testes: verifica que args são montados corretamente (sem spawn real)

**Commit**: `feat: add Claude launcher with platform-specific terminal detection`

---

### T9: Session reader service

**What**: Ler sessions do Claude a partir dos JSONL files.
**Where**: `apps/desktop/src/services/sessions.ts`, `apps/desktop/src/ipc/sessions.ts`
**Depends on**: T3
**Requirements**: SESS-01, SESS-02, SESS-03

**Done when**:

- [ ] `listSessions(taskDir)` — scan ~/.claude/projects/<hash>/ para JSONL files
- [ ] `getSessionMetadata(sessionPath)` — parse JSONL, extrair timestamps, message count
- [ ] `computeProjectHash(dirs)` — gerar hash de path como Claude faz
- [ ] IPC handler: `desktop:list-sessions`, `desktop:get-session-metadata`
- [ ] Testes com JSONL fixtures

**Commit**: `feat: add session reader for Claude JSONL files`

---

### T10: System prompt editor

**What**: Editar PROJECT.md e TASK.md na UI.
**Where**: `apps/web/src/components/`, `apps/desktop/src/ipc/prompts.ts`
**Depends on**: T7
**Requirements**: PROMPT-01, PROMPT-02, PROMPT-03

**Done when**:

- [ ] IPC: `desktop:read-prompt`, `desktop:write-prompt` (file path + content)
- [ ] `PromptEditor.tsx` — textarea com markdown preview toggle
- [ ] Tabs: PROJECT.md | TASK.md
- [ ] Preview do prompt completo (concatenação dos dois)
- [ ] Auto-save com debounce (500ms)

**Commit**: `feat: add system prompt editor for PROJECT.md and TASK.md`

---

### T11: Socket server

**What**: Unix socket / Named pipe para comunicação Claude Code → Desktop.
**Where**: `apps/desktop/src/services/socket.ts`
**Depends on**: T1
**Requirements**: SOCK-01, SOCK-02

**Done when**:

- [ ] `startSocketServer(path)` — cria Unix socket (Linux/macOS) ou named pipe (Windows)
- [ ] JSON protocol: `{ method, params, id }` → `{ result, id }` ou `{ error, id }`
- [ ] Handlers: `notify`, `status.update`
- [ ] Cleanup automático ao fechar app
- [ ] IARA_DESKTOP_SOCKET set nas env vars dos child processes
- [ ] Testes: connect → send → receive response

**Commit**: `feat: add socket server for Claude Code communication`

---

### T12: CLI bridge

**What**: Executável CLI que conecta ao socket e envia comandos.
**Where**: `apps/desktop/src/cli-bridge/`
**Depends on**: T11
**Requirements**: SOCK-03

**Done when**:

- [ ] `bridge.ts` — conecta ao socket, envia JSON, imprime resposta, sai
- [ ] Lê IARA_DESKTOP_SOCKET da env
- [ ] Args: `iara-bridge notify "message"`, `iara-bridge browser.navigate "url"`
- [ ] Exit code 0 on success, 1 on error
- [ ] Bundled com tsdown como executável separado

**Commit**: `feat: add CLI bridge for socket communication`

---

### T13: Plugin-dir generation

**What**: Gerar slash commands para Claude Code.
**Where**: `apps/desktop/src/services/plugins.ts`
**Depends on**: T12
**Requirements**: PLUG-01, PLUG-02, PLUG-03

**Done when**:

- [ ] `generatePluginDir(config)` — cria dir temporário com plugin.json + commands/
- [ ] commands/browser.md — instrui Claude a usar bridge para browser ops
- [ ] commands/notify.md — instrui Claude a usar bridge para notificações
- [ ] commands/dev.md — instrui Claude a usar bridge para dev servers
- [ ] plugin.json com metadata
- [ ] Dir passado via --plugin-dir ao lançar Claude
- [ ] Testes: gera dir → verifica estrutura e conteúdo

**Commit**: `feat: add plugin-dir generation for Claude slash commands`

---

### T14: Hooks integration + Environment management

**What**: Registrar hooks no Claude e gerenciar env files.
**Where**: `apps/desktop/src/services/hooks.ts`, `apps/desktop/src/services/env.ts`
**Depends on**: T12
**Requirements**: HOOK-01 thru HOOK-03, ENV-01 thru ENV-03

**Done when**:

- [ ] `mergeHooks(settings)` — merge em ~/.claude/settings.json sem overwrite
- [ ] Hooks guardam por IARA_DESKTOP_SOCKET env var
- [ ] `readEnvFiles(projectDir)` — lê layered env files
- [ ] `writeEnvFile(path, content)` — escreve env file
- [ ] `watchEnvFiles(projectDir, callback)` — fs.watch nos env files
- [ ] IPC handlers para env CRUD
- [ ] UI: env editor com key-value pairs

**Commit**: `feat: add hooks integration and environment management`

---

## Parallel Execution Map

```
Phase 1 (Sequential — Backend):
  T1 → T2 → T3 → T4

Phase 2 (Sequential — UI):
  T5 → T6 → T7

Phase 3 (Parallel — Launcher + Sessions):
  T7 complete, then:
    ├── T8  [P] Claude Launcher
    ├── T9  [P] Session Reader
    └── T10 System Prompt Editor (after T8+T9)

Phase 4 (Sequential — Infrastructure):
  T11 → T12 → T13 → T14
```

---

## Requirement Coverage

| Requirement   | Tasks                            |
| ------------- | -------------------------------- |
| PROJ-01..03   | T2, T4, T6                       |
| PROJ-04       | Deferred (claude -p flow — M2.5) |
| TASK-01..05   | T3, T4, T6, T7                   |
| TASK-04       | Deferred (claude -p flow — M2.5) |
| LAUNCH-01..05 | T8                               |
| SESS-01..03   | T9                               |
| PROMPT-01..03 | T10                              |
| SOCK-01..03   | T11, T12                         |
| PLUG-01..03   | T13                              |
| ENV-01..03    | T14                              |
| HOOK-01..03   | T14                              |

**Deferred**: PROJ-04 e TASK-04 (fluxos claude -p) são complexos e podem ser M2.5.
