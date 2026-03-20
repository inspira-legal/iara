# Setup Project & Task via Agent SDK

## Visão Geral

Usar o Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) para dois fluxos inteligentes:

1. **Project creation**: Nome + descrição → add repos → Claude analisa tudo e gera PROJECT.md → cria automaticamente
2. **Task creation**: Texto livre "what are you working on?" → Claude analisa projeto, branches existentes, e gera nome, branches por repo (respeitando padrão do repo), e TASK.md → confirma e cria

## Contexto Técnico

- Agent SDK spawna o Claude Code como child process — herda auth do CLI do usuário (assinatura)
- Sem necessidade de API key — o usuário já tem Claude Code instalado e logado (pré-requisito do iara)
- `query()` retorna async generator com streaming de mensagens
- `outputFormat: { type: "json_schema", schema }` para structured output nativo — SDK faz retry interno se JSON inválido
- `z.toJSONSchema()` (Zod 4) gera o JSON Schema a partir do Zod — fonte de verdade única
- `allowedTools` + `disallowedTools` + `permissionMode: "dontAsk"` para controle granular
- `cwd` define diretório de trabalho — repos filhos são acessíveis automaticamente
- `maxTurns` como safety net pra não ficar em loop infinito

## Requisitos

### CP-01: Utility para executar Agent SDK

- Nova função `runClaude` em `services/claude-runner.ts` com overloads que retorna um objeto `ClaudeRun`:

  ```ts
  // Sem schema → resultado é string
  function runClaude(config: ClaudeRunConfig): ClaudeRun<string>;
  // Com schema → resultado é objeto tipado
  function runClaude<T>(config: ClaudeRunConfig, schema: ZodSchema<T>): ClaudeRun<T>;

  interface ClaudeRun<T> {
    progress: AsyncIterable<ClaudeProgress>; // frontend consome via WS push
    result: Promise<T>; // handler awaita o resultado final
    abort: () => void; // cancela via AbortController
  }
  ```

- `ClaudeRunConfig`:
  ```ts
  interface ClaudeRunConfig {
    cwd: string;
    prompt: string;
    systemPrompt?: string;
    maxTurns?: number; // default: 20
    signal?: AbortSignal;
  }
  ```
- `ClaudeProgress` — eventos de progresso pro frontend:
  ```ts
  type ClaudeProgress =
    | { type: "status"; message: string } // "Reading files...", "Analyzing..."
    | { type: "tool"; tool: string; input: any } // tool use em andamento
    | { type: "text"; content: string }; // texto parcial do Claude
  ```
- Implementação:
  - Chama `query()` do Agent SDK com:
    - `cwd`: do config
    - `allowedTools: ["Read", "Glob", "Grep"]` — read-only
    - `disallowedTools: ["Bash", "Edit", "Write"]` — bloqueia escrita
    - `permissionMode: "dontAsk"` — nega tudo não pré-aprovado
    - `systemPrompt: config.systemPrompt` — system prompt custom enxuto (sem preset claude_code pra não gastar tokens com instruções irrelevantes)
    - `maxTurns` do config
    - `abortController` interno, exposto via `abort()`
    - `persistSession: false` — análise é efêmera, sem poluir sessions do usuário
  - Internamente, itera o async generator do `query()`:
    - Emite `ClaudeProgress` pra cada tool use / texto parcial no `progress` iterable
    - Resolve `result` promise quando recebe `message.type === "result"`
  - **Quando `schema` é fornecido:**
    - Adiciona `outputFormat: { type: "json_schema", schema: z.toJSONSchema(schema) }`
    - No resultado: valida `message.structured_output` com `schema.safeParse()`
    - Se safeParse falhar (schema do SDK aceitou mas Zod rejeitou — edge case): lança erro com detalhes do Zod
    - Retry de JSON é responsabilidade do SDK (`error_max_structured_output_retries`) — não fazemos retry manual
    - Return: objeto tipado `T`
  - **Quando `schema` não é fornecido:**
    - Sem `outputFormat`
    - Return: `message.result` como string

