import { Notification } from "electron";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "error";
  timestamp: string;
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

export class NotificationService {
  private notifications: AppNotification[] = [];
  private seenKeys = new Set<string>();

  send(title: string, body: string, type: AppNotification["type"] = "info"): AppNotification {
    // Dedup: skip if same title+body within 5 seconds
    const dedupKey = `${title}:${body}`;
    if (this.seenKeys.has(dedupKey)) {
      const existing = this.notifications.find(
        (n) =>
          `${n.title}:${n.body}` === dedupKey &&
          Date.now() - new Date(n.timestamp).getTime() < 5000,
      );
      if (existing) return existing;
    }

    const notification: AppNotification = {
      id: crypto.randomUUID(),
      title,
      body,
      type,
      timestamp: new Date().toISOString(),
      read: false,
    };

    this.notifications.unshift(notification);
    if (this.notifications.length > MAX_NOTIFICATIONS) {
      this.notifications.pop();
    }

    this.seenKeys.add(dedupKey);
    setTimeout(() => this.seenKeys.delete(dedupKey), 5000);

    // System notification
    try {
      new Notification({ title, body }).show();
    } catch {
      // Not available outside Electron
    }

    return notification;
  }

  getAll(): AppNotification[] {
    return this.notifications;
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  markRead(id: string): void {
    const n = this.notifications.find((n) => n.id === id);
    if (n) n.read = true;
  }

  markAllRead(): void {
    for (const n of this.notifications) {
      n.read = true;
    }
  }

  clear(): void {
    this.notifications = [];
  }
}
