# Project Root

## Visao Geral

Cada projeto ganha um item compacto na sidebar — o "project root" — que abre Claude Code diretamente no `default/` sem criar worktrees. Aparece dentro do ProjectNode, fixado acima das tasks, com visual reduzido. Um por projeto, maximo.

Projetos na sidebar passam a se comportar apenas como pastas (expand/collapse). Clicar num projeto nao abre nenhuma tela — so expande pra mostrar root + tasks.

## Motivacao

Tasks criam worktrees para cada branch, ideal para trabalho paralelo. Mas para acesso rapido aos repos do projeto sem overhead de worktree, o root oferece acesso direto ao repo real, na branch que estiver.

A tela de projeto (ProjectView) hoje mistura gestao de repos com sessoes e nao tem funcao clara apos a criacao. Remover simplifica a UX — projeto e so um agrupador.

## Pre-requisito: Rename `.repos/` → `default/`

- Renomear o diretorio de repos canônicos de `.repos/` → `default/` em toda a codebase
- Bloquear slug `default` no `createTask` (validacao server + frontend)
- Atualizar todos os paths em: `tasks.ts`, `repos.ts`, `projects.ts`, `launcher.ts`, `terminal.ts`, handlers
- Atualizar system prompt: referencias a `.repos/` → `default/`

## Requisitos

### REQ-RT-01: Remover ProjectView — projetos sao so pastas

- Remover `ProjectView.tsx` e todas as referencias
- Clicar num projeto na sidebar so faz expand/collapse
- `selectedProjectId` sem `selectedTaskId` → main panel mostra workspace do project root (ao inves de placeholder)
- Funcionalidades que estavam no ProjectView e precisam de novo lar:
  - **Add Repo**: context menu do projeto + workspace do project root (REQ-RT-04)
  - **Remove Repo**: workspace do project root (REQ-RT-04)
  - **Rename projeto**: ja existe no context menu do ProjectNode
  - **Sessions do projeto**: movem pro workspace do project root

### REQ-RT-02: Remover icone de status (bola azul) das tasks

- TaskNode hoje mostra um `<Circle>` azul preenchido como icone de status
- Remover esse icone — tasks nao tem estado "ativo/inativo" que justifique
- TaskNode fica: nome (primeira linha) + branch + timestamp (segunda linha), sem icone a esquerda

### REQ-RT-03: Sidebar — item compacto, dentro do projeto, acima das tasks

- Quando projeto tem repos em `default/`, renderizar um item compacto no ProjectNode expandido, **acima** da lista de tasks
- Label fixo: `project root`
- Visual: single line, icone FolderRoot (ou FolderOpen) + "project root". Sem segunda linha, sem timestamp
- Clique seleciona e abre o workspace do project root
- Visualmente separado das tasks (spacing ou linha sutil)
- Integrar na keyboard navigation do ProjectTree (flatItems inclui root antes das tasks)

### REQ-RT-04: Workspace do project root

- Quando project root e selecionado, o painel principal mostra workspace semelhante ao TaskWorkspace
- Header: nome do projeto (sem badge de branch)
- Repos section: mostra info dos repos em `default/` (com botao de remove repo + add repo). Cada repo card mostra sua branch atual
- Sessions section: lista sessoes associadas
- Launch: abre Claude Code com cwd nos `default/` dirs diretamente
- Auto fetch/pull: fetch periodico a cada 5 min. Pull best-effort somente se o repo estiver na default branch (detectada via `git symbolic-ref refs/remotes/origin/HEAD`, fallback `main`/`master`). Se estiver em outra branch, so fetch.

### REQ-RT-05: System prompt

- Novo `buildRootPrompt()` — diferente do `buildSystemPrompt()` de tasks
- Lista repos sem mencionar worktree:
  ```
  # REPOS
  {repoName}/  ← git repository (branch: {branchAtual})
  {repoName2}/  ← git repository (branch: {branchAtual2})
  ```
- Inclui `<project>` tag com PROJECT.md se existir
- NAO inclui `<task>` tag

### REQ-RT-06: Terminal/Launch

- `terminal.create` deve aceitar novo param: `projectId` + `root: true` (alternativo a `taskId`)
- Atualizar `WsMethods` no contracts pra suportar union: `{ taskId: string } | { projectId: string; root: true }` (ambos com `resumeSessionId?`)
- Quando `root` e fornecido:
  - Resolve repos em `default/` do projeto
  - repoDirs = cada repo em `default/`
  - Lanca na branch que o repo estiver — sem checkout, sem deteccao
  - env inclui `IARA_WORKSPACE_TYPE=default`, `IARA_WORKSPACE_ID`, `IARA_WORKSPACE_DIR`, `IARA_PROJECT_ID`, `IARA_PROJECT_DIR`
  - system prompt usa `buildRootPrompt()`

### REQ-RT-07: Selecao na sidebar — state management

- Nao precisa de novo state. Project root = `selectedProjectId` definido + `selectedTaskId` null
- Clicar no item project root: `selectProject(projectId)`, `selectTask(null)`
- HomePage (index route): se tem projeto sem task → renderiza workspace do project root

## Riscos

- **Projeto sem repos**: Se `default/` nao existe ou esta vazio, item project root nao aparece na sidebar. Add Repo so via context menu do projeto.

## Fora de escopo

- Hook guardrail pra prevenir checkout de branch
- Multiplos items root por projeto na sidebar (sempre um so)
- Merge/PR actions a partir do project root

## Decisoes de design

- **Sem worktree** — trabalha direto no `default/` (renomeado de `.repos/`)
- **Rename `.repos/` → `default/`** — pre-requisito. `default` bloqueado como slug de task
- **Label fixo "project root"** — nao depende de branch, nao muda
- **ProjectView removido** — projeto e so pasta. Add/Remove repo vai pro context menu e workspace
- **Sessions** compartilham o mesmo dir (`default/`), sessions se misturam — aceitavel pra v1
- **Bola azul removida** das tasks (icone de status sem funcao)
- **Launch simples** — abre na branch que o repo estiver, sem checkout forcado
