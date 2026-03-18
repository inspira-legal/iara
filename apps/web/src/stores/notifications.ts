import { create } from "zustand";
import { transport } from "../lib/ws-transport.js";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "error";
  timestamp: string;
  read: boolean;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
}

interface NotificationActions {
  loadNotifications(): Promise<void>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  subscribePush(): () => void;
}

export const useNotificationStore = create<NotificationState & NotificationActions>((set) => ({
  notifications: [],
  unreadCount: 0,

  loadNotifications: async () => {
    try {
      const [notifications, unreadCount] = await Promise.all([
        transport.request("notifications.list", {}),
        transport.request("notifications.unreadCount", {}),
      ]);
      set({ notifications, unreadCount });
    } catch {
      // transport not ready
    }
  },

  markRead: async (id) => {
    await transport.request("notifications.markRead", { id });
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await transport.request("notifications.markAllRead", {});
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  subscribePush: () => {
    const unsub = transport.subscribe("notification", () => {
      // Reload notifications when a new push arrives
      void transport.request("notifications.list", {}).then((notifications) => {
        set({ notifications });
      });
      void transport.request("notifications.unreadCount", {}).then((unreadCount) => {
        set({ unreadCount });
      });
    });
    return unsub;
  },
}));
