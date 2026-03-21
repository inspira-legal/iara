import type { NotificationService } from "../services/notifications.js";

// The NotificationService still handles in-memory notifications + push events.
// RPC methods for persistence (list, unreadCount, markRead, markAllRead) have been
// removed — notification state is now managed client-side.
export function registerNotificationHandlers(_service: NotificationService): void {
  // No RPC methods registered. The NotificationService is still used by other
  // server-side code to push notification events to connected clients.
}
