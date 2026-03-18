# Project CRUD UX — Preencher Lacunas

**Status**: Pendente
**Scope**: Medium
**Referência**: CLI Go (`iara-deprecated-cli`) como baseline de comportamentos

---

## Contexto

O desktop reimplementou o CRUD de projetos, mas com UX simplificada comparada à CLI Go. Esta spec preenche as lacunas identificadas, adaptando os comportamentos ao contexto GUI.

### Mudança Arquitetural: Filesystem como Fonte de Verdade, DB como Cache Resiliente

A CLI Go usava o filesystem como fonte de verdade para projetos (`~/.iara/projects/`). O desktop usa SQLite. Esta spec restaura o modelo filesystem-first com DB como cache:

- Projetos são **pastas** em `~/.iara/projects/`. Se a pasta existe, o projeto existe.
- O banco de dados funciona como **cache de metadata** (nome visual, timestamps), não como fonte de verdade de existência.
- Pastas adicionadas manualmente devem ser reconhecidas automaticamente como projetos.
- **Resiliência**: Se uma operação de filesystem falha, o sistema faz sync (reconcilia DB ↔ FS) e retenta a operação. O DB nunca fica em estado inconsistente com o filesystem por mais de um ciclo de sync.

---

## Requirements

### Descoberta Dinâmica de Projetos

- **DISC-01**: Projetos são descobertos escaneando `~/.iara/projects/`. Cada subpasta é um projeto potencial.
- **DISC-02**: Se uma pasta existe no filesystem mas não no DB, ela aparece na sidebar como projeto "não configurado" (nome = slug da pasta).
- **DISC-03**: Se um registro existe no DB mas a pasta não existe mais, o registro é removido (cleanup automático).
- **DISC-04**: O scan deve rodar no `loadProjects()` e sincronizar DB ↔ filesystem.
- **DISC-06**: Se uma operação de FS falha (create, delete, clone), executar sync (DISC-04) e retentaruma vez. Se falhar novamente, propagar o erro ao usuário.
- **DISC-05**: Repos dentro de um projeto são descobertos escaneando `.repos/` (cada subpasta com `.git` é um repo).

### Rename de Projeto

- **REN-01**: Editar o **nome visual** do projeto (campo `name` no DB). O slug/pasta **não muda**.
- **REN-02**: O rename é feito inline no `ProjectView` — clicar no nome transforma em input editável.
- **REN-03**: Validação: nome não pode ser vazio. Sem restrição de unicidade (nomes visuais podem repetir).
- **REN-04**: Salvar com Enter, cancelar com Escape. Auto-save on blur.

### Wizard de Criação de Projeto

- **WIZ-01**: Criar projeto = criar pasta em `~/.iara/projects/<slug>/` + `.repos/`.
- **WIZ-02**: Wizard em dois passos: (1) Nome do projeto → auto-gera slug, (2) Adicionar repos.
- **WIZ-03**: Slug é editável manualmente no passo 1. Validação: slug único (pasta não pode existir).
- **WIZ-04**: No passo 2, três métodos de adicionar repo:
  - **Git URL**: Input de URL + input de nome do repo. Nome sugerido automaticamente a partir da URL.
  - **Pasta local**: File picker que seleciona pasta. Se não tem `.git`, faz `git init`. Copia a pasta para `.repos/<nome>/`.
  - **Repo vazio**: Input de nome → cria pasta em `.repos/<nome>/` e faz `git init`.
- **WIZ-05**: Cada repo **deve ter um nome** definido pelo usuário (sugerido automaticamente, editável).
- **WIZ-06**: O wizard permite adicionar múltiplos repos antes de finalizar (lista acumulativa com remove).
- **WIZ-07**: Botão "Create Project" só habilitado quando tem nome + slug válido + pelo menos 1 repo.
- **WIZ-08**: Progress feedback durante clone (pode ser simples: spinner + "Cloning repo-name...").

### Preview de Projeto com Metadata Rica

- **PREV-01**: Ao selecionar projeto na sidebar (sem task selecionada), o painel principal mostra o `ProjectView` com metadata rica.
- **PREV-02**: Para cada repo, mostrar: nome, branch atual, status (clean ✓ / dirty ● com contagem), ahead/behind (↑N ↓N).
- **PREV-03**: As informações de git são carregadas sob demanda ao abrir o `ProjectView` (não no scan de sidebar).
- **PREV-04**: Loading state enquanto git info carrega (pode ser por-repo: cada repo mostra skeleton → dados).

### Gerenciamento de Repos no ProjectView

- **REPO-01**: O `ProjectView` lista os repos com suas informações git (PREV-02).
- **REPO-02**: Cada repo tem ação de remover (X) com confirmação inline.
- **REPO-03**: Botão "Add Repo" no `ProjectView` abre sub-dialog com as mesmas 3 opções do wizard (WIZ-04): Git URL, Pasta local, Repo vazio.
- **REPO-04**: Ao adicionar repo, worktrees são criados automaticamente para tasks ativas (comportamento existente).
- **REPO-05**: Ao remover repo, worktrees são limpos primeiro (comportamento existente).

### Confirmação de Delete In-App

- **DEL-01**: Delete de projeto usa dialog customizado dentro do app (modal), não dialog nativo do Electron.
- **DEL-02**: O dialog mostra: nome do projeto, lista de repos que serão removidos, contagem de tasks ativas.
- **DEL-03**: Botão de confirmar em vermelho com texto "Delete Project". Botão cancelar neutro.
- **DEL-04**: Mesma abordagem para delete de repo individual: dialog in-app com contexto do que será removido.
- **DEL-05**: Delete de task também usa dialog in-app: mostra nome da task, branch, e aviso de que worktrees serão removidos.

---

## Fora de Escopo

- GitHub integration (listar repos via `gh`) — futuro
- Git visualization (branch graph)
- Filesystem watcher para hot-reload de projetos (scan é manual via `loadProjects`)
- Rename de slug/pasta de projeto
