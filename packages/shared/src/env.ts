/** Strip ELECTRON_* and IARA_* vars from process.env to avoid leaking internal state to child processes. */
export function cleanEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !key.startsWith("IARA_") && !key.startsWith("ELECTRON_")) {
      picked[key] = value;
    }
  }
  return picked;
}
