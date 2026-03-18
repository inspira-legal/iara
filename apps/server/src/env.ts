import * as path from "node:path";

export const stateDir =
  process.env.IARA_STATE_DIR ??
  process.argv.find((_, i, a) => a[i - 1] === "--state-dir") ??
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".config", "iara");
