import { describe, it, expect } from "vitest";
import { PortAllocator, deriveBasePort } from "./ports.js";
import type { ServiceDef } from "@iara/contracts";

function makeService(name: string, port: number | null = null): ServiceDef {
  return {
    name,
    dependsOn: [],
    port,
    timeout: 30,
    env: {},
    essencial: {},
    advanced: {},
    isRepo: false,
  };
}

describe("deriveBasePort", () => {
  it("returns a deterministic port for the same workspaceId", () => {
    const a = deriveBasePort("proj1:default");
    const b = deriveBasePort("proj1:default");
    expect(a).toBe(b);
  });

  it("returns a port within the expected range", () => {
    const port = deriveBasePort("proj1:default");
    expect(port).toBeGreaterThanOrEqual(3000);
    expect(port).toBeLessThan(4000);
    expect((port - 3000) % 20).toBe(0);
  });
});

describe("PortAllocator", () => {
  it("allocates a base port for a new workspace", () => {
    const allocator = new PortAllocator();
    const port = allocator.allocate("proj1:default");
    expect(port).toBe(deriveBasePort("proj1:default"));
  });

  it("reuses existing allocation", () => {
    const allocator = new PortAllocator();
    const first = allocator.allocate("proj1:default");
    const second = allocator.allocate("proj1:default");
    expect(first).toBe(second);
  });

  it("handles collisions via linear probing", () => {
    const allocator = new PortAllocator();
    // Allocate two different workspaceIds that might collide
    const a = allocator.allocate("ws-a");
    const b = allocator.allocate("ws-b");
    // They should never be the same
    if (deriveBasePort("ws-a") === deriveBasePort("ws-b")) {
      expect(b).toBe(a + 20);
    } else {
      expect(b).toBe(deriveBasePort("ws-b"));
    }
  });

  it("releases a workspace allocation", () => {
    const allocator = new PortAllocator();
    allocator.allocate("proj1:task-1");
    allocator.release("proj1:task-1");
    // After release, re-allocating should derive from hash again
    const port = allocator.allocate("proj1:task-1");
    expect(port).toBe(deriveBasePort("proj1:task-1"));
  });

  it("resolves ports for services", () => {
    const allocator = new PortAllocator();
    const services = [makeService("db", 5432), makeService("backend"), makeService("frontend")];
    const ports = allocator.resolve(services, 3000);
    expect(ports.get("db")).toBe(5432);
    expect(ports.get("backend")).toBe(3000);
    expect(ports.get("frontend")).toBe(3001);
  });

  it("skips over pinned ports when assigning dynamic ports", () => {
    const allocator = new PortAllocator(createMockStore());
    const services = [
      makeService("pinned-svc", 3001),
      makeService("backend"),
      makeService("frontend"),
      makeService("worker"),
    ];
    const ports = allocator.resolve(services, 3000);
    expect(ports.get("pinned-svc")).toBe(3001);
    expect(ports.get("backend")).toBe(3000);
    // 3001 is pinned, so frontend skips to 3002
    expect(ports.get("frontend")).toBe(3002);
    expect(ports.get("worker")).toBe(3003);
  });

  it("pinned ports do not consume offsets", () => {
    const allocator = new PortAllocator();
    const services = [
      makeService("db", 5432),
      makeService("redis", 6379),
      makeService("backend"),
      makeService("frontend"),
    ];
    const ports = allocator.resolve(services, 3000);
    expect(ports.get("db")).toBe(5432);
    expect(ports.get("redis")).toBe(6379);
    expect(ports.get("backend")).toBe(3000);
    expect(ports.get("frontend")).toBe(3001);
  });
});
