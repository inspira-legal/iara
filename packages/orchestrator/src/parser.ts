import { parse } from "yaml";
import type { EssencialKey, ScriptEntry, ScriptOutputLevel, ServiceDef } from "@iara/contracts";

const ESSENCIAL_KEYS: Set<string> = new Set<EssencialKey>([
  "setup",
  "dev",
  "build",
  "check",
  "test",
  "codegen",
]);

const DEFAULT_TIMEOUT = 30;

/**
 * Normalize a raw script value into a ScriptEntry.
 * Handles: string, string[], { run, output }
 */
export function normalizeScriptEntry(key: string, value: unknown): ScriptEntry {
  const defaultOutput: ScriptOutputLevel = key === "dev" ? "always" : "on-error";

  if (typeof value === "string") {
    return { run: [value], output: defaultOutput };
  }

  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return { run: value as string[], output: defaultOutput };
  }

  if (typeof value === "object" && value !== null && "run" in value) {
    const obj = value as { run: unknown; output?: unknown };
    const run =
      typeof obj.run === "string" ? [obj.run] : Array.isArray(obj.run) ? (obj.run as string[]) : [];
    const output =
      typeof obj.output === "string" && ["always", "on-error", "silent"].includes(obj.output)
        ? (obj.output as ScriptOutputLevel)
        : defaultOutput;
    return { run, output };
  }

  throw new Error(
    `Invalid script entry for "${key}": expected string, string[], or { run, output }`,
  );
}

/**
 * Parse a scripts.yaml file content into an array of ServiceDef.
 */
export function parseScriptsYaml(content: string, repoNames: string[]): ServiceDef[] {
  const raw = parse(content) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return [];

  const repoSet = new Set(repoNames);
  const services: ServiceDef[] = [];

  for (const [name, def] of Object.entries(raw)) {
    if (typeof def !== "object" || def === null) continue;
    const d = def as Record<string, unknown>;

    const dependsOn = Array.isArray(d.dependsOn) ? (d.dependsOn as string[]) : [];

    const timeout = typeof d.timeout === "number" ? d.timeout : DEFAULT_TIMEOUT;

    const essencial: Partial<Record<EssencialKey, ScriptEntry>> = {};
    if (typeof d.essencial === "object" && d.essencial !== null) {
      for (const [k, v] of Object.entries(d.essencial as Record<string, unknown>)) {
        if (ESSENCIAL_KEYS.has(k)) {
          essencial[k as EssencialKey] = normalizeScriptEntry(k, v);
        }
      }
    }

    // Top-level shorthand: essencial keys directly on the service (e.g., `dev: "cmd"`)
    for (const key of ESSENCIAL_KEYS) {
      if (key in d && !(key in essencial)) {
        essencial[key as EssencialKey] = normalizeScriptEntry(key, d[key]);
      }
    }

    const advanced: Record<string, ScriptEntry> = {};
    if (typeof d.advanced === "object" && d.advanced !== null) {
      for (const [k, v] of Object.entries(d.advanced as Record<string, unknown>)) {
        advanced[k] = normalizeScriptEntry(k, v);
      }
    }

    services.push({
      name,
      dependsOn,
      timeout,
      essencial,
      advanced,
      isRepo: repoSet.has(name),
    });
  }

  return services;
}
