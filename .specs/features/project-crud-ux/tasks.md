# Tasks — Project CRUD UX

## Dependências

```
T1 (sync service) ──┬── T2 (repo discovery)
                     ├── T3 (contracts update)
                     │
T3 ─────────────────┬── T4 (IPC + git info)
                     │
T2 + T4 ────────────┬── T5 (ProjectView rica)
                     ├── T6 (rename inline)
                     │
T3 ─────────────────┬── T7 (ConfirmDialog component)
                     ├── T8 (AddRepoDialog component)
                     │
T7 + T8 ────────────┬── T9 (CreateProjectDialog refactor)
                     │
T5 + T7 + T8 ───────┬── T10 (integração final + delete in-app)
```

---

## T1 — Sync service: filesystem ↔ DB

**Reqs**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-06

**O que fazer:**

- Criar função `syncProjects()` no service `projects.ts` do desktop
- Scan `~/.iara/projects/` → lista de subpastas (slugs)
- Para cada pasta sem registro no DB → inserir com `name = slug`
- Para cada registro no DB sem pasta → deletar registro (e tasks associadas)
- Refatorar `listProjects()` para chamar `syncProjects()` antes de retornar
- Implementar `withRetry(operation)`: se FS falha → sync → retry uma vez → propagar erro

**Verificação:**

- Criar pasta manualmente em `~/.iara/projects/test-manual/` → aparece na lista
- Deletar pasta de projeto existente → registro some do DB
- Operação de FS que falha → retry acontece após sync

---

## T2 — Repo discovery via filesystem

**Reqs**: DISC-05

**O que fazer:**

- Criar função `discoverRepos(projectSlug)` que escaneia `.repos/` do projeto
- Cada subpasta com `.git` é um repo. Nome = nome da subpasta
- Atualizar `repoSources` no DB baseado no que existe em `.repos/` (sync)
- `getProject()` deve retornar repos reais do filesystem, não só o que está no DB

**Verificação:**

- Clonar repo manualmente em `.repos/novo-repo/` → aparece na lista de repos do projeto
- Deletar pasta de repo em `.repos/` → some da lista

---

## T3 — Atualizar contracts e models

**Reqs**: WIZ-05, PREV-02

**O que fazer:**

- Adicionar `RepoInfo` ao contracts:
  ```ts
  interface RepoInfo {
    name: string; // nome da pasta em .repos/
    branch: string; // branch atual
    dirtyCount: number; // arquivos modificados
    ahead: number; // commits à frente do remote
    behind: number; // commits atrás do remote
  }
  ```
- Adicionar `AddRepoInput` ao contracts:
  ```ts
  interface AddRepoInput {
    method: "git-url" | "local-folder" | "empty";
    name: string; // nome do repo (obrigatório)
    url?: string; // para git-url
    folderPath?: string; // para local-folder
  }
  ```
- Atualizar `CreateProjectInput` para incluir lista de `AddRepoInput` ao invés de `repoSources: string[]`
- Adicionar IPC channel `getRepoInfo(projectId)` → `RepoInfo[]`
- Adicionar IPC channel `addRepo(projectId, input: AddRepoInput)`

**Verificação:**

- `bun typecheck` passa
- Contracts exportam os novos tipos

---

## T4 — IPC handlers: git info + add repo

**Reqs**: PREV-02, PREV-03, WIZ-04, REPO-03

**O que fazer:**

- Implementar handler `getRepoInfo(projectId)`:
  - Para cada repo em `.repos/`, executar: `git branch --show-current`, `git status --porcelain`, `git rev-list --left-right --count HEAD...@{upstream}`
  - Retornar array de `RepoInfo`
- Implementar handler `addRepo(projectId, input)`:
  - `git-url`: `gitClone(url, .repos/<name>)`
  - `local-folder`: copiar pasta para `.repos/<name>/`, `git init` se não tem `.git`
  - `empty`: `mkdir .repos/<name>/`, `git init`
  - Criar worktrees para tasks ativas (reutilizar lógica existente de updateProject)
- Usar `withRetry` do T1 nas operações de FS

**Verificação:**

- `getRepoInfo` retorna dados corretos para repos existentes
- `addRepo` com cada método funciona (clone, copy+init, empty+init)
- Worktrees criados para tasks ativas ao adicionar repo

---

## T5 — ProjectView com metadata rica de repos

**Reqs**: PREV-01, PREV-02, PREV-03, PREV-04, REPO-01, REN-01

**O que fazer:**

- Refatorar `ProjectView.tsx`:
  - Carregar `RepoInfo[]` via novo IPC ao montar/selecionar projeto
  - Mostrar cada repo com: nome, branch, dirty status (✓/● N modified), ahead/behind (↑N ↓N)
  - Loading skeleton por repo enquanto git info carrega
