# Tasks: Terminal Embutido

## Dependências entre tasks

```
T1 (contracts) ──→ T3 (preload)
                ──→ T4 (IPC handlers)
T2 (node-pty)  ──→ T4 (IPC handlers)
                ──→ T5 (TerminalManager)
T3 + T5        ──→ T6 (TerminalView)
T6             ──→ T7 (TaskWorkspace)
T7             ──→ T8 (cleanup + testes)
```

**Parallelismo possível:**

- T1 + T2 em paralelo (contracts + dependências)
- T3 + T4 + T5 em paralelo (após T1 e T2)
- T6 após T3 + T5
- T7 após T6

---

## T1 — Contracts: tipos e IPC do terminal

**Pacote:** `packages/contracts`

**Mudanças:**

- `src/ipc.ts`: adicionar métodos terminal\* e event listeners ao DesktopBridge

```typescript
// Métodos request/response
terminalCreate(taskId: string, resumeSessionId?: string): Promise<{ terminalId: string; sessionId: string }>;
terminalWrite(terminalId: string, data: string): Promise<void>;
terminalResize(terminalId: string, cols: number, rows: number): Promise<void>;
terminalDestroy(terminalId: string): Promise<void>;

// Event listeners
onTerminalData(callback: (terminalId: string, data: string) => void): void;
offTerminalData(callback: (terminalId: string, data: string) => void): void;
onTerminalExit(callback: (terminalId: string, exitCode: number) => void): void;
offTerminalExit(callback: (terminalId: string, exitCode: number) => void): void;
```

**Verificação:** `bun typecheck` passa.

---

## T2 — Dependências: node-pty + xterm.js

**Pacotes:**

- `apps/desktop/package.json`: adicionar `node-pty`, `@electron/rebuild` (devDep)
- `apps/web/package.json`: adicionar `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`
- Script postinstall: `electron-rebuild` para compilar node-pty

**Mudanças:**

- `apps/desktop/package.json`: deps + postinstall script
- `apps/web/package.json`: deps
- Root: `bun install`

**Verificação:** `bun install` sem erros. `node -e "require('node-pty')"` funciona (no contexto do Electron).

---

## T3 — Preload: bridge do terminal

**Pacote:** `apps/desktop`

**Mudanças em:** `src/preload.ts`

Adicionar os 4 métodos invoke + 4 métodos de event listener:

```typescript
// Terminal (invoke)
terminalCreate: (taskId, resumeSessionId?) => ipcRenderer.invoke("desktop:terminal-create", taskId, resumeSessionId),
terminalWrite: (terminalId, data) => ipcRenderer.invoke("desktop:terminal-write", terminalId, data),
terminalResize: (terminalId, cols, rows) => ipcRenderer.invoke("desktop:terminal-resize", terminalId, cols, rows),
terminalDestroy: (terminalId) => ipcRenderer.invoke("desktop:terminal-destroy", terminalId),

// Terminal events (on/off)
onTerminalData: (cb) => { ipcRenderer.on("terminal:data", (_e, terminalId, data) => cb(terminalId, data)); },
offTerminalData: (cb) => { ipcRenderer.removeAllListeners("terminal:data"); },
onTerminalExit: (cb) => { ipcRenderer.on("terminal:exit", (_e, terminalId, exitCode) => cb(terminalId, exitCode)); },
offTerminalExit: (cb) => { ipcRenderer.removeAllListeners("terminal:exit"); },
```

**Mudanças em:** `src/ipc/channels.ts` — adicionar constantes TERMINAL\_\*.

**Verificação:** `bun typecheck` passa (preload satisfies DesktopBridge).

---

## T4 — IPC Handlers: terminal

**Pacote:** `apps/desktop`

**Novo arquivo:** `src/ipc/terminal.ts`

```typescript
let getTerminalManager: () => TerminalManager;

export function initTerminalHandlers(getter: () => TerminalManager): void;
export function registerTerminalHandlers(): void;
```

Handlers para os 4 channels: TERMINAL_CREATE, TERMINAL_WRITE, TERMINAL_RESIZE, TERMINAL_DESTROY.

**Mudanças em:**

