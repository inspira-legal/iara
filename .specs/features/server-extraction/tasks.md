# Server Extraction — Tasks

## Fase 1: Fundação (contracts + server scaffold)

### T01: Protocolo WS em contracts

**Arquivo:** `packages/contracts/src/ws.ts`

- Definir `WsMethods` com todos os métodos (tabela do REQ-04/05)
- Definir `WsPushEvents` com todos os push events
- Definir envelopes `WsRequest`, `WsResponse`, `WsPush`
- Exportar em `packages/contracts/src/index.ts`
- **Verificação:** `bun typecheck` passa, tipos são importáveis de `@iara/contracts`

### T02: Scaffold apps/server

- Criar `apps/server/` com `package.json`, `tsconfig.json`, `tsdown.config.ts`
- Entry point `src/main.ts` — parse env vars (port, token, state-dir), init e listen
- Deps: `ws`, `better-sqlite3`, `drizzle-orm`, `node-pty`, `@iara/contracts`, `@iara/shared`
- Deps nativas (`better-sqlite3`, `node-pty`) ficam aqui, não mais no desktop
- `postinstall`: `electron-rebuild` (necessário enquanto desktop spawna com `ELECTRON_RUN_AS_NODE=1`)
- Adicionar ao workspace root `package.json`
- **Verificação:** `bun build` compila sem erros, `node dist/main.js --port 3773` inicia e escuta

### T03: WS server + router tipado

**Arquivos:** `apps/server/src/ws.ts`, `apps/server/src/router.ts`

- HTTP server (serve static files do web build em prod)
- WebSocket server com auth por token no upgrade
- Router tipado: `registerMethod<M>()`, dispatch, error handling
- Push broadcast: `pushAll<E>(event, params)`
- Heartbeat ping/pong (30s interval)
- **Verificação:** Conectar com `wscat`, enviar request, receber response/error

## Fase 2: Migrar services e DB

### T04: Mover DB para server

- Mover `apps/desktop/src/db.ts` → `apps/server/src/db.ts`
- Mover `apps/desktop/src/db/schema.ts` → `apps/server/src/db/schema.ts`
- Mover `apps/desktop/drizzle/` → `apps/server/drizzle/`
- Atualizar electron-builder.yml (remover `drizzle/**/*` dos files)
- State dir configurável via `--state-dir` (default: `~/.config/iara`)
- **Verificação:** Server inicia, cria DB, roda migrations

### T05: Mover services para server

- Mover `apps/desktop/src/services/` → `apps/server/src/services/`:
  - `projects.ts`, `tasks.ts`, `repos.ts` — atualizar imports do DB
  - `sessions.ts`, `env.ts`, `launcher.ts` — sem mudanças significativas
  - `config.ts`, `shell-env.ts` — mover
- NÃO mover `hooks.ts`, `plugins.ts`, `socket.ts` aqui (ficam para T14)
- NÃO mover `browser-panel.ts` (permanece no desktop)
- Ajustar imports de `@iara/shared/*`
- **Verificação:** `bun typecheck` passa no server

### T06: Adaptar terminal service para WS push

- `apps/server/src/services/terminal.ts`
- Em vez de `mainWindow.webContents.send()`, chamar callback de push
- `TerminalManager` recebe `pushFn: (event, params) => void` no constructor
- **Verificação:** Terminal cria, data flui via push, exit notifica

### T07: Adaptar devservers para WS push

- `apps/server/src/services/devservers.ts`
- Evento `healthy` → push `dev:healthy`
- Log streaming → push `dev:log` (opcional, ou sob demanda via request)
- **Verificação:** Dev server inicia, healthy push chega ao client

### T08: Adaptar notifications para WS push

- `apps/server/src/services/notifications.ts`
- `send()` → push `notification` para todos os clients
- Manter queue in-memory para `list` e `unreadCount`
- **Verificação:** Notification push chega ao client

## Fase 3: Handlers

### T09: Handlers de projeto

- `apps/server/src/handlers/projects.ts`
- Registrar: `projects.list`, `projects.get`, `projects.create`, `projects.update`, `projects.delete`
- Registrar: `repos.getInfo`, `repos.add`, `repos.fetch`
- **Verificação:** CRUD de projetos funciona via WS

### T10: Handlers de tasks

- `apps/server/src/handlers/tasks.ts`
- Registrar: `tasks.list`, `tasks.get`, `tasks.create`, `tasks.complete`, `tasks.delete`
- **Verificação:** CRUD de tasks funciona via WS

### T11: Handlers de launcher, sessions, prompts

- `apps/server/src/handlers/launcher.ts` — `launcher.launch`
- `apps/server/src/handlers/sessions.ts` — `sessions.list`
- `apps/server/src/handlers/prompts.ts` — `prompts.read`, `prompts.write`
- **Verificação:** Launch abre Claude, sessions lista, prompts lê/escreve

### T12: Handlers de dev, env, git, app

- `apps/server/src/handlers/devservers.ts` — `dev.start`, `dev.stop`, `dev.status`, `dev.logs`, `dev.discover`
- `apps/server/src/handlers/env.ts` — `env.read`, `env.write`, `env.merge`
- `apps/server/src/handlers/git.ts` — `git.status`
- `apps/server/src/handlers/app.ts` — `app.info`
- **Verificação:** Cada método responde corretamente via WS

