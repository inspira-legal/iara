# M1 Scaffold & Worktrees Specification

## Problem Statement

O repo iara-desktop esta vazio. Precisamos do monorepo funcional, Electron rodando, e git worktree operations funcionais como base tecnica para todas as features subsequentes.

## Goals

- [ ] Electron app roda em dev mode com hot-reload do renderer e hot-restart do main
- [ ] Build pipeline completo (dev, build, typecheck, lint, fmt, test, smoke-test)
- [ ] Layout shell basico (sidebar + main panel com placeholder)
- [ ] Data layer com SQLite e modelos tipados
- [ ] Git worktree operations funcionais (create, remove, status)
- [ ] DX fluida baseada no t3code (mise, dev-runner, portas deterministicas)

## Out of Scope

| Feature                         | Reason |
| ------------------------------- | ------ |
| Project/task management UI      | M2     |
| Session management UI           | M2     |
| Claude Code launcher            | M2     |
| Plugin-dir generation           | M2     |
| Socket server / CLI bridge      | M2     |
| Environment management UI       | M2     |
| System prompt editor            | M2     |
| Browser panel funcional         | M3     |
| Dev server supervisor           | M3     |
| Notifications                   | M4     |
| Packaging (DMG, AppImage, NSIS) | M4     |

---

## User Stories

### P1: Monorepo Scaffold ⭐ MVP

**User Story**: Como desenvolvedor, quero um monorepo Turborepo funcional para que eu possa desenvolver o desktop app incrementalmente.

**Why P1**: Sem estrutura, nenhum codigo pode ser escrito.

**Acceptance Criteria**:

1. WHEN `bun install` is run in the root THEN dependencies SHALL install without errors on macOS, Linux e Windows
2. WHEN `bun dev:desktop` is run THEN Electron SHALL launch com janela mostrando o app shell
3. WHEN `bun build:desktop` is run THEN SHALL produce dist-electron/ com main.js e preload.js bundled
4. WHEN `bun typecheck` is run THEN TypeScript SHALL compile all packages sem erros
5. WHEN `bun lint` is run THEN oxlint SHALL executar em todos os packages
6. WHEN `bun fmt:check` is run THEN oxfmt SHALL validar formatacao
7. WHEN `bun run test` is run THEN vitest SHALL executar testes

**Independent Test**: Clone → `bun install && bun dev:desktop` → janela Electron abre.

---

### P1: Developer Experience ⭐ MVP

**User Story**: Como desenvolvedor, quero DX fluido com hot-restart, portas deterministicas e tooling moderno.

**Why P1**: DX ruim trava todo o desenvolvimento subsequente.

**Acceptance Criteria**:

1. WHEN `bun dev:desktop` is run THEN SHALL aguardar bundler + Vite prontos antes de lancar Electron
2. WHEN arquivo .ts no main process e modificado THEN Electron SHALL reiniciar (hot-restart com debounce)
3. WHEN arquivo .tsx no renderer e modificado THEN Vite HMR SHALL atualizar sem reload
4. WHEN mise e instalado THEN `mise install` SHALL configurar Node.js e Bun nas versoes corretas
5. WHEN `bun run smoke-test` is run THEN SHALL verificar que o app nao crasheia na inicializacao

**Independent Test**: Modificar componente React → mudanca instantanea. Modificar main.ts → Electron reinicia.

---

### P1: Electron Main + Preload + IPC ⭐ MVP

**User Story**: Como desenvolvedor, quero main process com preload bridge tipado para comunicacao segura renderer ↔ sistema.

**Why P1**: Base para toda comunicacao.

**Acceptance Criteria**:

1. WHEN Electron starts THEN main process SHALL criar BrowserWindow com contextIsolation + sandbox
2. WHEN renderer calls `window.desktopBridge.getAppInfo()` THEN SHALL retornar `{ version, platform, isDev }`
3. WHEN app roda em dev THEN renderer SHALL carregar Vite dev server URL
4. WHEN app roda em prod THEN renderer SHALL carregar via custom protocol
5. WHEN IPC types sao definidos em contracts THEN main e renderer SHALL usar os mesmos tipos
6. WHEN syncShellEnvironment() roda THEN PATH do shell do user SHALL estar disponivel

**Independent Test**: DevTools → `window.desktopBridge.getAppInfo()` retorna dados corretos.

---

### P1: Shared Packages ⭐ MVP

**User Story**: Como desenvolvedor, quero packages contracts e shared para compartilhar tipos e utilidades.

**Why P1**: Previne duplicacao desde o inicio.

**Acceptance Criteria**:

