import { describe, it, expect } from "vitest";
import { PortAllocator } from "./ports.js";
import type { PortStore } from "./ports.js";
import type { ServiceDef } from "@iara/contracts";

function createMockStore(): PortStore {
  const data = new Map<string, number>();
  let nextBase = 3000;

  return {
    get(projectId, workspace) {
      return data.get(`${projectId}:${workspace}`) ?? null;
    },
    set(projectId, workspace, basePort) {
      data.set(`${projectId}:${workspace}`, basePort);
    },
    remove(projectId, workspace) {
      data.delete(`${projectId}:${workspace}`);
    },
    getNextBase: () => nextBase,
    setNextBase: (port) => {
      nextBase = port;
    },
  };
}

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

describe("PortAllocator", () => {
  it("allocates a base port for a new workspace", () => {
    const allocator = new PortAllocator(createMockStore());
    const port = allocator.allocate("proj1", "default");
    expect(port).toBe(3000);
  });

  it("reuses existing allocation", () => {
    const allocator = new PortAllocator(createMockStore());
    const first = allocator.allocate("proj1", "default");
    const second = allocator.allocate("proj1", "default");
    expect(first).toBe(second);
  });

  it("increments by 20 for each new workspace", () => {
    const allocator = new PortAllocator(createMockStore());
    const a = allocator.allocate("proj1", "default");
    const b = allocator.allocate("proj1", "task-1");
    const c = allocator.allocate("proj2", "default");
    expect(a).toBe(3000);
    expect(b).toBe(3020);
    expect(c).toBe(3040);
  });

  it("releases a workspace allocation", () => {
    const store = createMockStore();
    const allocator = new PortAllocator(store);
    allocator.allocate("proj1", "task-1");
    allocator.release("proj1", "task-1");
    expect(store.get("proj1", "task-1")).toBeNull();
  });

  it("resolves ports for services", () => {
    const allocator = new PortAllocator(createMockStore());
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
    const allocator = new PortAllocator(createMockStore());
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
