# Tela de Configurações

## Visão Geral

Tela de preferências globais do iara. Persiste configurações no SQLite via server. Acessível por ícone de engrenagem na sidebar. Primeira versão com poucas opções — estrutura extensível pra futuras preferências.

## Requisitos

### SET-01: Schema de settings no DB

- Tabela `settings` no SQLite: `key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at TEXT NOT NULL`
- Key-value simples. Valores serializados como JSON string quando necessário.
- Migration via Drizzle.

### SET-02: Service + Handlers no server

- `SettingsService`: `get(key)`, `set(key, value)`, `getAll()`, `remove(key)`
- Handlers WS: `settings.getAll`, `settings.get`, `settings.set`
- Push event `settings:changed` ao alterar um valor

### SET-03: Store no frontend

- Zustand store: `settings: Record<string, string>`, `loadSettings()`, `updateSetting(key, value)`
- Carregar no mount do app (junto com projetos/tasks)

### SET-04: Botão na sidebar

- Ícone Settings (lucide-react) no footer da sidebar (abaixo da lista de projetos)
- Click navega pra rota `/settings`

### SET-05: Tela de configurações

- Rota `/settings` no TanStack Router (file-based: `routes/settings.tsx`)
- Layout: MainPanel com seções agrupadas
- Seções iniciais:
  - **Notificações**
    - Toggle: "Notificações nativas do OS" (key: `notifications.os_enabled`, default: `true`)
  - **Claude Code**
    - Input numérico: "Auto-compact threshold %" (key: `claude.autocompact_pct`, default: vazio/desabilitado)
    - Descrição: "Define CLAUDE_AUTOCOMPACT_PCT_OVERRIDE ao lançar sessões"
  - **Aparência**
    - Placeholder pra futuro (theme, font size, etc)

### SET-06: Integração com launcher

- Ao lançar Claude (terminal.ts e launcher.ts), se `claude.autocompact_pct` tiver valor, injetar `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE={valor}` no env do processo
- Ao enviar notificação nativa (main.ts), checar `notifications.os_enabled` — se false, não mostrar

## Arquivos

| Arquivo                                | Mudança                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `apps/server/src/db/schema.ts`         | Adicionar tabela `settings`                                    |
| `apps/server/src/services/settings.ts` | **Novo** — CRUD de settings                                    |
| `apps/server/src/handlers/settings.ts` | **Novo** — handlers WS                                         |
| `packages/contracts/src/ws.ts`         | Adicionar métodos `settings.*` e push event `settings:changed` |
| `apps/web/src/stores/settings.ts`      | **Novo** — Zustand store                                       |
| `apps/web/src/routes/settings.tsx`     | **Novo** — rota e componente                                   |
| `apps/web/src/components/Sidebar.tsx`  | Adicionar botão Settings no footer                             |
| `apps/server/src/services/terminal.ts` | Injetar AUTOCOMPACT env var                                    |
| `apps/server/src/services/launcher.ts` | Injetar AUTOCOMPACT env var                                    |
| `apps/desktop/src/main.ts`             | Checar setting antes de mostrar notificação OS                 |
