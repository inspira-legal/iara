# M1 Scaffold & Worktrees Tasks

**Design**: `.specs/features/scaffold/design.md`
**Status**: Draft

---

## Execution Plan

### Phase 1: Monorepo Foundation (Sequential)

```
T1 → T2 → T3 → T4
```

Cria a estrutura de monorepo do zero. Cada task depende da anterior.

### Phase 2: Electron + Renderer (Sequential)

```
T4 → T5 → T6 → T7
```

Main process, preload, renderer com React, DX scripts.

### Phase 3: Data Layer + Services (Parallel OK)

```
       ┌→ T8  (SQLite + Drizzle) ─┐
T7 ────┤                           ├──→ T11
       └→ T9  (Git service)       ─┘
       └→ T10 (Shell env)         ─┘
```

SQLite, git operations e shell env podem ser implementados em paralelo.

### Phase 4: App Shell + Verificação (Sequential)

```
T11 → T12 → T13
```

Layout visual, smoke test, verificação final.

---

## Task Breakdown

### T1: Root package.json + Turborepo + Bun workspace

**What**: Criar root package.json com Bun workspaces, turbo.json, e configs base.
**Where**: `package.json`, `turbo.json`, `tsconfig.base.json`, `.mise.toml`, `.gitignore`
**Depends on**: None
**Requirement**: FOUND-01

**Done when**:

- [ ] `package.json` com workspaces: `["apps/*", "packages/*", "scripts"]`
- [ ] `turbo.json` com tasks: build, dev, typecheck, test
- [ ] `tsconfig.base.json` com strict flags (ES2023, Bundler resolution)
- [ ] `.mise.toml` com Node 24.13.1 + Bun 1.3.9
- [ ] `.gitignore` com node_modules, dist, dist-electron, .turbo, \*.db

**Verify**:

```bash
cat package.json | grep workspaces
cat turbo.json | grep build
```

**Commit**: `feat: init root monorepo with Turborepo and Bun workspaces`

---

### T2: Linter + Formatter configs

**What**: Configurar oxlint e oxfmt.
**Where**: `.oxlintrc.json`, `.oxfmtrc.json`
**Depends on**: T1
**Requirement**: FOUND-01

**Done when**:

- [ ] `.oxlintrc.json` com plugins: eslint, oxc, react, unicorn, typescript
- [ ] `.oxfmtrc.json` com ignores e sortPackageJson
- [ ] `bun lint` e `bun fmt:check` rodam sem erros (mesmo sem código)

**Verify**:

```bash
bun lint && bun fmt:check
```

**Commit**: `feat: add oxlint and oxfmt configuration`

---

### T3: packages/contracts

**What**: Criar package contracts com tipos base e build tsdown.
**Where**: `packages/contracts/`
**Depends on**: T1
**Requirement**: FOUND-04

**Done when**:

- [ ] `package.json` com build script (tsdown → dual ESM+CJS+DTS)
- [ ] `tsconfig.json` extends base
- [ ] `src/index.ts` com re-exports
- [ ] `src/ipc.ts` com DesktopBridge interface
- [ ] `src/models.ts` com Project e Task types
- [ ] `bun run build` gera dist/ com .mjs, .cjs, .d.ts

**Verify**:

```bash
cd packages/contracts && bun run build && ls dist/
bun typecheck
```

**Commit**: `feat: add contracts package with IPC and model types`

---

### T4: packages/shared

**What**: Criar package shared com subpath exports e utilidades base.
**Where**: `packages/shared/`
**Depends on**: T3
**Requirement**: FOUND-04

**Done when**:

- [ ] `package.json` com subpath exports (sem barrel index)
- [ ] `src/git.ts` com placeholder (exec helper)
- [ ] `src/logging.ts` com placeholder (RotatingFileSink interface)
- [ ] `src/fs.ts` com ensureDir, safeReadJson, safeWriteJson
- [ ] Imports `@iara/shared/git`, `@iara/shared/fs` resolvem corretamente
- [ ] `bun typecheck` passa

