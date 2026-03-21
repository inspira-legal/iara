import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "./notifications.js";

function createPushFn() {
  // biome-ignore lint: test mock
  return vi.fn() as any;
}

describe("NotificationService", () => {
  let pushFn: ReturnType<typeof vi.fn>;
  let service: NotificationService;

  beforeEach(() => {
    pushFn = createPushFn();
    service = new NotificationService(pushFn as any);
  });

  describe("send()", () => {
    it("creates a notification with correct fields", () => {
      const n = service.send("Title", "Body", "info");
      expect(n.id).toBeDefined();
      expect(n.title).toBe("Title");
      expect(n.body).toBe("Body");
      expect(n.type).toBe("info");
      expect(n.read).toBe(false);
      expect(n.timestamp).toBeDefined();
    });

    it("defaults type to info", () => {
      const n = service.send("T", "B");
      expect(n.type).toBe("info");
    });

    it("pushes notification event to clients", () => {
      service.send("Hello", "World", "success");
      expect(pushFn).toHaveBeenCalledWith("notification", {
        title: "Hello",
        body: "World",
        type: "success",
      });
    });

    it("adds notifications in reverse chronological order", () => {
      service.send("First", "1");
      service.send("Second", "2");
      const all = service.getAll();
      expect(all[0]!.title).toBe("Second");
      expect(all[1]!.title).toBe("First");
    });

    it("caps notifications at 50", () => {
      for (let i = 0; i < 55; i++) {
        service.send(`Title-${i}`, `Body-${i}`);
      }
      expect(service.getAll().length).toBe(50);
    });

    it("deduplicates same title+body within 5 seconds", () => {
      const n1 = service.send("Dup", "Body");
      const n2 = service.send("Dup", "Body");
      expect(n1.id).toBe(n2.id);
      expect(service.getAll().length).toBe(1);
    });

    it("allows same title+body after dedup window expires", () => {
      vi.useFakeTimers();
      try {
        const n1 = service.send("Dup", "Body");
        vi.advanceTimersByTime(6000);
        const n2 = service.send("Dup", "Body");
        expect(n1.id).not.toBe(n2.id);
        expect(service.getAll().length).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getAll()", () => {
    it("returns empty array initially", () => {
      expect(service.getAll()).toEqual([]);
    });

    it("returns all sent notifications", () => {
      service.send("A", "1");
      service.send("B", "2");
      expect(service.getAll().length).toBe(2);
    });
  });

  describe("getUnreadCount()", () => {
    it("returns 0 when no notifications", () => {
      expect(service.getUnreadCount()).toBe(0);
    });

    it("counts unread notifications", () => {
      service.send("A", "1");
      service.send("B", "2");
      expect(service.getUnreadCount()).toBe(2);
    });

    it("decreases when notifications are read", () => {
      const n = service.send("A", "1");
      service.send("B", "2");
      service.markRead(n.id);
      expect(service.getUnreadCount()).toBe(1);
    });
  });

  describe("markRead()", () => {
    it("marks a specific notification as read", () => {
      const n = service.send("A", "1");
      expect(n.read).toBe(false);
      service.markRead(n.id);
      expect(service.getAll().find((x) => x.id === n.id)!.read).toBe(true);
    });

    it("does nothing for non-existent id", () => {
      service.send("A", "1");
      service.markRead("non-existent");
      expect(service.getUnreadCount()).toBe(1);
    });
  });

  describe("markAllRead()", () => {
    it("marks all notifications as read", () => {
      service.send("A", "1");
      service.send("B", "2");
      service.send("C", "3");
      service.markAllRead();
      expect(service.getUnreadCount()).toBe(0);
    });
  });

  describe("clear()", () => {
    it("removes all notifications", () => {
      service.send("A", "1");
      service.send("B", "2");
      service.clear();
      expect(service.getAll()).toEqual([]);
    });
  });
});
