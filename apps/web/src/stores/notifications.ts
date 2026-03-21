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
    // no-op: notifications are received via push events
  },

  markRead: async (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  subscribePush: () => {
    const unsub = transport.subscribe("notification", (params) => {
      const notification = params as unknown as AppNotification;
      set((state) => ({
        notifications: [...state.notifications, notification],
        unreadCount: state.unreadCount + 1,
      }));
    });
    return unsub;
  },
}));
