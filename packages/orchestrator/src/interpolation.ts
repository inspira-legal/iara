const PORT_REF_PATTERN = /\{([\w-]+)\.PORT\}/g;

/**
 * Resolve all `{service.PORT}` references in a template string.
 * Throws if a referenced service is not found in the ports map.
 */
export function interpolate(template: string, ports: Map<string, number>): string {
  return template.replace(PORT_REF_PATTERN, (match, serviceName: string) => {
    const port = ports.get(serviceName);
    if (port === undefined) {
      throw new Error(
        `Unknown service "${serviceName}" referenced in "${match}". Available services: ${[...ports.keys()].join(", ")}`,
      );
    }
    return String(port);
  });
}

/**
 * Interpolate all values in an env record.
 */
export function interpolateEnv(
  env: Record<string, string>,
  ports: Map<string, number>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    result[key] = interpolate(value, ports);
  }
  return result;
}

/**
 * Interpolate all commands in a run array.
 */
export function interpolateCommands(commands: string[], ports: Map<string, number>): string[] {
  return commands.map((cmd) => interpolate(cmd, ports));
}
