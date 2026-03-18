import { registerMethod } from "../router.js";
import type { NotificationService } from "../services/notifications.js";

export function registerNotificationHandlers(service: NotificationService): void {
  registerMethod("notifications.list", async () => {
    return service.getAll();
  });

  registerMethod("notifications.unreadCount", async () => {
    return service.getUnreadCount();
  });

  registerMethod("notifications.markRead", async (params) => {
    service.markRead(params.id);
  });

  registerMethod("notifications.markAllRead", async () => {
    service.markAllRead();
  });
}
