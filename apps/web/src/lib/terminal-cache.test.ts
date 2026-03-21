import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    loadAddon = vi.fn();
    onScroll = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    registerLinkProvider = vi.fn().mockReturnValue({ dispose: vi.fn() });
    buffer = { active: { viewportY: 0, baseY: 0 } };
  }
  return { Terminal: MockTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock("@xterm/addon-clipboard", () => {
  class MockClipboardAddon {
    activate() {}
  }
  return { ClipboardAddon: MockClipboardAddon };
});

vi.mock("@xterm/addon-web-links", () => {
  class MockWebLinksAddon {
    activate() {}
  }
  return { WebLinksAddon: MockWebLinksAddon };
});

vi.mock("@xterm/addon-web-fonts", () => {
  class MockWebFontsAddon {
    loadFonts = vi.fn().mockResolvedValue(undefined);
  }
  return { WebFontsAddon: MockWebFontsAddon };
});

vi.mock("./ws-transport.js", () => ({
  transport: {
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    request: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./terminal-keybindings.js", () => ({
  setupTerminalKeybindings: vi.fn().mockReturnValue({ onModChange: null }),
}));

vi.mock("./terminal-links.js", () => ({
  findFileLinks: vi.fn().mockReturnValue([]),
  isRelativePath: vi.fn().mockReturnValue(false),
  parseFilePath: vi.fn().mockReturnValue({}),
}));

vi.mock("./clipboard.js", () => ({
  writeClipboard: vi.fn(),
  readClipboard: vi.fn().mockResolvedValue(""),
}));

const { getOrCreateTerminal, destroyTerminal, getCachedTerminal } =
  await import("./terminal-cache");

describe("terminal-cache", () => {
  beforeEach(() => {
    // Clean up any cached terminals from previous tests
    for (const id of ["test-1", "test-2"]) {
      if (getCachedTerminal(id)) destroyTerminal(id);
    }
  });

  it("creates a new terminal on first call", () => {
    const result = getOrCreateTerminal("test-1");
    expect(result).toBeDefined();
    expect(result.terminalId).toBe("test-1");
    expect(result.term).toBeDefined();
    expect(result.fitAddon).toBeDefined();
    destroyTerminal("test-1");
  });

  it("returns the same cached terminal on subsequent calls", () => {
    const first = getOrCreateTerminal("test-1");
    const second = getOrCreateTerminal("test-1");
    expect(first).toBe(second);
    destroyTerminal("test-1");
  });

  it("getCachedTerminal returns undefined for missing entries", () => {
    expect(getCachedTerminal("nonexistent")).toBeUndefined();
  });

  it("getCachedTerminal returns the cached terminal", () => {
    const created = getOrCreateTerminal("test-1");
    const cached = getCachedTerminal("test-1");
    expect(cached).toBe(created);
    destroyTerminal("test-1");
  });

  it("destroyTerminal removes from cache and disposes", () => {
    const created = getOrCreateTerminal("test-1");
    const disposeSpy = vi.spyOn(created.term, "dispose");

    destroyTerminal("test-1");
    expect(getCachedTerminal("test-1")).toBeUndefined();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it("destroyTerminal is a no-op for nonexistent terminals", () => {
    destroyTerminal("nonexistent");
  });

  it("caches different terminals separately", () => {
    const t1 = getOrCreateTerminal("test-1");
    const t2 = getOrCreateTerminal("test-2");
    expect(t1).not.toBe(t2);
    expect(t1.terminalId).toBe("test-1");
    expect(t2.terminalId).toBe("test-2");
    destroyTerminal("test-1");
    destroyTerminal("test-2");
  });
});