### CP-02: Handler com streaming via WS

- Os handlers (`projects.analyze`, `tasks.suggest`, `tasks.regenerate`) fazem streaming do progresso pro frontend
- Padrão:
  1. Handler recebe request, gera `requestId` (UUID), retorna `{ requestId }` imediatamente
  2. Chama `runClaude()`, itera `run.progress`, faz `push("claude:progress", ...)` pra cada evento
  3. Awaita `run.result`, faz `push("claude:result", ...)`
  4. Se erro: faz `push("claude:error", ...)`
- Push events:
  - `claude:progress` — `{ requestId: string, progress: ClaudeProgress }`
  - `claude:result` — `{ requestId: string, result: any }`
  - `claude:error` — `{ requestId: string, error: string }`
- Frontend: subscriba nos push events, filtra por `requestId`
- Cancel: novo método WS `claude.cancel` com `{ requestId }` — chama `run.abort()` no map de runs ativos

---

## Projeto

### CP-03: Novo fluxo do CreateProjectDialog

**Step 1 — Nome + Descrição**

- **Name** (input text): nome do projeto
- **Slug** (derivado automaticamente do nome: lowercase + hifens, read-only)
- **"Describe your project"** (textarea): texto livre descrevendo o projeto, stack, objetivo
- Next →

**Step 2 — Add Repos**

- Mesmo fluxo atual: URL git, pasta local, ou vazio
- Pode adicionar múltiplos repos
- Botão "Create" (a criação começa aqui)

**Step 3 — Criação + Análise (automático)**

- Sequência automática com rollback:
  1. Cria diretório do projeto + clona repos em `default/`
  2. Se clone falhar: limpa filesystem, mostra erro, NÃO insere no DB
  3. Insere projeto no DB (só após clone OK)
  4. Chama `projects.analyze` com descrição do usuário
- Loading com progresso real via streaming: "Reading package.json...", "Analyzing src/...", etc.
- Ao terminar análise: mostra preview do PROJECT.md num textarea editável
- Botões: "Save & Finish" (salva PROJECT.md via `prompts.write`, fecha dialog) e "Re-generate"

**Fallback análise**: Se Claude falhar (timeout, erro, abort), mostrar mensagem de erro mas manter projeto criado (clone + DB já OK). Salvar PROJECT.md vazio. Botão "Regenerar" disponível no workspace depois.

### CP-04: Handler projects.analyze

- Novo método WS `projects.analyze`: params `{ projectId: string, description: string }`
- Salvar `description` no DB do projeto (`projects.description`) pra reusar em regenerações futuras
- Fluxo:
  1. Resolve projeto e repos em `default/`
  2. Monta systemPrompt enxuto:

     ```
     O usuário descreveu este projeto como: "{description}"

     Você tem acesso read-only aos repositórios do projeto.
     ```

  3. Monta prompt: "Analise os repositórios deste projeto e gere um PROJECT.md completo com: visão geral, stack tecnológica, estrutura de diretórios, convenções identificadas, e instruções para novos desenvolvedores. Retorne apenas o conteúdo markdown."
  4. Chama `runClaude({ cwd: defaultDir, prompt, systemPrompt })`
  5. Faz push de `claude:progress` pra cada evento
  6. Retorna `{ content: string }` via `claude:result`

---

## Task

### CP-05: Handler tasks.suggest — Claude gera tudo a partir de texto livre

- Novo método WS `tasks.suggest`: params `{ projectId: string, userGoal: string }`
- Schema Zod com `.describe()` — fonte de verdade pra prompt + validação + tipo:
  ```ts
  const TaskSuggestionSchema = z.object({
    name: z.string().min(1).describe("nome curto e descritivo da task"),
    description: z.string().min(1).describe("descrição concisa do objetivo"),
    branches: z
      .record(z.string().min(1))
      .describe(
        "mapa repoName → branchName, seguindo o padrão de nomenclatura de branches existente em cada repo",
      ),
    taskMd: z
      .string()
      .min(1)
      .describe(
        "conteúdo completo do TASK.md com: objetivo, contexto real do código, passos sugeridos com referência a arquivos específicos, riscos",
      ),
  });
  ```