- Remover o input de URL inline atual (será substituído pelo AddRepoDialog no T8)
- Manter botão "Add Repo" (abrirá dialog do T8)

**Verificação:**

- Selecionar projeto → mostra repos com branch, status, ahead/behind
- Loading state visível enquanto carrega
- Repos adicionados manualmente em `.repos/` aparecem

---

## T6 — Rename inline no ProjectView

**Reqs**: REN-01, REN-02, REN-03, REN-04

**O que fazer:**

- No `ProjectView`, transformar o `<h2>` do nome em componente editável:
  - Click no nome → input com valor atual
  - Enter → salvar (updateProject com novo name)
  - Escape → cancelar
  - Blur → auto-save (se mudou)
  - Validação: não pode ser vazio
- Mostrar slug abaixo como info estática (não editável)

**Verificação:**

- Click no nome → vira input
- Enter salva, Escape cancela, blur salva
- Nome vazio não salva (volta ao anterior)
- Slug permanece inalterado

---

## T7 — Componente ConfirmDialog in-app

**Reqs**: DEL-01, DEL-02, DEL-03, DEL-04, DEL-05

**O que fazer:**

- Criar `ConfirmDialog.tsx` genérico:
  - Props: `title`, `description`, `details?: ReactNode`, `confirmText`, `confirmVariant: "danger" | "default"`, `onConfirm`, `onCancel`
  - Visual: modal overlay, botão confirmar vermelho (danger) ou azul (default), botão cancelar neutro
- Estilo consistente com `CreateProjectDialog` (mesma estrutura de modal)

**Verificação:**

- Renderiza com título, descrição, detalhes opcionais
- Botão danger é vermelho, default é azul
- onConfirm e onCancel chamados corretamente
- Fecha com Escape

---

## T8 — Componente AddRepoDialog

**Reqs**: WIZ-04, WIZ-05, REPO-03

**O que fazer:**

- Criar `AddRepoDialog.tsx`:
  - 3 tabs/botões: "Git URL", "Local Folder", "Empty Repo"
  - **Git URL**: input URL + input nome (auto-sugerido da URL, editável)
  - **Local Folder**: botão que abre `pickFolder()` + input nome (auto-sugerido do folder name)
  - **Empty Repo**: input nome apenas
  - Botão "Add" — chama `addRepo` IPC
  - Spinner durante clone/copy
- Este componente é reutilizado no wizard (T9) e no ProjectView (T5)

**Verificação:**

- Cada método funciona: clone de URL, copy de pasta local (com git init), empty com git init
- Nome é obrigatório e editável em todos os métodos
- Feedback visual durante operação (spinner)

---

## T9 — Refatorar CreateProjectDialog (wizard)

**Reqs**: WIZ-01, WIZ-02, WIZ-03, WIZ-06, WIZ-07, WIZ-08

**O que fazer:**

- Refatorar `CreateProjectDialog.tsx` em wizard de dois passos:
  - **Passo 1**: Nome + slug (como atual, com slug editável e validação de unicidade via filesystem)
  - **Passo 2**: Lista de repos acumulativa. Usa `AddRepoDialog` (T8) como sub-dialog para adicionar. Cada repo na lista com botão remove.
- "Create Project" só habilitado com nome + slug válido + >= 1 repo
- Ao criar: cria pasta `~/.iara/projects/<slug>/.repos/`, depois adiciona cada repo em sequência com progress

**Verificação:**

- Passo 1 → 2 → criar funciona
- Slug duplicado bloqueia (checa se pasta existe)
- Sem repos → botão Create desabilitado
- Progress feedback durante clone
- Voltar do passo 2 para 1 mantém dados

---

## T10 — Integração: delete in-app + wiring final

**Reqs**: DEL-01 a DEL-05, REPO-02, REPO-04, REPO-05

**O que fazer:**

- Substituir `confirmDialog` nativo por `ConfirmDialog` (T7) em:
  - Delete de projeto: mostra nome, lista repos, contagem de tasks ativas
  - Delete de repo: mostra nome do repo, aviso de worktrees
  - Delete de task: mostra nome, branch, aviso de worktrees
- Wiring do `AddRepoDialog` no `ProjectView` (botão "Add Repo")
- Wiring do remove repo no `ProjectView` com `ConfirmDialog`
- Garantir que toda a sidebar reflete mudanças após operações (reload)

**Verificação:**

- Delete projeto → dialog in-app com detalhes → confirma → projeto removido
- Delete repo → dialog in-app → confirma → repo removido, worktrees limpos
- Delete task → dialog in-app → confirma → task removida, worktrees limpos
- Add repo no ProjectView funciona com os 3 métodos
- Sidebar atualiza após todas as operações
