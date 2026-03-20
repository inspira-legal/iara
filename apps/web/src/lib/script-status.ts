import type { ScriptStatus } from "@iara/contracts";

export function isScriptActive(s: ScriptStatus): boolean {
  return s.health === "starting" || s.health === "healthy" || s.health === "running";
}

export function isScriptUnhealthy(s: ScriptStatus): boolean {
  return s.health === "failed" || s.health === "unhealthy";
}
