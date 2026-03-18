import { registerMethod } from "../router.js";

const isDev = process.env.NODE_ENV !== "production";

export function registerAppHandlers(): void {
  registerMethod("app.info", async () => {
    return {
      version: "0.0.1",
      platform: process.platform,
      isDev,
    };
  });
}
