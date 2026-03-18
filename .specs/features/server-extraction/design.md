# Server Extraction — Design

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│ apps/desktop (Electron shell)                   │
│  ┌──────────┐  ┌───────────┐  ┌─────────────┐  │
│  │ bootstrap │  │ browser   │  │ native      │  │
│  │ (spawn   │  │ panel     │  │ dialogs     │  │
│  │  server)  │  │ (WebView) │  │ (pick/conf) │  │
│  └────┬─────┘  └───────────┘  └─────────────┘  │
│       │                                          │
│  preload: expõe wsUrl + bridge pra dialogs/panel │
└───────┼──────────────────────────────────────────┘
        │ spawn (ELECTRON_RUN_AS_NODE=1)
        ▼
┌───────────────────────────────────────────────────────┐
│ apps/server (Node.js standalone)                      │
│  ┌──────────┐  ┌───────────┐  ┌─────────────┐        │
│  │ ws server │  │ services  │  │ SQLite      │        │
│  │ (ws pkg) │  │ (projects,│  │ (better-    │        │
│  │          │  │  tasks,   │  │  sqlite3 +  │        │
│  │ routes → │──│  repos,   │──│  drizzle)   │        │
│  │ handlers │  │  launcher,│  │             │        │
│  │          │  │  terminal,│  └─────────────┘        │
│  │ push ←── │──│  dev, env)│                          │
│  └──────────┘  └───────────┘  ┌─────────────┐        │
│                                │ unix socket │        │
│                                │ (hooks do   │        │
│                                │  Claude)    │        │
│                                └─────────────┘        │
└───────────────────────────────────────────────────────┘
        ▲
        │ ws://127.0.0.1:{port}/?token={token}
        │
┌───────┴──────────────────────────────────────────┐
│ apps/web (React SPA)                             │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ WsTransport  │  │ stores (zustand)         │  │
│  │ request()    │──│ useProjectStore          │  │
│  │ subscribe()  │  │ useTaskStore             │  │
│  └──────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────┘

