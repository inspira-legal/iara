import * as crypto from "node:crypto";
import type { AppNotification, WsPushEvents } from "@iara/contracts";

const MAX_NOTIFICATIONS = 50;

export class NotificationService {
  private notifications: AppNotification[] = [];
  private seenKeys = new Set<string>();
  private pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

  constructor(pushFn: <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void) {
    this.pushFn = pushFn;
  }

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

    // Push notification to connected clients via WebSocket
    this.pushFn("notification", { title, body, type });

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
