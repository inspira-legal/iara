import { readFileSync } from "node:fs";

export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Resolve `catalog:` specs to concrete versions using the workspace catalog.
 * Filters out `workspace:*` packages (those are inlined by tsdown).
 * Filters out `electron` (handled separately by electron-builder).
 */
export function resolveProductionDeps(
  deps: Record<string, string> | undefined,
  catalog: Record<string, string>,
  label: string,
): Record<string, string> {
  if (!deps) return {};

  const resolved: Record<string, string> = {};
  for (const [name, spec] of Object.entries(deps)) {
    if (name === "electron") continue;
    if (spec.startsWith("workspace:")) continue;

    if (spec.startsWith("catalog:")) {
      const catalogKey = spec.slice("catalog:".length).trim();
      const lookupKey = catalogKey.length > 0 ? catalogKey : name;
      const version = catalog[lookupKey];
      if (!version) {
        throw new Error(
          `Cannot resolve '${spec}' for ${label} dep '${name}'. Key '${lookupKey}' not in catalog.`,
        );
      }
      resolved[name] = version;
    } else {
      resolved[name] = spec;
    }
  }
  return resolved;
}
