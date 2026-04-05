import { getStateDir } from "@iara/shared/platform";

export const stateDir =
  process.env.IARA_STATE_DIR ??
  process.argv.find((_, i, a) => a[i - 1] === "--state-dir") ??
  getStateDir("iara");