### T13: Handlers de notifications e terminal

- `apps/server/src/handlers/notifications.ts` — `notifications.list`, `notifications.unreadCount`, `notifications.markRead`, `notifications.markAllRead`
- `apps/server/src/handlers/terminal.ts` — `terminal.create`, `terminal.write`, `terminal.resize`, `terminal.destroy`
- **Verificação:** Notifications CRUD funciona, terminal data flui via push

### T14: Migrar socket server e hooks pro server

- Mover `apps/desktop/src/services/socket.ts` → `apps/server/src/socket.ts`
- Mover `apps/desktop/src/services/hooks.ts` → `apps/server/src/services/hooks.ts`
- Mover `apps/desktop/src/services/plugins.ts` → `apps/server/src/services/plugins.ts`
- Socket path: `/tmp/iara-server-<uid>.sock`
- Repassar eventos do socket como WS push para clients
- **Verificação:** Hooks do Claude se comunicam com o server via socket

## Fase 4: Client WS transport

### T15: WsTransport no web

- `apps/web/src/lib/ws-transport.ts`
- `connect(url)`, `disconnect()`, `request<M>()`, `subscribe<E>()`
- Reconnect com backoff (500ms, 1s, 2s, 4s, 8s, max 8s)
- Request timeout (30s)
- Queue enquanto desconectado
- Detecção de ambiente (desktop bridge / env / mesma origem)
- **Verificação:** `bun typecheck`, transport conecta ao server, request/response funciona

### T16: Migrar stores de IPC → WS

- Cada store que usa `desktopBridge.xxx()` passa a usar `transport.request()`
- Cada listener `desktopBridge.onXxx()` passa a usar `transport.subscribe()`
- Manter `desktopBridge` apenas para: `getWsUrl`, `pickFolder`, `confirmDialog`, `browser.*`
- Fallbacks browser (sem Electron): `<input>` para folder picker, `window.confirm()`, `Notification API`
- **Verificação:** App funciona end-to-end via WS, tanto no Electron quanto no browser

## Fase 5: Desktop como shell

### T17: Reescrever desktop main.ts

- Bootstrap: reservar porta, gerar token, spawnar server
  - Entry point: `process.resourcesPath + "/server/main.js"` (prod), relativo (dev)
- Restart com backoff exponencial
- Graceful shutdown (kill server child)
- Conectar ao WS do server e subscrever push `notification` → exibir via `Electron.Notification`
- Remover: IPC handlers de negócio, DB init, services, socket server
- Manter: browser panel IPC, dialogs IPC, window management
- **Verificação:** Desktop spawna server, web conecta, app funciona

### T18: Simplificar preload

- Remover todas as chamadas IPC de negócio
- Manter: `getWsUrl()`, `pickFolder()`, `confirmDialog()`, `browser.*`
- **Verificação:** `bun typecheck`, preload expõe apenas o necessário

### T19: Limpar código morto do desktop

- Remover `apps/desktop/src/services/` (migrados pro server)
- Remover `apps/desktop/src/db*`
- Remover `apps/desktop/src/ipc/` handlers de negócio
- Remover deps nativas: `better-sqlite3`, `drizzle-orm`, `node-pty`, `@types/better-sqlite3`, `drizzle-kit`
- Remover `@electron/rebuild` e `postinstall` script (rebuild agora vive no server)
- Desktop fica sem módulos nativos — build mais rápido, zero rebuild
- **Verificação:** `bun typecheck`, `bun build:desktop`, app funciona

## Fase 6: Dev workflow, build & testes

### T20: Scripts e build pipeline

- Adicionar `bun dev:server` — server standalone com hot reload
- Atualizar `bun dev:desktop` — spawna server + electron
- Atualizar `bun build:desktop` — contracts → server → web → desktop
- Adicionar `bun build:server` — contracts → server standalone
- Atualizar turborepo pipeline
- Atualizar electron-builder.yml (extraResources: server/dist)
- Atualizar `scripts/install-desktop.ts`
- **Verificação:** Todos os scripts funcionam, build produz artefatos corretos

### T21: Testes

- Testes do router/WS server (connection, auth, dispatch, push)
- Testes dos handlers (unit, usando DB in-memory)
- Testes do WsTransport (reconnect, timeout, queue)
- Migrar testes existentes do desktop para server
- **Verificação:** `bun run test` passa, cobertura adequada

## Dependências

```
T01 ──→ T02 ──→ T03
                  │
                  ├──→ T04 ─┐
                  ├──→ T05 ─┤  (paralelo entre si)
                  ├──→ T06 ─┤
                  ├──→ T07 ─┤
                  └──→ T08 ─┘
                        │
                        ▼
               T09, T10, T11, T12, T13 (paralelo)
                        │
                        ▼
                       T14
                        │
                        ▼
                  T15 ──→ T16
                            │
                            ▼
                  T17 ──→ T18 ──→ T19
                                    │
                                    ▼
                              T20, T21 (paralelo)
```

## Notas

- Não há retrocompatibilidade — corta limpo de IPC para WS
- Fase 2-3 é onde tem mais risco — testar cada handler individualmente
- T16 é a task mais trabalhosa (migrar todos os stores)
- T14 é crítica — hooks do Claude precisam continuar funcionando
