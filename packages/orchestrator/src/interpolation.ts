const ENV_REF_PATTERN = /\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * Replace `{VAR}` references in a string with values from the env record.
 * Unmatched variables are left as-is.
 */
export function interpolate(template: string, env: Record<string, string>): string {
  return template.replace(ENV_REF_PATTERN, (match, varName: string) => {
    const value = env[varName];
    return value !== undefined ? value : match;
  });
}
