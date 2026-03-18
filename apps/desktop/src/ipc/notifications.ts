import { ipcMain } from "electron";
import type { NotificationService } from "../services/notifications.js";
import { Channels } from "./channels.js";

let getService: () => NotificationService;

export function initNotificationHandlers(getter: () => NotificationService): void {
  getService = getter;
}

export function registerNotificationHandlers(): void {
  ipcMain.handle(
    Channels.SEND_NOTIFICATION,
    (_event, title: string, body: string, type?: string) => {
      return getService().send(title, body, (type as "info" | "success" | "error") ?? "info");
    },
  );

  ipcMain.handle(Channels.GET_NOTIFICATIONS, () => {
    return getService().getAll();
  });

  ipcMain.handle(Channels.GET_UNREAD_COUNT, () => {
    return getService().getUnreadCount();
  });

  ipcMain.handle(Channels.MARK_NOTIFICATION_READ, (_event, id: string) => {
    getService().markRead(id);
  });

  ipcMain.handle(Channels.MARK_ALL_READ, () => {
    getService().markAllRead();
  });
}
