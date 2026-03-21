import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the nativeApi module
vi.mock("~/nativeApi", () => ({
  desktopBridge: null as unknown,
}));

import * as nativeApiModule from "~/nativeApi";
import { writeClipboard, readClipboard } from "./clipboard";

describe("writeClipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset desktopBridge to null
    (nativeApiModule as { desktopBridge: unknown }).desktopBridge = null;
  });

  it("uses navigator.clipboard.writeText when no desktop bridge", () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock, readText: vi.fn() },
      writable: true,
      configurable: true,
    });

    writeClipboard("hello");
    expect(writeTextMock).toHaveBeenCalledWith("hello");
  });

  it("uses desktopBridge.clipboardWrite when available", () => {
    const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    (nativeApiModule as { desktopBridge: unknown }).desktopBridge = {
      clipboardWrite: clipboardWriteMock,
    };

    writeClipboard("hello");
    expect(clipboardWriteMock).toHaveBeenCalledWith("hello");
  });
});

describe("readClipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (nativeApiModule as { desktopBridge: unknown }).desktopBridge = null;
  });

  it("uses navigator.clipboard.readText when no desktop bridge", async () => {
    const readTextMock = vi.fn().mockResolvedValue("pasted text");
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: readTextMock, writeText: vi.fn() },
      writable: true,
      configurable: true,
    });

    const result = await readClipboard();
    expect(result).toBe("pasted text");
    expect(readTextMock).toHaveBeenCalled();
  });

  it("uses desktopBridge.clipboardRead when available", async () => {
    const clipboardReadMock = vi.fn().mockResolvedValue("native text");
    (nativeApiModule as { desktopBridge: unknown }).desktopBridge = {
      clipboardRead: clipboardReadMock,
    };

    const result = await readClipboard();
    expect(result).toBe("native text");
    expect(clipboardReadMock).toHaveBeenCalled();
  });
});