**Verify**:

```bash
bun typecheck
```

**Commit**: `feat: add shared package with subpath exports`

---

### T5: apps/desktop — Electron main + preload

**What**: Criar app Electron com main.ts, preload.ts, tsdown config.
**Where**: `apps/desktop/`
**Depends on**: T3, T4
**Requirement**: FOUND-03

**Done when**:

- [ ] `package.json` com electron 40, better-sqlite3, drizzle-orm, @electron/rebuild, wait-on
- [ ] `tsdown.config.ts` com dual entry (main.ts, preload.ts) → CJS em dist-electron/
- [ ] `tsconfig.json` extends base
- [ ] `src/main.ts` — app.whenReady, createWindow, register IPC (getAppInfo)
- [ ] `src/preload.ts` — contextBridge.exposeInMainWorld com DesktopBridge tipado
- [ ] `bun run build` gera dist-electron/main.js e dist-electron/preload.js
- [ ] BrowserWindow com contextIsolation: true, sandbox: true

**Verify**:

```bash
cd apps/desktop && bun run build && ls dist-electron/
```

**Commit**: `feat: add Electron main process with typed preload bridge`

---

### T6: apps/web — React renderer com Vite

**What**: Criar app web com React 19, TanStack Router, Tailwind 4, Vite 8.
**Where**: `apps/web/`
**Depends on**: T3
**Requirement**: FOUND-05

**Done when**:

- [ ] `package.json` com react 19, @tanstack/react-router, tailwindcss 4, zustand, @base-ui/react, cva, tailwind-merge, lucide-react
- [ ] `vite.config.ts` com React + TanStack Router + Tailwind + HMR config
- [ ] `vitest.config.ts` configurado
- [ ] `tsconfig.json` extends base, jsx: react-jsx, alias ~/\*
- [ ] `src/main.tsx` — React root
- [ ] `src/router.ts` — TanStack Router (hash history em prod, browser em dev)
- [ ] `src/index.css` — Tailwind CSS 4 entry
- [ ] `src/nativeApi.ts` — Typed wrapper para window.desktopBridge
- [ ] `src/lib/utils.ts` — cn() helper (tailwind-merge + cva)
- [ ] `src/routes/index.tsx` — Placeholder home page
- [ ] `bun run build` gera dist/

**Verify**:

```bash
cd apps/web && bun run build && ls dist/
bun typecheck
```

**Commit**: `feat: add React renderer with Vite, TanStack Router, and Tailwind CSS 4`

---

### T7: DX — Dev runner + dev-electron + smoke test

**What**: Scripts de DX para desenvolvimento do desktop app.
**Where**: `scripts/dev-runner.ts`, `apps/desktop/scripts/dev-electron.mjs`, `apps/desktop/scripts/smoke-test.mjs`
**Depends on**: T5, T6
**Requirement**: FOUND-02

**Done when**:

- [ ] `bun dev:desktop` aguarda bundler + Vite, lança Electron
- [ ] Modificar .ts no main → Electron reinicia automaticamente (debounce 120ms)
- [ ] Modificar .tsx no renderer → Vite HMR atualiza sem reload
- [ ] `bun run smoke-test` verifica que app não crasheia (exit 0 se ok)
- [ ] Root package.json tem scripts: dev:desktop, build:desktop, smoke-test

**Verify**:

```bash
bun dev:desktop  # Electron abre com janela
# Ctrl+C
bun run smoke-test  # Exit 0
```

**Commit**: `feat: add DX scripts — dev runner, hot-restart, smoke test`

---

### T8: SQLite + Drizzle ORM [P]

**What**: Inicializar SQLite com Drizzle, schema, auto-migrations.
**Where**: `apps/desktop/src/db.ts`, `apps/desktop/src/db/schema.ts`, `apps/desktop/drizzle.config.ts`, `apps/desktop/drizzle/`
**Depends on**: T5
**Reuses**: Schema types de @iara/contracts
**Requirement**: FOUND-06

