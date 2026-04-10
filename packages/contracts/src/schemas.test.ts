import { describe, it, expect } from "vitest";
import { SettingsFileSchema } from "./schemas.js";

describe("SettingsFileSchema", () => {
  it("validates an empty settings object", () => {
    const result = SettingsFileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates key-value settings", () => {
    const result = SettingsFileSchema.parse({
      theme: "dark",
      "ports.next_base": "3020",
    });
    expect(result.theme).toBe("dark");
    expect(result["ports.next_base"]).toBe("3020");
  });

  it("rejects non-string values", () => {
    const result = SettingsFileSchema.safeParse({ count: 42 });
    expect(result.success).toBe(false);
  });
});
