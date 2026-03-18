import { create } from "zustand";
import { ensureNativeApi } from "~/nativeApi";

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
}

export const useNotificationStore = create<NotificationState & NotificationActions>((set) => ({
  notifications: [],
  unreadCount: 0,

  loadNotifications: async () => {
    try {
      const api = ensureNativeApi();
      const [notifications, unreadCount] = await Promise.all([
        api.getNotifications(),
        api.getUnreadCount(),
      ]);
      set({ notifications, unreadCount });
    } catch {
      // Not in Electron
    }
  },

  markRead: async (id) => {
    const api = ensureNativeApi();
    await api.markNotificationRead(id);
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    const api = ensureNativeApi();
    await api.markAllRead();
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },
}));
