import { describe, it, expect } from "vitest";
import { interpolate } from "./interpolation.js";

describe("interpolate", () => {
  it("replaces {VAR} with env value", () => {
    expect(interpolate("--port {PORT}", { PORT: "3101" })).toBe("--port 3101");
  });

  it("replaces multiple refs", () => {
    const env = { PORT: "3101", DATABASE_URL: "postgres://localhost/db" };
    expect(interpolate("--port {PORT} --db {DATABASE_URL}", env)).toBe(
      "--port 3101 --db postgres://localhost/db",
    );
  });

  it("leaves unmatched refs as-is", () => {
    expect(interpolate("{HOME}/bin --port {PORT}", { PORT: "3101" })).toBe(
      "{HOME}/bin --port 3101",
    );
  });

  it("does not touch $VAR shell syntax", () => {
    expect(interpolate("$PORT --port {PORT}", { PORT: "3101" })).toBe("$PORT --port 3101");
  });

  it("returns string unchanged if no refs", () => {
    expect(interpolate("pnpm build", { PORT: "3101" })).toBe("pnpm build");
  });
});
