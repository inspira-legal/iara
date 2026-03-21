import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime, formatAbsoluteTime } from "./format-relative-time";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setNow(ms: number) {
    vi.useFakeTimers();
    vi.setSystemTime(ms);
  }

  const BASE = new Date("2025-01-15T12:00:00Z").getTime();

  it('returns "just now" for less than 1 minute ago', () => {
    setNow(BASE + 30_000); // 30s later
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("just now");
  });

  it('returns "just now" for 0ms difference', () => {
    setNow(BASE);
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("just now");
  });

  it("returns minutes for 1-59 minutes", () => {
    setNow(BASE + 5 * 60_000); // 5 minutes
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("5m");
  });

  it("returns 1m at exactly 1 minute", () => {
    setNow(BASE + 60_000);
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("1m");
  });

  it("returns 59m at 59 minutes", () => {
    setNow(BASE + 59 * 60_000);
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("59m");
  });

  it("returns hours for 1-23 hours", () => {
    setNow(BASE + 3 * 3_600_000); // 3 hours
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("3h");
  });

  it("returns 1h at exactly 1 hour", () => {
    setNow(BASE + 3_600_000);
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("1h");
  });

  it("returns days for 1-6 days", () => {
    setNow(BASE + 3 * 86_400_000); // 3 days
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("3d");
  });

  it("returns 1d at exactly 1 day", () => {
    setNow(BASE + 86_400_000);
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("1d");
  });

  it("returns weeks for 7+ days", () => {
    setNow(BASE + 14 * 86_400_000); // 14 days = 2 weeks
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("2w");
  });

  it("returns 1w at exactly 7 days", () => {
    setNow(BASE + 7 * 86_400_000);
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("1w");
  });

  it('returns "just now" for future dates (negative diff)', () => {
    setNow(BASE - 60_000); // 1 minute in the future
    // diff would be negative, which is < MINUTE
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("just now");
  });

  it("handles boundary between minutes and hours", () => {
    setNow(BASE + 3_600_000 - 1); // 1ms before 1 hour
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("59m");
  });

  it("handles boundary between hours and days", () => {
    setNow(BASE + 86_400_000 - 1); // 1ms before 1 day
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("23h");
  });

  it("handles boundary between days and weeks", () => {
    setNow(BASE + 604_800_000 - 1); // 1ms before 1 week
    expect(formatRelativeTime("2025-01-15T12:00:00Z")).toBe("6d");
  });
});

describe("formatAbsoluteTime", () => {
  it("returns a locale string representation", () => {
    const result = formatAbsoluteTime("2025-01-15T12:00:00Z");
    // Just verify it returns a non-empty string (locale-dependent)
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
