# Notification Badge In-App

## Visão Geral

Badge de contagem de notificações não lidas na sidebar + painel dropdown para visualizar e gerenciar notificações. Backend e store já existem — falta apenas componente visual.

## O que já existe

- **Store:** `stores/notifications.ts` — `notifications[]`, `unreadCount`, `loadNotifications()`, `markRead(id)`, `markAllRead()`, `subscribePush()`
- **Service:** `services/notifications.ts` — `NotificationService` com send, dedup (5s), max 50 in-memory, push via WS
- **Handlers:** `handlers/notifications.ts` — `notifications.list`, `notifications.unreadCount`, `notifications.markRead`, `notifications.markAllRead`
- **Model:** `AppNotification { id, title, body, type: "info"|"success"|"error", timestamp, read }`
- **Push event:** `notification` via WebSocket

## Requisitos

### NB-01: Badge na sidebar

- Exibir badge com contagem de `unreadCount` no header da sidebar, junto aos botões existentes (+ e BrowserToggle)
- Ícone: Bell (lucide-react)
- Badge só aparece quando `unreadCount > 0`
- Número dentro do badge (max "9+")

### NB-02: Painel de notificações

- Click no badge abre dropdown/popover posicionado abaixo do ícone
- Lista notificações ordenadas por timestamp (mais recente primeiro)
- Cada item: ícone por type (info/success/error), título, body truncado, timestamp relativo
- Itens não lidos com background highlight
- Click num item marca como lido
- Botão "Marcar todas como lidas" no header do painel
- Painel fecha ao clicar fora

### NB-03: Subscription no mount

- Inicializar `subscribePush()` no `__root.tsx` ou `AppShell` (uma vez, global)
- Carregar `loadNotifications()` no mount

## Arquivos

| Arquivo                                        | Mudança                                    |
| ---------------------------------------------- | ------------------------------------------ |
| `apps/web/src/components/NotificationBell.tsx` | **Novo** — ícone + badge + dropdown        |
| `apps/web/src/components/Sidebar.tsx`          | Adicionar `<NotificationBell />` no header |
| `apps/web/src/routes/__root.tsx`               | Inicializar subscription de notificações   |
