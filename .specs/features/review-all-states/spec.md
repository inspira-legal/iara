# Review All States — Inconsistências de Estado

## Contexto

Os Zustand stores (`projects`, `tasks`, `sidebar`, `devservers`, `notifications`) e vários componentes mantêm estado local (`useState`) que deveria estar sincronizado. Ações que acontecem em um lugar não são refletidas em outros.

## Problemas a Corrigir

### P1. Cache `tasksByProject` não é atualizado nas mutações

**Onde:** `stores/tasks.ts`

O store mantém dois estados paralelos: `tasks[]` (lista ativa) e `tasksByProject` (cache por projeto). As mutações `createTask`, `completeTask` e `deleteTask` atualizam apenas `tasks[]`, ignorando `tasksByProject`.

**Impacto:** A sidebar usa `getTasksForProject()` que lê de `tasksByProject`. Após criar, completar ou deletar uma task, a sidebar não reflete a mudança até um reload completo.

- `createTask` (linha 48-54): adiciona a `tasks[]`, não a `tasksByProject`
- `completeTask` (linha 57-61): atualiza status em `tasks[]`, não em `tasksByProject`
- `deleteTask` (linha 64-77): remove de `tasks[]`, não de `tasksByProject`

---

### P2. `deleteProject` não limpa estado relacionado em outros stores

**Onde:** `stores/projects.ts:61-66`

Ao deletar um projeto:

- **Não limpa tasks:** `tasksByProject` e `tasks[]` mantêm tasks do projeto deletado
- **Não limpa `selectedTaskId`:** se a task selecionada pertencia ao projeto deletado, `selectedTaskId` fica apontando para uma task órfã
- **Não limpa sidebar:** `expandedProjectIds` e `projectOrder` mantêm referências ao projeto deletado

---

### P3. Projeto criado não é expandido automaticamente na sidebar

**Onde:** `CreateProjectDialog.tsx` → `createProject()` → seleciona o projeto, mas `expandedProjectIds` no sidebar store não é atualizado.

**Impacto:** O projeto novo aparece selecionado mas colapsado. O usuário precisa clicar manualmente para expandir.

---

### P4. Seleção de task anula `selectedProjectId`

**Onde:** `ProjectTree.tsx:214-216`

```tsx
onSelectTask={(id) => {
  selectProject(null);  // ← anula o projeto selecionado
  selectTask(id);
}}
```

Quando uma task é selecionada, `selectedProjectId` vira `null`. A `HomePage` (index.tsx:22-24) contorna isso derivando o projeto via `task.projectId`, mas qualquer outro consumidor de `selectedProjectId` perde a referência.

**Impacto:** `Sidebar.tsx:36-43` depende de `selectedProjectId` para descobrir dev commands. Se o projeto é null, os commands não são descobertos quando uma task está selecionada.

---

### P7. Sessions: lista não atualiza ao criar sessão no terminal

**Onde:** `SessionList.tsx:11-12`

Cada instância de `SessionList` faz sua própria request e guarda em `useState` local. Os arquivos do Claude são a fonte da verdade — quando uma sessão é criada lá, a lista deveria atualizar.

**Solução:** Mover para Zustand para que a criação de terminal invalide/recarregue a lista.

---

### P8. Estado do terminal se perde ao navegar entre views

**Onde:** `hooks/useTerminal.ts` + `TaskWorkspace.tsx`

O estado do terminal (terminalId, sessionId, status) é `useState` local. Se o usuário seleciona outra task e volta, o terminal precisa ser recriado. O estado deveria persistir por task — só resetar quando o usuário explicitamente clica na seta pra voltar à lista de sessões.

**Solução:** Mover para Zustand, indexado por taskId.

---

## Descartados

- ~~P5. Feedback inconsistente (toasts)~~ — ignorar
- ~~P6. repoInfo duplicado~~ — não é duplicação: `ProjectView` mostra estado de `.repos` (originais), `TaskWorkspace` mostra estado das worktrees

---

## Priorização

| #   | Severidade                           | Esforço |
| --- | ------------------------------------ | ------- |
| P1  | Alta — quebra visual da sidebar      | Baixo   |
| P2  | Alta — estado órfão causa bugs       | Médio   |
| P4  | Média — dev commands não funcionam   | Baixo   |
| P3  | Baixa — UX menor                     | Baixo   |
| P7  | Média — sessões não atualizam        | Médio   |
| P8  | Média — terminal se perde ao navegar | Médio   |
