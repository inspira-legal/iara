import { describe, it, expect } from "vitest";
import { topologicalSort } from "./supervisor.js";
import type { ResolvedServiceDef } from "@iara/contracts";

function makeResolved(name: string, dependsOn: string[] = []): ResolvedServiceDef {
  return {
    name,
    dependsOn,
    port: null,
    timeout: 30,
    env: {},
    essencial: {},
    advanced: {},
    isRepo: false,
    resolvedPort: 3000,
    resolvedEnv: {},
  };
}

describe("topologicalSort", () => {
  it("sorts services with no deps", () => {
    const services = [makeResolved("a"), makeResolved("b"), makeResolved("c")];
    const sorted = topologicalSort(services);
    expect(sorted.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("puts dependencies first", () => {
    const services = [
      makeResolved("frontend", ["backend"]),
      makeResolved("backend", ["db"]),
      makeResolved("db"),
    ];
    const sorted = topologicalSort(services);
    const names = sorted.map((s) => s.name);
    expect(names.indexOf("db")).toBeLessThan(names.indexOf("backend"));
    expect(names.indexOf("backend")).toBeLessThan(names.indexOf("frontend"));
  });

  it("detects circular dependencies", () => {
    const services = [makeResolved("a", ["b"]), makeResolved("b", ["a"])];
    expect(() => topologicalSort(services)).toThrow("Circular dependency");
  });

  it("handles diamond dependencies", () => {
    const services = [
      makeResolved("app", ["lib-a", "lib-b"]),
      makeResolved("lib-a", ["core"]),
      makeResolved("lib-b", ["core"]),
      makeResolved("core"),
    ];
    const sorted = topologicalSort(services);
    const names = sorted.map((s) => s.name);
    expect(names.indexOf("core")).toBeLessThan(names.indexOf("lib-a"));
    expect(names.indexOf("core")).toBeLessThan(names.indexOf("lib-b"));
    expect(names.indexOf("lib-a")).toBeLessThan(names.indexOf("app"));
    expect(names.indexOf("lib-b")).toBeLessThan(names.indexOf("app"));
  });
});