packages/contracts — tipos WsMethods, WsPushEvents, envelopes
```

## Componentes

### 1. `packages/contracts` — Protocolo WS

Adicionar `src/ws.ts` com:

- `WsMethods` — mapa method → params/result
- `WsPushEvents` — mapa event → payload
- Envelopes: `WsRequest`, `WsResponse`, `WsPush`
- Re-exportar tipos de dados existentes (Project, Task, etc)

### 2. `apps/server` — Servidor standalone

**Entry point:** `src/main.ts`

- Parse args/env (port, auth token, state dir)
- Init SQLite + migrations
- Init serviços
- Start HTTP + WebSocket server
- Graceful shutdown (SIGTERM/SIGINT)

**WebSocket server:** `src/ws.ts`

- `http.createServer()` para static files (web build) + upgrade
- Static files path: `--web-dir` flag, ou `../web/dist` relativo ao server entry
- `ws.WebSocketServer({ noServer: true })`
- Auth no upgrade (token via query string)
- Router: `method` → handler tipado
- Push broadcast para clients conectados
- Heartbeat/ping para detectar clients mortos

**Socket server:** `src/socket.ts`

- Migrado do desktop — Unix socket para hooks do Claude
- Path: `/tmp/iara-server-<uid>.sock`
- Recebe `status.tool-complete`, `status.session-end`, `dev.*`, `notify`
- Repassa eventos relevantes como WS push para clients
- `browser.*` NÃO passa pelo socket — browser panel é Electron-only, controlado via IPC local no desktop

**Router:** `src/router.ts`

- `registerMethod(method, handler)` — type-safe
- Dispatch: parse message → find handler → execute → respond
- Error handling com códigos tipados

**Services:** mover de `apps/desktop/src/services/` → `apps/server/src/services/`

- `projects.ts`, `tasks.ts`, `repos.ts` — sem mudanças
- `sessions.ts`, `env.ts`, `launcher.ts` — sem mudanças
- `terminal.ts` — adaptar: em vez de emitir IPC, emitir push WS
- `devservers.ts` — adaptar: push events via WS
- `notifications.ts` — adaptar: push via WS
- `hooks.ts` — atualizar socket path para `/tmp/iara-server-<uid>.sock`
- `plugins.ts` — atualizar path do bridge e socket
- `config.ts`, `shell-env.ts` — sem mudanças

**DB:** mover de `apps/desktop/src/db*` → `apps/server/src/db*`

- Schema, migrations, init — tudo igual
- Path do DB: `~/.config/iara/iara.db` (ou via `--state-dir`)

**Handlers:** `src/handlers/` — um arquivo por domínio

- `projects.ts` — list, get, create, update, delete, repoInfo, addRepo, fetchRepos
- `tasks.ts` — list, get, create, complete, delete
- `launcher.ts` — launch
- `sessions.ts` — list
- `prompts.ts` — read, write
- `devservers.ts` — start, stop, status, logs, discover
- `env.ts` — read, write, merge
- `git.ts` — status
- `notifications.ts` — list, unreadCount, markRead, markAllRead
- `terminal.ts` — create, write, resize, destroy
- `app.ts` — info

### 3. `apps/desktop` — Shell Electron

**Simplifica `main.ts` para:**

1. `reservePort()` — encontrar porta livre no loopback
2. `generateToken()` — 24 bytes hex
3. `spawnServer()` — child process com `ELECTRON_RUN_AS_NODE=1`
   - Entry point: `process.resourcesPath + "/server/main.js"` (extraResource no build)
   - Em dev: `path.join(__dirname, "../../server/dist/main.js")`
4. `createWindow()` — com wsUrl no preload
5. Subscribe no push `notification` do server → exibe via `Electron.Notification`
6. Restart com backoff exponencial se server morrer
7. Graceful shutdown

**Mantém:**

- `browser-panel.ts` — permanece no desktop (precisa de WebContentsView)
- IPC local mínimo: `pick-folder`, `confirm-dialog`, `browser-*`, `get-ws-url`

**Preload simplifica:**

- `getWsUrl()` — retorna URL do WebSocket
- `pickFolder()` — dialog nativo
- `confirmDialog()` — dialog nativo
- `browser.*` — controle do browser panel

### 4. `apps/web` — Transport layer

**Novo:** `src/lib/ws-transport.ts`

- `WsTransport` class
- `connect(url)` — WebSocket com reconnect + backoff
- `request<M>(method, params)` — tipado via WsMethods
- `subscribe<E>(event, listener)` — tipado via WsPushEvents
- Timeout em requests (30s)
- Queue de mensagens enquanto desconectado

**Adaptar stores:**

- Trocar `desktopBridge.xxx()` por `transport.request("xxx", params)`
- Trocar `desktopBridge.onXxx()` por `transport.subscribe("xxx", fn)`

**Detecção de ambiente:**

```ts
const wsUrl =
  window.desktopBridge?.getWsUrl() ?? // Electron
  import.meta.env.VITE_WS_URL ?? // Env var
  `ws://${location.host}`; // Browser (mesma origem)
```

## Packaging (electron-builder)

```yaml
extraResources:
  - from: ../web/dist
    to: web
  - from: ../server/dist
    to: server
  - from: ../server/drizzle
    to: server/drizzle
```

O server roda via `ELECTRON_RUN_AS_NODE=1` usando o binário do Electron como Node runtime. Isso significa que os native modules (`better-sqlite3`, `node-pty`) são os do `app.asar.unpacked/node_modules/` — já compilados para o Electron pelo `electron-rebuild`.

O desktop empacota o build do server como extraResource. Entry point: `process.resourcesPath + "/server/main.js"`. O server bundla suas deps em um único arquivo via tsdown (exceto nativos, que ficam como `external`).

## Dependências entre pacotes

```
contracts ← server (tipos dos handlers)
contracts ← web (tipos do transport)
shared ← server (git, fs, logging)
```

## Build & Dev

- `bun dev:desktop` — spawna server + electron (hot reload ambos)
- `bun dev:server` — server standalone (para dev browser-only)
- `bun build:desktop` — build contracts → server → web → desktop
- `bun build:server` — build contracts → server (para deploy standalone)

## Ordem de build

```
contracts → server → web → desktop
```

O server depende de contracts (tipos WS). O web depende de contracts (transport tipado). O desktop depende do build do server (extraResource) e do web (extraResource).