- `src/ipc/register.ts`: importar e chamar registerTerminalHandlers()
- `src/main.ts`: chamar initTerminalHandlers(() => terminalManager)

**Verificação:** `bun typecheck` passa.

---

## T5 — TerminalManager: gerenciador de PTY

**Pacote:** `apps/desktop`

**Novo arquivo:** `src/services/terminal.ts`

Classe TerminalManager:

- `create(config)` — usa buildClaudeArgs + buildSystemPrompt do launcher.ts, spawn via `pty.spawn("claude", args, { cwd, env, cols, rows })`
- `write(id, data)` — `pty.write(data)`
- `resize(id, cols, rows)` — `pty.resize(cols, rows)`
- `destroy(id)` — `pty.kill()` + remove do map
- `destroyByTaskId(id)` — busca por taskId e destrói
- `destroyAll()` — cleanup geral
- `getByTaskId(id)` — retorna terminal existente

PTY events:

- `pty.onData` → `this.mainWindow.webContents.send("terminal:data", terminalId, data)`
- `pty.onExit` → `this.mainWindow.webContents.send("terminal:exit", terminalId, exitCode)` + cleanup

**Mudanças em:** `src/main.ts` — instanciar TerminalManager, chamar setWindow, destroyAll no before-quit.

**Verificação:** `bun typecheck` passa. Integração com launcher.ts (reutiliza buildClaudeArgs/buildSystemPrompt).

---

## T6 — TerminalView: componente xterm.js

**Pacote:** `apps/web`

**Novo arquivo:** `src/components/TerminalView.tsx`

Componente que:

1. Cria `<div ref={containerRef}>` com flex-1
2. No useEffect:
   - Chama `bridge.terminalCreate(taskId)` ou reconecta se já existe
   - Cria `new Terminal({ theme, fontFamily, fontSize })`
   - Carrega FitAddon + WebglAddon (com fallback canvas)
   - `term.open(containerRef)` + `fitAddon.fit()`
   - Wire listeners: term.onData → bridge.terminalWrite, bridge.onTerminalData → term.write
   - ResizeObserver → fitAddon.fit() + bridge.terminalResize
3. No cleanup (unmount): dispose term + remove IPC listeners (NÃO destroi PTY)
4. Estado: "connecting" | "active" | "exited" — mostrar indicador visual

**Novo arquivo:** `src/hooks/useTerminal.ts`

Hook que encapsula a lógica de lifecycle do terminal (create, restart, destroy, status).

**CSS:** Importar `@xterm/xterm/css/xterm.css` no componente ou no main.tsx.

**Verificação:** Componente renderiza sem erros. Terminal funcional com echo test.

---

## T7 — TaskWorkspace: integração

**Pacote:** `apps/web`

**Mudanças em:** `src/components/TaskWorkspace.tsx`

Antes:

```
Header + Botão "Launch Claude" + SessionList + Repos
```

Depois:

```
Header compacto (task info + ações: Restart, Complete, Delete)
+ TerminalView (flex-1, ocupa todo espaço restante)
```

- Remover prop `onLaunchClaude` — terminal é automático
- Adicionar ação "Restart Claude" (destroy + create com --resume)
- Session list: mover para dropdown ou remover (terminal = session ativa)
- Layout: `flex flex-col h-full` → header fixo + terminal flex-1

**Mudanças em:** `src/routes/index.tsx`

- Remover `handleLaunchClaude` — não precisa mais
- Simplificar props do TaskWorkspace

**Verificação:** Task selecionada mostra terminal. Ações funcionam.

---

## T8 — Cleanup, testes e polimento

**Tarefas:**

1. Cleanup do launcher.ts: manter como fallback, mas tirar do fluxo principal
2. Testes unitários:
   - TerminalManager: create, write, resize, destroy, destroyAll
   - buildClaudeArgs já tem cobertura — manter
3. Fallback: se node-pty não carrega, mostrar botão "Launch Claude (external)" no TaskWorkspace
4. `bun lint` + `bun fmt` + `bun typecheck` + `bun run test` + `bun build:desktop`
5. Verificar que dev servers, browser panel, socket, hooks continuam funcionando

**Verificação:** Build completo passa. Smoke test passa.
