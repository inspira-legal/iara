import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------
type WsEventHandler = (event?: { data?: string }) => void;

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  url: string;
  private listeners: Record<string, WsEventHandler[]> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Auto-fire open on next tick
    queueMicrotask(() => this.fire("open"));
  }

  addEventListener(event: string, handler: WsEventHandler) {
    this.listeners[event] ??= [];
    this.listeners[event].push(handler);
  }

  send = vi.fn();
  close = vi.fn().mockImplementation(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.fire("close");
  });

  // Test helpers
  fire(event: string, data?: { data?: string }) {
    for (const h of this.listeners[event] ?? []) h(data);
  }

  simulateMessage(data: string) {
    this.fire("message", { data });
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

Object.defineProperty(MockWebSocket, "OPEN", { value: 1, writable: false });

// Set up globals before importing the module
(globalThis as Record<string, unknown>).WebSocket = MockWebSocket;
vi.stubGlobal("location", { host: "localhost:3000" });

// Provide window.desktopBridge so resolveWsUrl doesn't blow up
vi.stubGlobal("window", {
  desktopBridge: undefined,
  location: { host: "localhost:3000" },
});

// Mock the contracts types
vi.mock("@iara/contracts", () => ({}));

let transport: Awaited<typeof import("./ws-transport")>["transport"];

beforeEach(async () => {
  vi.useFakeTimers();
  MockWebSocket.reset();

  // Reset modules to get a fresh WsTransport instance
  vi.resetModules();

  // Re-apply mocks after module reset
  (globalThis as Record<string, unknown>).WebSocket = MockWebSocket;
  vi.stubGlobal("location", { host: "localhost:3000" });
  vi.stubGlobal("window", {
    desktopBridge: undefined,
    location: { host: "localhost:3000" },
  });

  const mod = await import("./ws-transport");
  transport = mod.transport;
});

afterEach(() => {
  transport.disconnect();
  vi.useRealTimers();
});

describe("WsTransport", () => {
  describe("request", () => {
    it("sends a JSON message and resolves on response", async () => {
      const promise = transport.request(
        "terminal.write" as never,
        {
          terminalId: "t1",
          data: "hello",
        } as never,
      );

      // Wait for init + open
      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      expect(ws.send).toHaveBeenCalledTimes(1);

      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
        id: string;
        method: string;
      };
      expect(sent.method).toBe("terminal.write");

      // Simulate response
      ws.simulateMessage(JSON.stringify({ id: sent.id, result: "ok" }));

      const result = await promise;
      expect(result).toBe("ok");
    });

    it("rejects on error response", async () => {
      const promise = transport.request("terminal.write" as never, {} as never);

      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as { id: string };

      ws.simulateMessage(
        JSON.stringify({ id: sent.id, error: { code: "ERR", message: "Something went wrong" } }),
      );

      await expect(promise).rejects.toThrow("Something went wrong");
    });

    it("times out after default timeout", async () => {
      const promise = transport.request("terminal.write" as never, {} as never);

      await vi.advanceTimersByTimeAsync(0); // init
      await vi.advanceTimersByTimeAsync(30_000); // timeout

      await expect(promise).rejects.toThrow("timed out");
    });

    it("times out after custom timeout", async () => {
      const promise = transport.request("terminal.write" as never, {} as never, {
        timeoutMs: 5000,
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(5000);

      await expect(promise).rejects.toThrow("timed out");
    });
  });

  describe("subscribe", () => {
    it("registers a listener and calls it on push events", async () => {
      const listener = vi.fn();
      transport.subscribe("terminal:data" as never, listener);

      // Trigger init
      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      ws.simulateMessage(
        JSON.stringify({ push: "terminal:data", params: { terminalId: "t1", data: "output" } }),
      );

      expect(listener).toHaveBeenCalledWith({ terminalId: "t1", data: "output" });
    });

    it("returns an unsub function that removes the listener", async () => {
      const listener = vi.fn();
      const unsub = transport.subscribe("terminal:data" as never, listener);

      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      unsub();

      const ws = MockWebSocket.instances[0]!;
      ws.simulateMessage(
        JSON.stringify({ push: "terminal:data", params: { terminalId: "t1", data: "output" } }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners for the same event", async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      transport.subscribe("terminal:data" as never, listener1);
      transport.subscribe("terminal:data" as never, listener2);

      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      ws.simulateMessage(
        JSON.stringify({ push: "terminal:data", params: { terminalId: "t1", data: "x" } }),
      );

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe("queue while disconnected", () => {
    it("queues messages when websocket is not open and flushes on connect", async () => {
      // Patch MockWebSocket so it does NOT auto-fire open
      const origConstructor = MockWebSocket;
      let capturedWs: MockWebSocket | null = null;

      class DelayedWebSocket extends origConstructor {
        constructor(url: string) {
          // Call parent but override readyState before open fires
          super(url);
          this.readyState = 0; // CONNECTING
          capturedWs = this;
        }
      }
      // Suppress the auto-open from the parent constructor's queueMicrotask
      // by overriding fire temporarily
      const origFire = DelayedWebSocket.prototype.fire;
      const suppressOpen = true;
      let allowOpen = false;
      DelayedWebSocket.prototype.fire = function (event: string, data?: { data?: string }) {
        if (event === "open" && suppressOpen && !allowOpen) return;
        origFire.call(this, event, data);
      };
      Object.defineProperty(DelayedWebSocket, "OPEN", { value: 1, writable: false });
      (globalThis as Record<string, unknown>).WebSocket = DelayedWebSocket;

      const promise = transport.request("terminal.write" as never, { data: "queued" } as never);
      await vi.advanceTimersByTimeAsync(0);

      // The WS was created but in CONNECTING state, so message is queued
      expect(capturedWs).not.toBeNull();
      expect(capturedWs!.send).not.toHaveBeenCalled();

      // Now simulate open
      allowOpen = true;
      capturedWs!.readyState = 1;
      capturedWs!.fire("open");

      expect(capturedWs!.send).toHaveBeenCalledTimes(1);

      const sent = JSON.parse(capturedWs!.send.mock.calls[0]![0] as string) as { id: string };
      capturedWs!.simulateMessage(JSON.stringify({ id: sent.id, result: "done" }));

      const result = await promise;
      expect(result).toBe("done");

      (globalThis as Record<string, unknown>).WebSocket = MockWebSocket;
    });
  });

  describe("disconnect", () => {
    it("rejects all pending requests on disconnect", async () => {
      const promise = transport.request("terminal.write" as never, {} as never);
      await vi.advanceTimersByTimeAsync(0);

      transport.disconnect();

      await expect(promise).rejects.toThrow("Transport disconnected");
    });

    it("closes the websocket", async () => {
      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      transport.disconnect();

      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe("reconnect logic", () => {
    it("schedules reconnect on unexpected close", async () => {
      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      const instanceCountBefore = MockWebSocket.instances.length;

      // Simulate unexpected close by directly firing the close event
      // (not via ws.close() which would be caught by our mock)
      (ws as unknown as { readyState: number }).readyState = MockWebSocket.CLOSED;
      ws.fire("close");

      // Advance past first reconnect delay (500ms)
      await vi.advanceTimersByTimeAsync(600);

      expect(MockWebSocket.instances.length).toBeGreaterThan(instanceCountBefore);
    });

    it("does not reconnect on intentional disconnect", async () => {
      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      const instanceCountBefore = MockWebSocket.instances.length;
      transport.disconnect();

      await vi.advanceTimersByTimeAsync(10_000);

      // No new WebSocket should have been created
      expect(MockWebSocket.instances.length).toBe(instanceCountBefore);
    });
  });

  describe("message handling", () => {
    it("ignores malformed JSON", async () => {
      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      // Should not throw
      ws.simulateMessage("not valid json{{{");
    });

    it("ignores responses with unknown ids", async () => {
      await transport.init();
      await vi.advanceTimersByTimeAsync(0);

      const ws = MockWebSocket.instances[0]!;
      // Should not throw
      ws.simulateMessage(JSON.stringify({ id: "unknown-999", result: "data" }));
    });
  });
});
