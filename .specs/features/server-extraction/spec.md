# Server Extraction

Extrair a lógica do main process do Electron para um servidor HTTP/WebSocket standalone, seguindo o padrão do t3code.

## Motivação

- Permitir acesso pelo browser sem Electron
- Suportar múltiplos clients simultâneos
- Testabilidade do backend isolado
- Possibilidade de rodar headless (servidor remoto, SSH)

## Requisitos

### REQ-01: Servidor standalone

Criar `apps/server` com HTTP + WebSocket, usando a mesma stack (better-sqlite3, Drizzle, node-pty). O servidor deve funcionar independente do Electron.

### REQ-02: Desktop como shell

O `apps/desktop` vira um shell leve que:

1. Spawna o server como child process (`ELECTRON_RUN_AS_NODE=1`)
2. Descobre porta (loopback) e gera auth token
3. Passa URL do WebSocket ao renderer via preload bridge
4. Gerencia lifecycle (restart com backoff, graceful shutdown)

### REQ-03: Web client via WebSocket

O `apps/web` se conecta ao server via WebSocket em vez de IPC:

- Desktop: URL via `desktopBridge.getWsUrl()`
- Browser: mesma origem ou `VITE_WS_URL`
- Reconnect automático com backoff exponencial

### REQ-04: API WebSocket

Converter os 12 módulos IPC atuais em métodos WebSocket:

| IPC atual                      | WS method                 |
| ------------------------------ | ------------------------- |
| desktop:list-projects          | projects.list             |
| desktop:get-project            | projects.get              |
| desktop:create-project         | projects.create           |
| desktop:update-project         | projects.update           |
| desktop:delete-project         | projects.delete           |
| desktop:get-repo-info          | repos.getInfo             |
| desktop:add-repo               | repos.add                 |
| desktop:fetch-repos            | repos.fetch               |
| desktop:list-tasks             | tasks.list                |
| desktop:get-task               | tasks.get                 |
| desktop:create-task            | tasks.create              |
| desktop:complete-task          | tasks.complete            |
| desktop:delete-task            | tasks.delete              |
| desktop:launch-claude          | launcher.launch           |
| desktop:list-sessions          | sessions.list             |
| desktop:read-prompt            | prompts.read              |
| desktop:write-prompt           | prompts.write             |
| desktop:dev-start              | dev.start                 |
| desktop:dev-stop               | dev.stop                  |
| desktop:dev-status             | dev.status                |
| desktop:dev-logs               | dev.logs                  |
| desktop:dev-discover           | dev.discover              |
| desktop:env-read               | env.read                  |
| desktop:env-write              | env.write                 |
| desktop:env-merge              | env.merge                 |
| desktop:get-git-status         | git.status                |
| desktop:get-notifications      | notifications.list        |
| desktop:get-unread-count       | notifications.unreadCount |
| desktop:mark-notification-read | notifications.markRead    |
| desktop:mark-all-read          | notifications.markAllRead |
| desktop:get-app-info           | app.info                  |

**Métodos com streaming:** `repos.add` retorna imediatamente com `{ ok: true }` e emite push events `clone:progress` durante o clone. Ao finalizar, emite `clone:done` ou `clone:error`.

### REQ-05: Terminal via WebSocket

Terminal PTY roda no server. Dados fluem via WS push:

- `terminal.create` → cria PTY, retorna terminalId
- `terminal.write` → envia input
- `terminal.resize` → redimensiona
- `terminal.destroy` → mata PTY
- Push: `terminal:data`, `terminal:exit`

### REQ-06: Funcionalidades Electron-only

Permanecem no desktop (não migram):

- **Browser panel** (WebContentsView) — permanece no desktop, chamadas via IPC local
- **Dialogs nativos** (folder picker, confirm) — permanecem no desktop
- **Notificações nativas** — desktop recebe push `notification` do server e exibe via `Electron.Notification`
- **Zoom/DevTools** — desktop only

**Fallbacks no browser (sem Electron):**

- Browser panel → não disponível, botão escondido
- Dialogs nativos → `<input type="file">` para folder picker, `window.confirm()` para confirmação
- Notificações nativas → `Notification API` do browser (com permission request)

### REQ-07: Autenticação

Token de 24 bytes hex, passado via query string no upgrade do WebSocket. Conexões sem token válido são rejeitadas com 401.

- **Desktop mode:** desktop gera o token e passa ao server via `--auth-token`
- **Standalone mode:** server aceita `--auth-token` flag/env var. Se nenhum for fornecido, gera um próprio e imprime no stdout para o usuário copiar.

### REQ-08: Hooks e socket server

O socket server atual (Unix socket para comunicação com Claude hooks) migra para o server. O server expõe o socket em `/tmp/iara-server-<uid>.sock`. Hooks (`PostToolUse`, `Stop`) falam com o server diretamente.

O desktop não precisa mais do socket — recebe eventos via WS push.

### REQ-09: Protocolo de mensagens

Request/response JSON sobre WebSocket:

```
→ { "id": "1", "method": "projects.list", "params": {} }
← { "id": "1", "result": [...] }
← { "id": "1", "error": { "code": "NOT_FOUND", "message": "..." } }
```

Push events (server → client):

```
← { "push": "terminal:data", "params": { "terminalId": "...", "data": "..." } }
← { "push": "dev:healthy", "params": { "name": "...", "port": 3000 } }
← { "push": "notification", "params": { "title": "...", "body": "..." } }
```

### REQ-10: Type-safe protocol via contracts

Definir em `packages/contracts` os tipos do protocolo WS, compartilhados entre server e web:

```ts
// packages/contracts/src/ws.ts

// Mapa method → { params, result }
export type WsMethods = {
  "projects.list": { params: Record<string, never>; result: Project[] };
  "projects.get": { params: { id: string }; result: Project };
  "projects.create": { params: CreateProjectInput; result: Project };
  // ... todos os métodos
};

// Mapa event → payload
export type WsPushEvents = {
  "terminal:data": { terminalId: string; data: string };
  "terminal:exit": { terminalId: string; exitCode: number };
  "dev:healthy": { name: string; port: number };
  notification: { title: string; body: string };
  "clone:progress": { repoUrl: string; progress: string };
  "clone:done": { repoUrl: string };
  "clone:error": { repoUrl: string; error: string };
};

// Envelopes tipados
export type WsRequest<M extends keyof WsMethods = keyof WsMethods> = {
  id: string;
  method: M;
  params: WsMethods[M]["params"];
};

export type WsResponse<M extends keyof WsMethods = keyof WsMethods> = {
  id: string;
} & ({ result: WsMethods[M]["result"] } | { error: { code: string; message: string } });

export type WsPush<E extends keyof WsPushEvents = keyof WsPushEvents> = {
  push: E;
  params: WsPushEvents[E];
};
```

O client expõe métodos tipados:

```ts
// apps/web — transport tipado
request<M extends keyof WsMethods>(method: M, params: WsMethods[M]["params"]): Promise<WsMethods[M]["result"]>
subscribe<E extends keyof WsPushEvents>(event: E, listener: (params: WsPushEvents[E]) => void): () => void
```

O server roteia com type narrowing:

```ts
// apps/server — handler tipado
registerMethod<M extends keyof WsMethods>(method: M, handler: (params: WsMethods[M]["params"]) => Promise<WsMethods[M]["result"]>): void
```

## Fora de escopo

- Não usar Effect.ts (manter stack simples)
- Não implementar HTTP REST — tudo via WebSocket
- Não implementar auth por usuário/senha
- Socket server existente no desktop é removido (socket migra pro server)
