import { describe, expect, it } from "vitest";
import { cleanEnv } from "./env.js";

describe("cleanEnv", () => {
  it("strips IARA_ prefixed vars", () => {
    const env = { PATH: "/usr/bin", IARA_TOKEN: "secret", HOME: "/home/test" };
    const result = cleanEnv(env);
    expect(result).toEqual({ PATH: "/usr/bin", HOME: "/home/test" });
    expect(result).not.toHaveProperty("IARA_TOKEN");
  });

  it("strips ELECTRON_ prefixed vars", () => {
    const env = { PATH: "/usr/bin", ELECTRON_RUN_AS_NODE: "1", HOME: "/home/test" };
    const result = cleanEnv(env);
    expect(result).toEqual({ PATH: "/usr/bin", HOME: "/home/test" });
    expect(result).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
  });

  it("strips both IARA_ and ELECTRON_ vars", () => {
    const env = {
      PATH: "/usr/bin",
      IARA_FOO: "a",
      ELECTRON_BAR: "b",
      SHELL: "/bin/zsh",
    };
    const result = cleanEnv(env);
    expect(result).toEqual({ PATH: "/usr/bin", SHELL: "/bin/zsh" });
  });

  it("excludes entries with undefined values", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin", MISSING: undefined, HOME: "/home" };
    const result = cleanEnv(env);
    expect(result).toEqual({ PATH: "/usr/bin", HOME: "/home" });
    expect(result).not.toHaveProperty("MISSING");
  });

  it("returns empty object for empty env", () => {
    expect(cleanEnv({})).toEqual({});
  });

  it("uses process.env as default when no argument provided", () => {
    const result = cleanEnv();
    // Should not have any IARA_ or ELECTRON_ keys
    for (const key of Object.keys(result)) {
      expect(key.startsWith("IARA_")).toBe(false);
      expect(key.startsWith("ELECTRON_")).toBe(false);
    }
  });
});
