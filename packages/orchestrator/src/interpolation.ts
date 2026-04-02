/** Context for interpolating a single service's commands/env values. */
export interface InterpolationContext {
  /** This service's resolved config (port is always a number after resolution). */
  config: { port: number };
  /** Flat env vars for this service. */
  env: Record<string, string>;
  /** All services' resolved configs, keyed by service name (for cross-refs). */
  allConfigs: Record<string, { port: number }>;
}

/**
 * Unified pattern matching:
 *  - {config.port}           → this service's port
 *  - {service.config.port}   → another service's port
 *  - {UPPER_VAR}             → env variable lookup
 *  - {IARA_PORT}             → deprecated alias for {config.port}
 */
const REF_PATTERN = /\{([^}]+)\}/g;

/**
 * Replace `{...}` references in a template string.
 * Unmatched references are left as-is.
 */
export function interpolate(template: string, ctx: InterpolationContext): string {
  return template.replace(REF_PATTERN, (match, ref: string) => {
    // {config.port} → own port
    if (ref === "config.port") {
      return String(ctx.config.port);
    }

    // {service.config.port} → cross-service port
    const crossMatch = ref.match(/^([a-zA-Z0-9_-]+)\.config\.port$/);
    if (crossMatch) {
      const svcConfig = ctx.allConfigs[crossMatch[1]!];
      return svcConfig ? String(svcConfig.port) : match;
    }

    // {IARA_PORT} → deprecated alias for {config.port}
    if (ref === "IARA_PORT") {
      return String(ctx.config.port);
    }

    // {UPPER_CASE_VAR} → env lookup
    if (/^[A-Z_][A-Z0-9_]*$/.test(ref)) {
      const value = ctx.env[ref];
      return value !== undefined ? value : match;
    }

    return match;
  });
}

// ---------------------------------------------------------------------------
// Legacy overload — kept for backward compatibility during migration.
// Callers passing a flat Record<string, string> get the old behavior.
// ---------------------------------------------------------------------------

export function interpolateLegacy(template: string, env: Record<string, string>): string {
  return template.replace(/\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName: string) => {
    const value = env[varName];
    return value !== undefined ? value : match;
  });
}
