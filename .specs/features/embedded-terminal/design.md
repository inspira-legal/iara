# Design: Terminal Embutido

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                     Renderer (web)                       │
│                                                          │
│  ┌──────────────┐   ┌─────────────────────────────────┐ │
│  │   Sidebar     │   │        TaskWorkspace             │ │
│  │               │   │  ┌───────────────────────────┐  │ │
│  │  Projects     │   │  │ Header (task info + ações) │  │ │
│  │  Tasks ←──────┼───┤  ├───────────────────────────┤  │ │
│  │  Dev Servers  │   │  │                           │  │ │
│  │               │   │  │   TerminalView (xterm.js) │  │ │
│  │               │   │  │                           │  │ │
│  │               │   │  │   IPC: terminal:data ←──────────── PTY stdout
│  │               │   │  │   IPC: terminal:write ──────────→ PTY stdin
│  │               │   │  │   IPC: terminal:resize ─────────→ PTY resize
│  │               │   │  │                           │  │ │
│  │               │   │  └───────────────────────────┘  │ │
│  └──────────────┘   └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                              │
                     IPC (contextBridge)
                              │
┌─────────────────────────────────────────────────────────┐
│                   Main Process (desktop)                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              TerminalManager (singleton)             │ │
│  │                                                      │ │
│  │  Map<terminalId, { pty, taskId, sessionId }>        │ │
│  │                                                      │ │
│  │  create(taskId) → spawn node-pty com claude args     │ │
│  │  write(id, data) → pty.write(data)                   │ │
│  │  resize(id, cols, rows) → pty.resize(cols, rows)     │ │
│  │  destroy(id) → pty.kill() + cleanup                  │ │
│  │                                                      │ │
│  │  pty.onData → webContents.send("terminal:data")      │ │
│  │  pty.onExit → webContents.send("terminal:exit")      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Componentes

### 1. TerminalManager (main process)

**Arquivo:** `apps/desktop/src/services/terminal.ts`

Singleton que gerencia instâncias de PTY. Cada terminal é associado a um taskId.

```typescript
interface ManagedTerminal {
  id: string; // UUID
  taskId: string;
  sessionId: string;
  pty: IPty; // node-pty instance
}

class TerminalManager {
  private terminals: Map<string, ManagedTerminal>;
  private mainWindow: BrowserWindow | null;

  setWindow(win: BrowserWindow): void;
  create(config: TerminalCreateConfig): { terminalId: string; sessionId: string };
  write(terminalId: string, data: string): void;
  resize(terminalId: string, cols: number, rows: number): void;
  destroy(terminalId: string): void;
  destroyByTaskId(taskId: string): void;
  destroyAll(): void;
  getByTaskId(taskId: string): ManagedTerminal | undefined;
}
```

**Decisões:**

- Um terminal por task (não por sessão). Se já existe terminal para a task, retorna o existente.
- PTY spawn usa `claude` CLI com mesmos args do launcher atual (buildClaudeArgs + buildSystemPrompt).
- `pty.onData` envia para renderer via `webContents.send("terminal:data", { terminalId, data })`.
- `pty.onExit` envia `webContents.send("terminal:exit", { terminalId, exitCode })` e limpa do map.
- Shell padrão: spawn direto do `claude` (não precisa de bash wrapper).

### 2. IPC Handlers (main process)

**Arquivo:** `apps/desktop/src/ipc/terminal.ts`

Handlers para os 4 métodos + init que recebe referência ao TerminalManager.

```typescript
registerTerminalHandlers():
  TERMINAL_CREATE → terminalManager.create(config)
  TERMINAL_WRITE  → terminalManager.write(id, data)
  TERMINAL_RESIZE → terminalManager.resize(id, cols, rows)
  TERMINAL_DESTROY → terminalManager.destroy(id)
```

**IPC events (main → renderer):**

- `terminal:data` — output do PTY (alta frequência, usar `webContents.send`)
- `terminal:exit` — terminal encerrou

### 3. Preload Bridge

**Mudanças em:** `apps/desktop/src/preload.ts`

Adicionar métodos de terminal + listeners para eventos.

```typescript
// Request/response (invoke)
terminalCreate(taskId, resumeSessionId?) → ipcRenderer.invoke(...)
terminalWrite(terminalId, data) → ipcRenderer.invoke(...)
terminalResize(terminalId, cols, rows) → ipcRenderer.invoke(...)
terminalDestroy(terminalId) → ipcRenderer.invoke(...)

// Event listeners (on/off)
onTerminalData(callback: (terminalId, data) => void) → ipcRenderer.on(...)
offTerminalData(callback) → ipcRenderer.removeListener(...)
onTerminalExit(callback: (terminalId, exitCode) => void) → ipcRenderer.on(...)
offTerminalExit(callback) → ipcRenderer.removeListener(...)
```