**Done when**:

- [ ] `src/db/schema.ts` com tables: projects, tasks (conforme design)
- [ ] `src/db.ts` — init SQLite no userData, auto-migrate
- [ ] `drizzle.config.ts` apontando para schema e migrations dir
- [ ] `drizzle/` com migration inicial gerada via drizzle-kit
- [ ] Test: criar project → query → dados corretos
- [ ] Test: criar task com FK → query → dados corretos
- [ ] DB criado automaticamente se não existe

**Verify**:

```bash
cd apps/desktop && bun run test
```

**Commit**: `feat: add SQLite database with Drizzle ORM schema and migrations`

---

### T9: Git service [P]

**What**: Implementar git operations via child_process.
**Where**: `packages/shared/src/git.ts`
**Depends on**: T4
**Requirement**: FOUND-07

**Done when**:

- [ ] `gitExec(args, cwd)` — executa git command, retorna stdout
- [ ] `gitClone(url, dest)` — clone repo
- [ ] `gitWorktreeAdd(repoDir, worktreeDir, branch)` — cria worktree com branch
- [ ] `gitWorktreeRemove(repoDir, worktreeDir)` — remove worktree
- [ ] `gitStatus(cwd)` — retorna { branch, dirtyFiles[] }
- [ ] `gitBranchCreate(cwd, branch)` — cria branch
- [ ] Erros tipados: GitNotInstalledError, GitOperationError
- [ ] Tests com repo temporário: create worktree → status → remove

**Verify**:

```bash
cd packages/shared && bun run test
```

**Commit**: `feat: add git service with worktree operations`

---

### T10: Shell environment service [P]

**What**: Implementar syncShellEnvironment para importar PATH.
**Where**: `apps/desktop/src/services/shell-env.ts`
**Depends on**: T5
**Requirement**: FOUND-03

**Done when**:

- [ ] `syncShellEnvironment()` — executa login shell, captura PATH
- [ ] macOS: executa `$SHELL -ilc 'echo $PATH'`
- [ ] Linux/Windows: no-op (PATH já disponível)
- [ ] Chamado em main.ts antes de qualquer child_process
- [ ] Test: função retorna sem erro em todas as plataformas

**Verify**:

```bash
cd apps/desktop && bun run test
```

**Commit**: `feat: add shell environment sync for macOS PATH import`

---

### T11: IPC handlers — conectar DB + Git ao renderer

**What**: Registrar IPC handlers no main process que expõem DB e Git ao renderer.
**Where**: `apps/desktop/src/main.ts` (modify), `packages/contracts/src/ipc.ts` (modify)
**Depends on**: T8, T9, T10
**Requirement**: FOUND-03, FOUND-06

**Done when**:

- [ ] IPC handler: `getAppInfo()` → { version, platform, isDev }
- [ ] IPC handler: `getProjects()` → Project[] (query SQLite)
- [ ] IPC handler: `createProject(data)` → Project (insert SQLite)
- [ ] IPC handler: `getGitStatus(cwd)` → { branch, dirtyFiles }
- [ ] Tipos de todos os handlers definidos em contracts/ipc.ts
- [ ] Preload bridge expõe todos os handlers
- [ ] Test: chamar handlers via IPC mock

**Verify**:

```bash
bun typecheck
cd apps/desktop && bun run test
```

**Commit**: `feat: wire IPC handlers for DB queries and git status`

---

### T12: App Shell layout

**What**: Implementar layout visual com sidebar + main panel.
**Where**: `apps/web/src/components/`
**Depends on**: T6, T11
**Requirement**: FOUND-05

**Done when**:

- [ ] `AppShell.tsx` — layout flex: sidebar (fixed width) + main panel (flex-1)
- [ ] `Sidebar.tsx` — placeholder com título "iara" e espaço para lista
- [ ] `MainPanel.tsx` — placeholder com "Select a project"
- [ ] Sidebar redimensionável ou colapsável (CSS-only, sem lib)
- [ ] Layout responsivo quando window é redimensionada
- [ ] Tailwind classes, sem CSS custom

