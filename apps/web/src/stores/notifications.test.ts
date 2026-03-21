import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Transport mock
// ---------------------------------------------------------------------------

const { mockRequest, mockSubscribe } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockSubscribe: vi.fn((_event: string, _cb: (...args: unknown[]) => void) => vi.fn()),
}));

vi.mock("~/lib/ws-transport", () => ({
  transport: {
    request: mockRequest,
    subscribe: mockSubscribe,
  },
}));

import { useNotificationStore } from "./notifications";
import type { AppNotification } from "./notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "notif-1",
    title: "Test Notification",
    body: "Something happened",
    type: "info",
    timestamp: "2025-01-01T00:00:00Z",
    read: false,
    ...overrides,
  };
}

const INITIAL_STATE = {
  notifications: [] as AppNotification[],
  unreadCount: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState(INITIAL_STATE);
});

describe("useNotificationStore", () => {
  // -----------------------------------------------------------------------
  // loadNotifications
  // -----------------------------------------------------------------------

  describe("loadNotifications()", () => {
    it("is a no-op", async () => {
      await useNotificationStore.getState().loadNotifications();
      expect(mockRequest).not.toHaveBeenCalled();
      expect(useNotificationStore.getState().notifications).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // markRead
  // -----------------------------------------------------------------------

  describe("markRead()", () => {
    it("marks a single notification as read", async () => {
      const notif = makeNotification({ id: "n1", read: false });
      useNotificationStore.setState({ notifications: [notif], unreadCount: 1 });

      await useNotificationStore.getState().markRead("n1");

      expect(useNotificationStore.getState().notifications[0]!.read).toBe(true);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it("does not affect other notifications", async () => {
      const n1 = makeNotification({ id: "n1", read: false });
      const n2 = makeNotification({ id: "n2", read: false });
      useNotificationStore.setState({ notifications: [n1, n2], unreadCount: 2 });

      await useNotificationStore.getState().markRead("n1");

      expect(useNotificationStore.getState().notifications[0]!.read).toBe(true);
      expect(useNotificationStore.getState().notifications[1]!.read).toBe(false);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it("does not make unreadCount negative", async () => {
      const n1 = makeNotification({ id: "n1", read: true });
      useNotificationStore.setState({ notifications: [n1], unreadCount: 0 });

      await useNotificationStore.getState().markRead("n1");

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it("handles marking non-existent notification id", async () => {
      const n1 = makeNotification({ id: "n1", read: false });
      useNotificationStore.setState({ notifications: [n1], unreadCount: 1 });

      await useNotificationStore.getState().markRead("nonexistent");

      // Nothing changed except unread count decremented (local-only logic)
      expect(useNotificationStore.getState().notifications[0]!.read).toBe(false);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it("is local-only, does not call transport", async () => {
      const n1 = makeNotification({ id: "n1", read: false });
      useNotificationStore.setState({ notifications: [n1], unreadCount: 1 });

      await useNotificationStore.getState().markRead("n1");

      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // markAllRead
  // -----------------------------------------------------------------------

  describe("markAllRead()", () => {
    it("marks all notifications as read", async () => {
      const n1 = makeNotification({ id: "n1", read: false });
      const n2 = makeNotification({ id: "n2", read: false });
      const n3 = makeNotification({ id: "n3", read: true });
      useNotificationStore.setState({ notifications: [n1, n2, n3], unreadCount: 2 });

      await useNotificationStore.getState().markAllRead();

      const state = useNotificationStore.getState();
      expect(state.notifications.every((n) => n.read)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it("works on empty list", async () => {
      await useNotificationStore.getState().markAllRead();
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it("is local-only, does not call transport", async () => {
      await useNotificationStore.getState().markAllRead();
      expect(mockRequest).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // subscribePush
  // -----------------------------------------------------------------------

  describe("subscribePush()", () => {
    it("subscribes to notification event and returns unsubscribe", () => {
      const unsub = vi.fn();
      mockSubscribe.mockReturnValueOnce(unsub);

      const unsubFn = useNotificationStore.getState().subscribePush();

      expect(mockSubscribe).toHaveBeenCalledWith("notification", expect.any(Function));

      unsubFn();
      expect(unsub).toHaveBeenCalled();
    });

    it("adds notification and increments unread count on push", () => {
      const notif = makeNotification({ id: "pushed-1" });

      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        cb(notif);
        return vi.fn();
      });

      useNotificationStore.getState().subscribePush();

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
      expect(useNotificationStore.getState().notifications[0]!.id).toBe("pushed-1");
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it("appends multiple notifications", () => {
      const notif1 = makeNotification({ id: "n1" });
      const notif2 = makeNotification({ id: "n2" });

      let callCount = 0;
      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        if (callCount === 0) {
          cb(notif1);
          cb(notif2);
        }
        callCount++;
        return vi.fn();
      });

      useNotificationStore.getState().subscribePush();

      expect(useNotificationStore.getState().notifications).toHaveLength(2);
      expect(useNotificationStore.getState().unreadCount).toBe(2);
    });

    it("increments unread count correctly from existing state", () => {
      const existing = makeNotification({ id: "existing", read: false });
      useNotificationStore.setState({ notifications: [existing], unreadCount: 1 });

      const notif = makeNotification({ id: "new-push" });

      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        cb(notif);
        return vi.fn();
      });

      useNotificationStore.getState().subscribePush();

      expect(useNotificationStore.getState().notifications).toHaveLength(2);
      expect(useNotificationStore.getState().unreadCount).toBe(2);
    });

    it("preserves notification fields from push event", () => {
      const notif = makeNotification({
        id: "custom",
        title: "Deploy Complete",
        body: "v1.2.3 deployed",
        type: "success",
        timestamp: "2025-06-15T12:00:00Z",
        read: false,
      });

      mockSubscribe.mockImplementation((_event: string, cb: (...args: unknown[]) => void) => {
        cb(notif);
        return vi.fn();
      });

      useNotificationStore.getState().subscribePush();

      const pushed = useNotificationStore.getState().notifications[0]!;
      expect(pushed.title).toBe("Deploy Complete");
      expect(pushed.body).toBe("v1.2.3 deployed");
      expect(pushed.type).toBe("success");
    });
  });
});
