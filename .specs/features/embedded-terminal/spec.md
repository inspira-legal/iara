# Terminal Embutido

## Contexto

Atualmente, ao clicar "Launch Claude" no TaskWorkspace, o app detecta o terminal nativo do SO (Ghostty, iTerm, etc.) e faz spawn externo do `claude` CLI. O usuário precisa alternar entre janelas.

A mudança: ao selecionar uma task, renderizar um terminal embutido dentro do app com o Claude rodando dentro dele. Zero alternância de janelas.

## Requisitos

### REQ-01: Terminal PTY no main process

- Usar `node-pty` para criar pseudo-terminal no main process
- Spawn do `claude` CLI com os mesmos args/env que o launcher atual
- Streaming bidirecional de dados (stdin/stdout) via IPC para o renderer
- Suporte a resize (SIGWINCH) quando o terminal muda de tamanho
- Cleanup do PTY ao sair da task, fechar app, ou completar task
- Crossplatform: macOS, Linux, Windows

### REQ-02: Terminal xterm.js no renderer

- Renderizar terminal usando `@xterm/xterm` com addon fit e webgl
- O terminal aparece automaticamente quando uma task ativa é selecionada
- Streaming de dados do PTY via IPC (main → renderer para output, renderer → main para input)
- Auto-fit ao container (resize responsivo)
- Theme consistente com o app (dark theme padrão)
- Focus automático no terminal ao selecionar task

### REQ-03: Lifecycle do terminal

- **Criar**: ao selecionar task ativa, iniciar PTY + terminal se não existe
- **Persistir**: manter PTY vivo ao navegar entre tasks (múltiplos terminais simultâneos)
- **Destruir**: cleanup ao completar/deletar task, ou ao fechar app
- **Reconectar**: ao voltar para uma task que já tem PTY rodando, reconectar ao terminal existente (sem perder histórico de output)
- **Sessão**: integrar com --resume do Claude (ao reiniciar PTY, retomar sessão)

### REQ-04: UI do TaskWorkspace

- Remover botão "Launch Claude" — terminal é o default
- Layout: header com info da task (nome, branch, status) + terminal ocupa o resto do espaço
- Barra de ações: Complete Task, Delete Task, Restart Claude (mata PTY + reinicia com --resume)
- Session list continua acessível (dropdown ou seção colapsável)
- Terminal redimensiona com a janela

### REQ-05: IPC Bridge

Novos métodos no DesktopBridge:

```typescript
// Terminal
terminalCreate(taskId: string, resumeSessionId?: string): Promise<{ terminalId: string; sessionId: string }>;
terminalWrite(terminalId: string, data: string): Promise<void>;
terminalResize(terminalId: string, cols: number, rows: number): Promise<void>;
terminalDestroy(terminalId: string): Promise<void>;

// Eventos (main → renderer via IPC send, não invoke)
// "terminal:data" → { terminalId: string; data: string }
// "terminal:exit" → { terminalId: string; exitCode: number }
```

### REQ-06: Compatibilidade

- `node-pty` é módulo nativo — requer `@electron/rebuild`
- Manter o launcher externo como fallback (config ou caso node-pty falhe)
- Env vars (IARA_DESKTOP_SOCKET, IARA_SESSION_ID, etc.) continuam sendo injetadas
- Plugin-dir, hooks, e socket server continuam funcionando normalmente

## Fora do escopo

- Split panes (múltiplos terminais visíveis ao mesmo tempo)
- Tabs de terminal (um terminal por task é suficiente)
- Terminal genérico (bash/zsh sem Claude) — apenas Claude Code
- Customização de fonte/tema do terminal (herda do app)
- Search/find no terminal

## Dependências novas

| Package              | Onde                  | Motivo                         |
| -------------------- | --------------------- | ------------------------------ |
| `node-pty`           | apps/desktop          | PTY spawn crossplatform        |
| `@xterm/xterm`       | apps/web              | Terminal renderer              |
| `@xterm/addon-fit`   | apps/web              | Auto-resize                    |
| `@xterm/addon-webgl` | apps/web              | GPU-accelerated rendering      |
| `@electron/rebuild`  | apps/desktop (devDep) | Rebuild node-pty para Electron |

## Arquivos impactados

### Contracts (packages/contracts)

- `src/ipc.ts` — novos métodos terminal\* no DesktopBridge

### Main process (apps/desktop)

- `src/services/terminal.ts` — NOVO: TerminalManager (cria/gerencia PTYs)
- `src/ipc/terminal.ts` — NOVO: handlers IPC para terminal
- `src/ipc/register.ts` — registrar novos handlers
- `src/main.ts` — cleanup de terminais ao fechar
- `src/services/launcher.ts` — manter como fallback, extrair buildClaudeArgs/buildSystemPrompt

### Renderer (apps/web)

- `src/components/TerminalView.tsx` — NOVO: wrapper xterm.js
- `src/components/TaskWorkspace.tsx` — remover "Launch Claude", integrar TerminalView
- `src/hooks/useTerminal.ts` — NOVO: hook para lifecycle do terminal
- `src/stores/useTerminalStore.ts` — NOVO: state dos terminais ativos

### Build

- `apps/desktop/package.json` — adicionar node-pty, @electron/rebuild
- `apps/web/package.json` — adicionar @xterm/xterm, addons
