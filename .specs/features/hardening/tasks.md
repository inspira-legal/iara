# Hardening — Jornadas Faltantes e Bugs

**Status**: Active
**Prioridade**: CRITICAL — sem isso o MVP não funciona de verdade

---

## Problemas Verificados (real vs falso positivo)

| Issue da auditoria                         | Status   | Veredicto                                                            |
| ------------------------------------------ | -------- | -------------------------------------------------------------------- |
| `resolve.tsconfigPaths` inválido no Vite 8 | ❌ FALSO | Vite 8 suporta nativamente (experimental)                            |
| `registerFileProtocol` deprecated          | ✅ REAL  | Deprecated no Electron 40, mas t3code também usa. Funciona mas warn. |
| Delete project sem confirmação             | ✅ REAL  | Um click destrói tudo                                                |
| Mac launcher via osascript keystroke       | ✅ REAL  | Frágil mas funcional. Melhorar depois.                               |
| Browser panel sobrepõe UI                  | ✅ REAL  | Sem split layout real                                                |
| Session list sem UI                        | ✅ REAL  | Backend OK, zero frontend                                            |
| Dev server discover/start sem UI           | ✅ REAL  | Backend OK, zero frontend                                            |
| Notifications sem UI                       | ✅ REAL  | Backend OK, zero frontend                                            |
| Env management sem UI                      | ✅ REAL  | Backend OK, zero frontend                                            |
| Git worktree -b falha se branch existe     | ✅ REAL  | Sem fallback                                                         |
| Task criada no DB antes de worktree        | ✅ REAL  | Sem rollback                                                         |
| cleanupWorktrees não remove taskDir        | ✅ REAL  | Diretório órfão                                                      |
| git clone cwd: "."                         | ✅ REAL  | Frágil mas funciona                                                  |

---

## Execution Plan

### Phase 1: Bugs Críticos (Sequential)

```
T1 → T2 → T3 → T4
```

Sem esses fixes, o app crasheia ou corrompe dados.

### Phase 2: Git Worktree Robustness (Sequential)

```
T5 → T6
```

Worktree lifecycle precisa ser robusto.

### Phase 3: Frontend das Features com Backend Pronto (Parallel OK)

```
     ┌→ T7  (Session list UI)
T6 ──┤→ T8  (Dev server discover/start UI)
     ├→ T9  (Notifications UI)
     └→ T10 (Env editor UI)
```

### Phase 4: UX Polish (Sequential)

```
T11 → T12
```

---

## Task Breakdown

### T1: Delete project com confirmação

**What**: Dialog de confirmação nativo antes de deletar projeto.
**Where**: `apps/desktop/src/ipc/projects.ts`, `apps/web/src/components/ProjectList.tsx`
**Severity**: CRITICAL — um click acidental destrói dados irreversivelmente

**Done when**:

- [ ] IPC handler `desktop:confirm-dialog` usando `dialog.showMessageBox`
- [ ] Contracts + preload: `confirmDialog(message: string): Promise<boolean>`
- [ ] ProjectList chama confirm antes de onDelete
- [ ] Mensagem: "Delete project X? This removes all repos and worktrees."

**Commit**: `fix: add confirmation dialog before project deletion`

---

### T2: Migrate protocol.registerFileProtocol → protocol.handle

**What**: Usar API moderna do Electron 40 para custom protocol.
**Where**: `apps/desktop/src/main.ts`
**Severity**: HIGH — deprecated, pode ser removido em versões futuras

**Done when**:

- [ ] `protocol.handle(APP_SCHEME, ...)` retorna `Response` com file contents
- [ ] Fallback para index.html em rotas desconhecidas (SPA)
- [ ] Funciona em prod build

**Commit**: `fix: migrate to protocol.handle() for Electron 40 compatibility`

---

### T3: Git clone com cwd explícito

**What**: Usar diretório pai como cwd em vez de ".".
**Where**: `packages/shared/src/git.ts`
**Severity**: MEDIUM

**Done when**:

- [ ] `gitClone(url, dest)` usa `path.dirname(dest)` como cwd
- [ ] Cria diretório pai se não existe
- [ ] Teste atualizado

**Commit**: `fix: use explicit cwd for git clone`

---

### T4: Criar task com rollback se worktree falha

**What**: Se git worktree add falha, reverter insert no DB e limpar diretório.
**Where**: `apps/desktop/src/services/tasks.ts`
**Severity**: HIGH

**Done when**:

- [ ] DB insert movido para depois do worktree creation
- [ ] Ou: try/catch com delete da task + rmSync do taskDir em caso de erro
- [ ] Erro propagado ao frontend com mensagem clara

**Commit**: `fix: rollback task creation if worktree setup fails`

---

### T5: Git worktree add com fallback para branch existente

**What**: Se `-b branch` falha porque branch existe, tentar sem `-b`.
**Where**: `packages/shared/src/git.ts`
**Severity**: HIGH — impede recriar tasks com mesmo slug

**Done when**:

- [ ] `gitWorktreeAdd` tenta `-b branch` primeiro
- [ ] Se falha com "already exists", tenta `git worktree add <dir> <branch>` (attach)
- [ ] Teste: cria branch, remove worktree, recria worktree com mesma branch

