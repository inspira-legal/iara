import { gitStatus } from "@iara/shared/git";
import { registerMethod } from "../router.js";

export function registerGitHandlers(): void {
  registerMethod("git.status", async (params) => {
    return gitStatus(params.cwd);
  });
}
