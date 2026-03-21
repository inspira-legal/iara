import { describe, it, expect } from "vitest";
import { isScriptActive, isScriptUnhealthy } from "./script-status";
import type { ScriptStatus } from "@iara/contracts";

function makeStatus(health: ScriptStatus["health"]): ScriptStatus {
  return {
    scriptId: "test:svc:script",
    projectId: "proj-1",
    workspace: "ws-1",
    service: "svc",
    script: "script",
    pid: null,
    health,
    exitCode: null,
  };
}

const ALL_HEALTH_VALUES: ScriptStatus["health"][] = [
  "starting",
  "healthy",
  "unhealthy",
  "stopped",
  "running",
  "success",
  "failed",
];

describe("isScriptActive", () => {
  it('returns true for "starting"', () => {
    expect(isScriptActive(makeStatus("starting"))).toBe(true);
  });

  it('returns true for "healthy"', () => {
    expect(isScriptActive(makeStatus("healthy"))).toBe(true);
  });

  it('returns true for "running"', () => {
    expect(isScriptActive(makeStatus("running"))).toBe(true);
  });

  it('returns false for "stopped"', () => {
    expect(isScriptActive(makeStatus("stopped"))).toBe(false);
  });

  it('returns false for "failed"', () => {
    expect(isScriptActive(makeStatus("failed"))).toBe(false);
  });

  it('returns false for "unhealthy"', () => {
    expect(isScriptActive(makeStatus("unhealthy"))).toBe(false);
  });

  it('returns false for "success"', () => {
    expect(isScriptActive(makeStatus("success"))).toBe(false);
  });

  it("active statuses are exactly starting, healthy, running", () => {
    const activeSet = ALL_HEALTH_VALUES.filter((h) => isScriptActive(makeStatus(h)));
    expect(activeSet).toEqual(["starting", "healthy", "running"]);
  });
});

describe("isScriptUnhealthy", () => {
  it('returns true for "failed"', () => {
    expect(isScriptUnhealthy(makeStatus("failed"))).toBe(true);
  });

  it('returns true for "unhealthy"', () => {
    expect(isScriptUnhealthy(makeStatus("unhealthy"))).toBe(true);
  });

  it('returns false for "starting"', () => {
    expect(isScriptUnhealthy(makeStatus("starting"))).toBe(false);
  });

  it('returns false for "healthy"', () => {
    expect(isScriptUnhealthy(makeStatus("healthy"))).toBe(false);
  });

  it('returns false for "running"', () => {
    expect(isScriptUnhealthy(makeStatus("running"))).toBe(false);
  });

  it('returns false for "stopped"', () => {
    expect(isScriptUnhealthy(makeStatus("stopped"))).toBe(false);
  });

  it('returns false for "success"', () => {
    expect(isScriptUnhealthy(makeStatus("success"))).toBe(false);
  });

  it("unhealthy statuses are exactly failed, unhealthy", () => {
    const unhealthySet = ALL_HEALTH_VALUES.filter((h) => isScriptUnhealthy(makeStatus(h)));
    expect(unhealthySet).toEqual(["unhealthy", "failed"]);
  });
});