- Fluxo:
  1. Resolve projeto e repos em `default/`
  2. Lê PROJECT.md existente
  3. Para cada repo, lista branches existentes via `git branch -r --list` no `default/{repo}/`
  4. Monta systemPrompt (contexto — separado da instrução):

     ```
     {conteúdo do PROJECT.md}

     Repositórios do projeto:
     - {repo1}: branches existentes: main, develop, feat/auth, feat/payments, fix/login-bug, ...
     - {repo2}: branches existentes: main, feature/PROJ-123-setup, feature/PROJ-124-api, ...

     Você tem acesso read-only aos repositórios do projeto.
     ```

  5. Monta prompt (instrução):

     ```
     O usuário quer trabalhar em: "{userGoal}"

     Explore o código do projeto para entender a arquitetura e o contexto necessário.
     Analise o padrão de nomenclatura de branches de CADA repo e crie nomes que sigam
     o padrão existente. Branches podem ter nomes DIFERENTES entre repos.
     Gere um TASK.md detalhado com contexto real do código — arquivos, funções, patterns.
     ```

  6. Chama `runClaude({ cwd: defaultDir, prompt, systemPrompt }, TaskSuggestionSchema)`
     - Structured output via `outputFormat` + validação Zod no final
  7. Faz push de `claude:progress` pra cada evento
  8. Retorna objeto tipado via `claude:result`

### CP-06: Novo fluxo do CreateTaskDialog

O dialog muda completamente:

**Step 1 — Input livre**

- Campo único de texto: "What are you working on?"
- Placeholder: "ex: implementar autenticação OAuth com Google"
- Botão "Ask Claude" (ou Enter)

**Step 2 — Loading com progresso real**

- Mostra streaming de progresso: "Reading package.json...", "Analyzing src/components/...", etc.
- Subscribe em `claude:progress` com requestId
- Botão "Cancel" → chama `claude.cancel` com requestId

**Step 3 — Review & Edit**

- Campos pré-preenchidos pelo Claude, todos editáveis:
  - **Name** (input text)
  - **Slug** (derivado do name: lowercase + hifens)
  - **Branches por repo** — um input por repo, mostrando o nome do repo como label:
    - `repo1`: `feat/oauth-google` (editável)
    - `repo2`: `feature/PROJ-125-oauth-google` (editável)
  - **TASK.md** (textarea grande, conteúdo completo)
- Botões: "Create Task" (confirma) e "Re-generate" (volta pro step 2 com mesmo input)

**Step 4 — Criação**

- Chama `tasks.create` com os campos confirmados (name, slug, branches por repo)
- Após criar, escreve TASK.md via `prompts.write` com o conteúdo do textarea
- Fecha dialog

**Fallback**: Se Claude falhar (timeout, erro), mostrar mensagem e oferecer criação manual (campos vazios editáveis).

### CP-07: Mudança no createTask — branches por repo

- Hoje `createTask` recebe `branch: string` e usa a mesma branch pra todos os repos
- Mudar pra aceitar `branches: Record<string, string>` — mapa de repoName → branchName
- Cada worktree é criada com a branch correspondente ao repo
- Fallback: se um repo não tiver branch especificada, usar `feat/{slug}`
- Atualizar contracts, handler, e service

---

## Regenerar no workspace

### CP-08: Regenerar disponível nos workspaces

**ProjectRootWorkspace:**

- Botão "Regenerar PROJECT.md com Claude"
- Chama `projects.analyze` com `description` do DB (salvo na criação via CP-04)
- Loading com progresso real
- Mostra preview editável → salvar/descartar

**TaskWorkspace (TaskDetailView):**

