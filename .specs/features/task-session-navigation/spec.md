# Task Session Navigation

## Contexto

Atualmente, ao selecionar uma task na sidebar, o `TaskWorkspace` renderiza imediatamente um `TerminalView` que auto-cria uma nova sessão Claude. O componente `SessionList` existe mas não é usado. O usuário não tem visibilidade sobre sessões anteriores nem controle sobre qual sessão abrir.

## Requisitos

### R1 — Tela de Sessões da Task

Quando o usuário seleciona uma task na sidebar, deve ver uma **tela de detalhes da task com lista de sessões** em vez de ir direto ao terminal:

- R1.1: Exibir info da task — nome, descrição (se houver), branch, status, data de criação
- R1.2: Exibir cards de repos com status (branch, clean/dirty, ahead/behind) — reusar padrão do `ProjectView`
- R1.3: Exibir lista de sessões (data, contagem de mensagens)
- R1.4: Permitir clicar em uma sessão para abrir o Claude com aquela sessão (resume)
- R1.5: Ter um botão "Nova Sessão" para criar uma sessão nova
- R1.6: Manter o header atual da task (nome do projeto, nome da task, branch, status, botões Complete/Delete)

### R2 — Tela do Terminal com Navegação de Volta

Após selecionar ou criar uma sessão, o usuário deve ver o terminal Claude:

- R2.1: Exibir um botão de **chevron esquerdo** (←) no header para voltar à lista de sessões
- R2.2: Ao voltar, destruir o terminal ativo e mostrar a lista de sessões novamente
- R2.3: Manter as informações da task no header (projeto, task, branch, status)

### R3 — Fluxo de Navegação

```
Sidebar (click task) → Detalhes Task + Sessões → [click sessão ou "Nova"] → Terminal Claude
                              ↑                                                     │
                              └──────────── chevron ← (voltar) ────────────────────┘
```

## Não-Requisitos

- Não alterar a sidebar ou o sistema de seleção de tasks
- Não adicionar rotas novas (manter tudo na rota `/`)
- Não alterar o backend/server — APIs já existem

## Componentes Impactados

- `TaskWorkspace.tsx` — adicionar estado de view (sessions | terminal), orquestrar navegação
- `SessionList.tsx` — já existe, pode precisar de ajustes visuais para encaixar no layout
- `TerminalView.tsx` — aceitar `resumeSessionId` opcional (não auto-criar terminal)
- `useTerminal.ts` — sem mudanças (já suporta `resumeSessionId`)