### 4. TerminalView (renderer)

**Arquivo:** `apps/web/src/components/TerminalView.tsx`

Componente React que wrapa xterm.js. Lifecycle:

```
mount → containerRef criado
  → se taskId tem terminal ativo: reconectar (attach listeners)
  → se não: chamar terminalCreate(taskId)
  → inicializar xterm.Terminal + FitAddon + WebglAddon
  → term.onData → bridge.terminalWrite(id, data)   // input do user
  → bridge.onTerminalData → term.write(data)         // output do PTY
  → bridge.onTerminalExit → mostrar mensagem + oferecer restart
  → ResizeObserver no container → bridge.terminalResize(id, cols, rows)

unmount → NÃO destrói PTY (persiste entre navegações)
  → remove listeners de IPC
  → dispose xterm.Terminal instance
```

**Props:**

```typescript
interface TerminalViewProps {
  taskId: string;
  resumeSessionId?: string;
}
```

### 5. useTerminal hook (renderer)

**Arquivo:** `apps/web/src/hooks/useTerminal.ts`

Hook que gerencia o estado do terminal para uma task.

```typescript
function useTerminal(taskId: string) {
  // State
  terminalId: string | null
  sessionId: string | null
  status: "connecting" | "active" | "exited"
  exitCode: number | null

  // Actions
  create(resumeSessionId?: string): Promise<void>
  restart(): Promise<void>  // destroy + create com --resume
  destroy(): Promise<void>
}
```

### 6. Mudanças no TaskWorkspace

**Arquivo:** `apps/web/src/components/TaskWorkspace.tsx`

Antes:

```
Header → Botão "Launch Claude" → Lista de sessions
```

Depois:

```
Header compacto (task info + ações inline) → TerminalView (flex-1)
```

- Remover botão "Launch Claude"
- Adicionar ação "Restart Claude" (destroy + create com --resume)
- Session list vira dropdown no header (ou é removida — terminal É a session)
- Terminal ocupa todo espaço disponível (flex-1, overflow hidden)

### 7. Contracts

**Mudanças em:** `packages/contracts/src/ipc.ts`

```typescript
// Adicionar ao DesktopBridge
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

## Fluxo de dados

### Selecionar task → Terminal aparece

```
1. User clica na task na Sidebar
2. useTaskStore.selectTask(taskId) → selectedTaskId muda
3. HomePage re-render → TaskWorkspace com task selecionada
4. TaskWorkspace monta TerminalView
5. TerminalView.useEffect:
   a. Chama bridge.terminalCreate(taskId)
   b. Main process:
      - Checa se já existe terminal para taskId → retorna existente
      - Ou: resolve task/project dirs, build args, spawn node-pty
      - Registra pty.onData/onExit listeners
      - Retorna { terminalId, sessionId }
   c. Renderer:
      - Inicializa xterm.Terminal no containerRef
      - Registra bridge.onTerminalData listener → term.write(data)
      - Registra term.onData listener → bridge.terminalWrite(id, data)
      - Fit ao container
```

### User digita no terminal

```
1. Keypress no xterm.js
2. term.onData(data) callback
3. bridge.terminalWrite(terminalId, data)
4. IPC → main process
5. pty.write(data) → stdin do claude
```

### Claude produz output

```
1. claude escreve no stdout
2. pty.onData(data) callback no main process
3. webContents.send("terminal:data", { terminalId, data })
4. IPC → renderer
5. bridge.onTerminalData callback
6. term.write(data) → xterm.js renderiza
```

## Considerações

### Performance

- `pty.onData` pode ser alta frequência — não fazer throttle/debounce, xterm.js já buffered.
- Usar WebGL addon para rendering GPU-accelerated.
- IPC com `webContents.send` (fire-and-forget) para data events, não `invoke`.

### node-pty + Electron

- Módulo nativo C++ — requer `@electron/rebuild` no postinstall.
- Em dev: `bun rebuild` pode não funcionar, usar `npx electron-rebuild`.
- Em prod: electron-builder empacota nativos automaticamente se configurado.

### Sandbox

- Preload atual usa `sandbox: true`. `node-pty` roda no main process (não afetado).
- Comunicação via IPC padrão — sem mudança no modelo de segurança.

### Fallback

- Se `node-pty` não carregar (build nativo falhou), fallback para launcher externo.
- Feature flag: `import("node-pty").catch(() => null)` — se null, usa launcher antigo.