- Botão "Regenerar TASK.md com Claude"
- Chama `tasks.regenerate`: params `{ taskId: string }`
- Fluxo do handler:
  1. Resolve task, projeto
  2. `cwd`: diretório da task (worktrees, não `default/`)
  3. `systemPrompt`: PROJECT.md + contexto da task (adaptar `buildSystemPrompt()`)
  4. `prompt`: "Analise o estado atual do código nas worktrees desta task e regenere o TASK.md com: objetivo, contexto atualizado, próximos passos, arquivos relevantes."
  5. Chama `runClaude({ cwd: taskDir, systemPrompt, prompt })`
  6. Push de progresso + retorna `{ content: string }`
- Loading com progresso real
- Mostra preview editável → salvar/descartar

---

## Dependência

### CP-09: Instalar @anthropic-ai/claude-agent-sdk

- Adicionar ao `apps/server/package.json`: `@anthropic-ai/claude-agent-sdk`
- O SDK spawna Claude Code — não precisa de API key, usa auth do CLI do usuário
- Pré-requisito: Claude Code instalado e autenticado na máquina

### CP-10: Adicionar coluna description na tabela projects

- Adicionar `description TEXT` na tabela `projects` (Drizzle migration)
- Populado no create project (CP-03 step 1)
- Usado no regenerar PROJECT.md (CP-08) pra manter contexto

---

## Detecção de PROJECT.md / TASK.md vazios

### CP-11: Prompt automático pra gerar quando ausente ou vazio

**ProjectRootWorkspace:**

- Ao abrir, checar se PROJECT.md não existe ou está vazio (< 10 chars)
- Se sim: mostrar banner inline "PROJECT.md está vazio. Gerar com Claude?" com botão "Generate"
- Click no botão: chama `projects.analyze` com `description` do DB (ou vazia se não tem)
- Mesmo fluxo de progresso + preview editável do CP-08

**TaskWorkspace (TaskDetailView):**

- Ao abrir, checar se TASK.md não existe ou está vazio (< 10 chars)
- Se sim: mostrar banner inline "TASK.md está vazio. Gerar com Claude?" com botão "Generate"
- Click no botão: chama `tasks.regenerate` com taskId
- Mesmo fluxo de progresso + preview editável do CP-08

**Novo método WS `prompts.check`:**

- Params: `{ filePath: string }`
- Retorna: `{ exists: boolean, empty: boolean }`
- Reusar no frontend pra decidir se mostra o banner

---

## Fora de Escopo

- Escolha de modelo (usa o default do Claude Code do usuário)
- Edição do prompt de análise pelo usuário
- Sugestão de repos (usuário sempre adiciona manualmente)
- Multi-turn / interatividade durante análise (v1 é single prompt)

## Arquivos

| Arquivo                                            | Mudança                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/server/package.json`                         | Adicionar `@anthropic-ai/claude-agent-sdk`                                   |
| `apps/server/src/services/claude-runner.ts`        | **Novo** — `runClaude()` com overloads, `ClaudeRun`, streaming, Zod          |
| `apps/server/src/handlers/projects.ts`             | Adicionar `projects.analyze`                                                 |
| `apps/server/src/handlers/tasks.ts`                | Adicionar `tasks.suggest`, `tasks.regenerate`, `claude.cancel`               |
| `apps/server/src/services/tasks.ts`                | `createTask` aceita `branches: Record<string, string>`                       |
| `apps/server/src/db/schema.ts`                     | Adicionar `description` na tabela `projects`                                 |
| `packages/contracts/src/ws.ts`                     | Adicionar métodos + push events `claude:*` + atualizar `tasks.create` params |
| `apps/web/src/hooks/useClaudeProgress.ts`          | **Novo** — hook pra consumir push events de progresso por requestId          |
| `apps/web/src/components/CreateProjectDialog.tsx`  | **Reescrever** — novo fluxo com análise + progresso                          |
| `apps/web/src/components/CreateTaskDialog.tsx`     | **Reescrever** — novo fluxo texto livre → Claude sugere → confirma           |
| `apps/web/src/components/ProjectRootWorkspace.tsx` | Botão regenerar PROJECT.md                                                   |
| `apps/web/src/components/TaskWorkspace.tsx`        | Botão regenerar TASK.md                                                      |
