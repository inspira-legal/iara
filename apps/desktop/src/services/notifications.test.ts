import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "./notifications.js";

// Mock Electron Notification
vi.mock("electron", () => ({
  Notification: class {
    show() {}
  },
}));

describe("notification service", () => {
  it("sends and retrieves notifications", () => {
    const svc = new NotificationService();
    svc.send("Test", "Hello", "info");
    svc.send("Test2", "World", "success");

    const all = svc.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.title).toBe("Test2"); // newest first
  });

  it("deduplicates within 5 seconds", () => {
    const svc = new NotificationService();
    svc.send("Same", "Message");
    svc.send("Same", "Message");

    expect(svc.getAll()).toHaveLength(1);
  });

  it("tracks unread count", () => {
    const svc = new NotificationService();
    svc.send("A", "1");
    svc.send("B", "2");

    expect(svc.getUnreadCount()).toBe(2);

    svc.markRead(svc.getAll()[0]!.id);
    expect(svc.getUnreadCount()).toBe(1);

    svc.markAllRead();
    expect(svc.getUnreadCount()).toBe(0);
  });

  it("caps at max notifications", () => {
    const svc = new NotificationService();
    for (let i = 0; i < 60; i++) {
      svc.send(`Title ${i}`, `Body ${i}`);
    }
    expect(svc.getAll()).toHaveLength(50);
  });
});