**Commit**: `fix: handle existing branch in git worktree add`

---

### T6: cleanupWorktrees remove diretório da task

**What**: Após remover worktrees do git, deletar o diretório da task.
**Where**: `apps/desktop/src/services/tasks.ts`
**Severity**: MEDIUM

**Done when**:

- [ ] `cleanupWorktrees` faz `fs.rmSync(taskDir)` após remover worktrees
- [ ] `deleteTask` não precisa de cleanup separado (cleanupWorktrees já faz tudo)

**Commit**: `fix: cleanup task directory after worktree removal`

---

### T7: Session list UI na TaskWorkspace

**What**: Listar sessions do Claude na TaskWorkspace com opção de resume.
**Where**: `apps/web/src/components/SessionList.tsx`, `apps/web/src/routes/index.tsx`
**Severity**: HIGH — core value prop do app

**Done when**:

- [ ] `SessionList.tsx` — lista sessions com metadata (date, message count)
- [ ] Cada session tem botão "Resume" que chama launchClaude com resumeSessionId
- [ ] "New Session" botão que chama launchClaude sem resume
- [ ] Store ou inline fetch: `api.listSessions(taskId)`
- [ ] Renderizado na TaskWorkspace abaixo dos action buttons

**Commit**: `feat: add session list with resume capability`

---

### T8: Dev server discover + start UI

**What**: UI para descobrir e iniciar dev servers do projeto.
**Where**: `apps/web/src/components/DevServerPanel.tsx` (refactor)
**Severity**: MEDIUM

**Done when**:

- [ ] DevServerPanel mostra "Discovered commands" quando nenhum server roda
- [ ] Botão "Start" por comando descoberto
- [ ] Chama `api.devDiscover(dir)` ao abrir task (dir = repo worktree)
- [ ] Chama `api.devStart(cmd)` ao clicar Start
- [ ] Status atualiza automaticamente (já faz poll a cada 5s)

**Commit**: `feat: add dev server discovery and start UI`

---

### T9: Notification badge + panel

**What**: Badge na sidebar + painel de notificações.
**Where**: `apps/web/src/components/NotificationBadge.tsx`, `Sidebar.tsx`
**Severity**: LOW

**Done when**:

- [ ] `NotificationBadge.tsx` — ícone bell com badge count
- [ ] Click abre dropdown com lista de notificações
- [ ] Mark as read ao clicar
- [ ] Store `useNotificationStore` já existe, wiring no componente
- [ ] Badge na sidebar footer (ao lado de BrowserToggle)

**Commit**: `feat: add notification badge and panel`

---

### T10: Env editor UI

**What**: Editor visual de env files na TaskWorkspace.
**Where**: `apps/web/src/components/EnvEditor.tsx`
**Severity**: LOW — pode editar via IDE

**Done when**:

- [ ] `EnvEditor.tsx` — key-value editor
- [ ] Carrega de `api.envRead(filePath)`
- [ ] Salva com `api.envWrite(filePath, entries)`
- [ ] Integrado como tab na TaskWorkspace
- [ ] Contracts precisa `envRead/envWrite` no DesktopBridge (parcialmente existe)

**Commit**: `feat: add visual environment editor`

---

### T11: Browser panel split layout real

**What**: Quando browser panel abre, renderer redimensiona pra ocupar só metade.
**Where**: `apps/desktop/src/main.ts`, `apps/desktop/src/services/browser-panel.ts`
**Severity**: MEDIUM

**Done when**:

- [ ] Main process envia IPC ao renderer quando browser panel toggle
- [ ] Renderer ajusta seu width via CSS ou container resize
- [ ] Ou: usar Electron multi-view com bounds corretos para ambos
- [ ] Browser panel não sobrepõe mais o conteúdo

**Commit**: `fix: implement real split layout for browser panel`

---

### T12: Progress feedback para operações lentas

**What**: Loading states para git clone, worktree create.
**Where**: `apps/web/src/components/CreateProjectDialog.tsx`, `CreateTaskDialog.tsx`
**Severity**: LOW

**Done when**:

- [ ] Dialog mostra "Cloning repos..." durante create project
- [ ] Dialog mostra "Creating worktrees..." durante create task
- [ ] Disable backdrop click durante submitting
- [ ] Error state visual se falha

**Commit**: `feat: add progress feedback for git operations`

---

## Parallel Execution Map

```
Phase 1 (Sequential — Critical Bugs):
  T1 → T2 → T3 → T4

Phase 2 (Sequential — Git Robustness):
  T5 → T6

Phase 3 (Parallel — Frontend Features):
  T6 complete, then:
    ├── T7  [P] Session list
    ├── T8  [P] Dev server UI
    ├── T9  [P] Notifications
    └── T10 [P] Env editor

Phase 4 (Sequential — UX):
  T11 → T12
```

## Estimate

- Phase 1 (T1-T4): ~4 tasks, focados, 1 sessão
- Phase 2 (T5-T6): ~2 tasks, testes de git, rápido
- Phase 3 (T7-T10): ~4 tasks paralelos, frontend puro
- Phase 4 (T11-T12): ~2 tasks, UX polish