1. WHEN importing from `@iara/contracts` THEN TypeScript SHALL resolver tipos
2. WHEN importing from `@iara/shared` via subpath exports THEN utilidades SHALL estar disponiveis
3. WHEN contracts e modificado THEN dependentes SHALL rebuildar (Turborepo)
4. WHEN shared exporta utilidade THEN SHALL nao ter barrel index (subpath exports explicitos)

**Independent Test**: Tipo em contracts → importar em renderer e main → typecheck passa.

---

### P1: App Shell ⭐ MVP

**User Story**: Como desenvolvedor, quero o layout shell basico para validar a estrutura visual.

**Why P1**: Validacao da arquitetura de UI.

**Acceptance Criteria**:

1. WHEN app abre THEN SHALL renderizar sidebar + main panel com placeholder content
2. WHEN sidebar area e visivel THEN SHALL ter espaco para futura lista de projetos/tasks
3. WHEN window e redimensionada THEN layout SHALL ser responsivo
4. WHEN TanStack Router e configurado THEN `/` SHALL renderizar home page placeholder

**Independent Test**: Abrir app → ver layout com sidebar e main panel.

---

### P1: Data Layer ⭐ MVP

**User Story**: Como desenvolvedor, quero SQLite database e modelos de dados para que features de dominio possam ser construidas.

**Why P1**: Sem data layer, M2 nao funciona.

**Acceptance Criteria**:

1. WHEN app inicia THEN SHALL criar/abrir SQLite database no userData do Electron
2. WHEN um Project e criado via service THEN SHALL persistir no SQLite com campos corretos
3. WHEN um Task e criado via service THEN SHALL gerar ID unico e persistir no SQLite
4. WHEN database nao existe THEN SHALL rodar migrations automaticamente
5. WHEN modelos sao definidos em contracts THEN main e renderer SHALL compartilhar tipos

**Independent Test**: Vitest — CRUD via services → verificar dados no SQLite → ler de volta.

---

### P1: Git Operations ⭐ MVP

**User Story**: Como desenvolvedor, quero operacoes git via child_process para gerenciar worktrees programaticamente.

**Why P1**: Task management (M2) depende de git operations.

**Acceptance Criteria**:

1. WHEN worktree e criado THEN SHALL executar `git worktree add` com branch
2. WHEN worktree e removido THEN SHALL executar `git worktree remove`
3. WHEN status e solicitado THEN SHALL retornar branch atual e dirty files
4. WHEN git nao esta instalado THEN SHALL retornar erro claro
5. WHEN operacao git falha THEN SHALL propagar erro com mensagem legivel

**Independent Test**: Vitest — criar worktree → verificar branch → dirty files → remover → cleanup.

---

## Edge Cases

- WHEN Bun nao esta instalado THEN package.json engines field SHALL documentar versao
- WHEN Node.js versao e incompativel THEN build SHALL falhar com mensagem clara
- WHEN Electron crasheia durante dev THEN dev script SHALL permitir restart sem matar Vite
- WHEN `bun install` roda em Windows THEN native dependencies SHALL compilar
- WHEN `bun install` roda em macOS (arm64) THEN native dependencies SHALL compilar
- WHEN `bun install` roda em Linux THEN native dependencies SHALL compilar
- WHEN SQLite database esta corrompido THEN SHALL tratar gracefully (recreate)
- WHEN git repo nao suporta worktrees THEN SHALL mostrar erro claro

---

## Requirement Traceability

| Requirement ID | Story                         | Phase  | Status  |
| -------------- | ----------------------------- | ------ | ------- |
| FOUND-01       | P1: Monorepo Scaffold         | Design | Pending |
| FOUND-02       | P1: Developer Experience      | Design | Pending |
| FOUND-03       | P1: Electron Main+Preload+IPC | Design | Pending |
| FOUND-04       | P1: Shared Packages           | Design | Pending |
| FOUND-05       | P1: App Shell                 | Design | Pending |
| FOUND-06       | P1: Data Layer                | Design | Pending |
| FOUND-07       | P1: Git Operations            | Design | Pending |

**Coverage:** 7 total, 0 mapped to tasks, 7 unmapped

---

## Success Criteria

- [ ] `bun install && bun dev:desktop` funciona do zero em macOS, Linux e Windows
- [ ] `bun build:desktop` produz artefatos sem erros
- [ ] `bun typecheck && bun lint && bun fmt:check` passam limpos
- [ ] `bun run smoke-test` passa
- [ ] SQLite CRUD funcional (vitest)
- [ ] Git worktree create/remove funcional (vitest)
- [ ] DX segue padroes t3code (mise, dev-runner, hot-restart)