**Verify**:

```bash
bun dev:desktop
# Electron abre com sidebar + main panel visíveis
```

**Commit**: `feat: add app shell layout with sidebar and main panel`

---

### T13: Verificação final + CI-ready

**What**: Verificar que tudo funciona junto. Ajustar scripts root.
**Where**: Root `package.json` (modify)
**Depends on**: T12
**Requirement**: FOUND-01, FOUND-02

**Done when**:

- [ ] `bun install` funciona do zero (clean install)
- [ ] `bun dev:desktop` lança Electron com shell layout
- [ ] `bun build:desktop` produz artefatos sem erros (build sequencial: contracts → shared → web → desktop)
- [ ] `bun typecheck` passa em todos os packages
- [ ] `bun lint` passa
- [ ] `bun fmt:check` passa
- [ ] `bun run test` roda todos os testes (SQLite, git, shell-env)
- [ ] `bun run smoke-test` passa
- [ ] DevTools → `window.desktopBridge.getAppInfo()` retorna dados corretos

**Verify**:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
bun install && bun build:desktop && bun typecheck && bun lint && bun fmt:check && bun run test && bun run smoke-test
```

**Commit**: `feat: M1 complete — monorepo scaffold with Electron, SQLite, git worktrees`

---

## Parallel Execution Map

```
Phase 1 (Sequential — Monorepo):
  T1 → T2 → T3 → T4

Phase 2 (Sequential — Electron + Renderer):
  T5 → T6 → T7
  (T5 depende de T3+T4, T6 depende de T3)

Phase 3 (Parallel — Services):
  T7 complete, then:
    ├── T8  [P] SQLite + Drizzle
    ├── T9  [P] Git service
    └── T10 [P] Shell env

Phase 4 (Sequential — Integration):
  T8+T9+T10 complete, then:
    T11 → T12 → T13
```

---

## Task Granularity Check

| Task                  | Scope                        | Status                                      |
| --------------------- | ---------------------------- | ------------------------------------------- |
| T1: Root configs      | 5 config files               | ✅ Cohesive — all root setup                |
| T2: Linter/formatter  | 2 config files               | ✅ Granular                                 |
| T3: Contracts package | 1 package, 3 files           | ✅ Granular                                 |
| T4: Shared package    | 1 package, 3 files           | ✅ Granular                                 |
| T5: Electron main     | 1 app, 3 files               | ✅ Granular                                 |
| T6: React renderer    | 1 app, ~10 files             | ⚠️ Borderline — mas são configs+boilerplate |
| T7: DX scripts        | 3 scripts                    | ✅ Cohesive                                 |
| T8: SQLite + Drizzle  | 1 service, schema, migration | ✅ Granular                                 |
| T9: Git service       | 1 service, 6 functions       | ✅ Granular                                 |
| T10: Shell env        | 1 service, 1 function        | ✅ Granular                                 |
| T11: IPC handlers     | 1 file modify, types         | ✅ Granular                                 |
| T12: App shell layout | 3 components                 | ✅ Granular                                 |
| T13: Verification     | 0 new files, checks          | ✅ Granular                                 |

---

## Requirement Coverage

| Requirement                         | Tasks        |
| ----------------------------------- | ------------ |
| FOUND-01: Monorepo Scaffold         | T1, T2, T13  |
| FOUND-02: Developer Experience      | T7, T13      |
| FOUND-03: Electron Main+Preload+IPC | T5, T10, T11 |
| FOUND-04: Shared Packages           | T3, T4       |
| FOUND-05: App Shell                 | T6, T12      |
| FOUND-06: Data Layer                | T8, T11      |
| FOUND-07: Git Operations            | T9           |

**Coverage**: 7/7 requirements mapped. 0 unmapped.
