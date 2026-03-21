import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Capture callbacks registered by the module under test
// ---------------------------------------------------------------------------

let capturedOnScroll: (() => void) | null = null;
let capturedLinkProvider: {
  provideLinks: (lineNumber: number, callback: Function) => void;
} | null = null;
let capturedSubscribeCallback: ((data: { terminalId: string; data: string }) => void) | null = null;
let capturedWebLinkHandler: ((event: MouseEvent, uri: string) => void) | null = null;

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    loadAddon = vi.fn();
    onScroll = vi.fn((cb: () => void) => {
      capturedOnScroll = cb;
    });
    write = vi.fn((_data: string, cb?: () => void) => {
      if (cb) cb();
    });
    dispose = vi.fn();
    scrollToLine = vi.fn();
    registerLinkProvider = vi.fn((provider: unknown) => {
      capturedLinkProvider = provider as typeof capturedLinkProvider;
      return { dispose: vi.fn() };
    });
    buffer = {
      active: {
        viewportY: 0,
        baseY: 0,
        getLine: vi.fn((row: number) => {
          if (row === 0)
            return { isWrapped: false, translateToString: () => "hello /tmp/test.txt world" };
          if (row === 1) return { isWrapped: false, translateToString: () => "second line" };
          return null;
        }),
      },
    };
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
    handler: ((event: MouseEvent, uri: string) => void) | null = null;
    constructor(handler?: (event: MouseEvent, uri: string) => void) {
      if (handler) {
        capturedWebLinkHandler = handler;
        this.handler = handler;
      }
    }
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

const mockTransport = {
  subscribe: vi.fn((_event: string, cb: (...args: unknown[]) => void) => {
    if (_event === "terminal:data") {
      capturedSubscribeCallback = cb as typeof capturedSubscribeCallback;
    }
    return vi.fn();
  }),
  request: vi.fn().mockResolvedValue(undefined),
};

vi.mock("./ws-transport.js", () => ({
  transport: mockTransport,
}));

vi.mock("./terminal-keybindings.js", () => ({
  setupTerminalKeybindings: vi.fn().mockReturnValue({ onModChange: null }),
}));

const mockFindFileLinks = vi.fn().mockReturnValue([]);
const mockIsRelativePath = vi.fn().mockReturnValue(false);
const mockParseFilePath = vi.fn().mockReturnValue({});

vi.mock("./terminal-links.js", () => ({
  findFileLinks: (...args: unknown[]) => mockFindFileLinks(...args),
  isRelativePath: (...args: unknown[]) => mockIsRelativePath(...args),
  parseFilePath: (...args: unknown[]) => mockParseFilePath(...args),
}));

vi.mock("./clipboard.js", () => ({
  writeClipboard: vi.fn(),
  readClipboard: vi.fn().mockResolvedValue(""),
}));

const { getOrCreateTerminal, destroyTerminal, getCachedTerminal } =
  await import("./terminal-cache");

describe("terminal-cache", () => {
  beforeEach(() => {
    capturedOnScroll = null;
    capturedLinkProvider = null;
    capturedSubscribeCallback = null;
    capturedWebLinkHandler = null;
    mockFindFileLinks.mockReturnValue([]);
    mockIsRelativePath.mockReturnValue(false);
    mockParseFilePath.mockReturnValue({});
    mockTransport.request.mockResolvedValue(undefined);
    // Clean up any cached terminals from previous tests
    for (const id of ["test-1", "test-2", "test-scroll", "test-data", "test-links", "test-web"]) {
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

  // -------------------------------------------------------------------------
  // onScroll callback
  // -------------------------------------------------------------------------

  describe("onScroll handler", () => {
    it("tracks userScrolledUp when viewportY < baseY", () => {
      const cached = getOrCreateTerminal("test-scroll");
      expect(capturedOnScroll).toBeDefined();

      // Simulate user scrolling up: viewportY < baseY
      (cached.term.buffer.active as any).viewportY = 5;
      (cached.term.buffer.active as any).baseY = 10;
      capturedOnScroll!();

      // Now send data — should preserve scroll position
      expect(capturedSubscribeCallback).toBeDefined();
      capturedSubscribeCallback!({ terminalId: "test-scroll", data: "hello" });
      expect(cached.term.write).toHaveBeenCalled();
      destroyTerminal("test-scroll");
    });

    it("detects user is not scrolled up when viewportY >= baseY", () => {
      const cached = getOrCreateTerminal("test-scroll");
      expect(capturedOnScroll).toBeDefined();

      // viewportY equals baseY — not scrolled up
      (cached.term.buffer.active as any).viewportY = 10;
      (cached.term.buffer.active as any).baseY = 10;
      capturedOnScroll!();

      // Data arrives — should write normally (not scroll-preserving)
      capturedSubscribeCallback!({ terminalId: "test-scroll", data: "hello" });
      expect(cached.term.write).toHaveBeenCalledWith("hello");
      destroyTerminal("test-scroll");
    });
  });

  // -------------------------------------------------------------------------
  // terminal:data subscription
  // -------------------------------------------------------------------------

  describe("terminal:data subscription", () => {
    it("ignores data for other terminals", () => {
      const cached = getOrCreateTerminal("test-data");
      expect(capturedSubscribeCallback).toBeDefined();

      capturedSubscribeCallback!({ terminalId: "other-terminal", data: "hello" });
      expect(cached.term.write).not.toHaveBeenCalled();
      destroyTerminal("test-data");
    });

    it("writes data for matching terminal when not scrolled up", () => {
      const cached = getOrCreateTerminal("test-data");

      capturedSubscribeCallback!({ terminalId: "test-data", data: "hello" });
      expect(cached.term.write).toHaveBeenCalledWith("hello");
      destroyTerminal("test-data");
    });

    it("preserves scroll position when user is scrolled up", () => {
      const cached = getOrCreateTerminal("test-data");

      // Mark as scrolled up
      (cached.term.buffer.active as any).viewportY = 5;
      (cached.term.buffer.active as any).baseY = 10;
      capturedOnScroll!();

      // Send data — should use the scroll-preserving write path
      capturedSubscribeCallback!({ terminalId: "test-data", data: "more data" });

      // write is called with data and a callback
      expect(cached.term.write).toHaveBeenCalledWith("more data", expect.any(Function));
      destroyTerminal("test-data");
    });

    it("restores scroll position when baseY changes during write", () => {
      const cached = getOrCreateTerminal("test-data");

      // Mark as scrolled up
      (cached.term.buffer.active as any).viewportY = 5;
      (cached.term.buffer.active as any).baseY = 10;
      capturedOnScroll!();

      // Override write to simulate baseY changing during the write
      cached.term.write = vi.fn((_data: string, cb?: () => void) => {
        // Simulate new data pushing baseY up
        (cached.term.buffer.active as any).baseY = 12;
        // viewportY may get moved by xterm
        (cached.term.buffer.active as any).viewportY = 7;
        if (cb) cb();
      });

      capturedSubscribeCallback!({ terminalId: "test-data", data: "new data" });

      // delta = 12-10 = 2, viewportY(7) !== savedViewportY(5), so scrollToLine(5+2=7)
      expect(cached.term.scrollToLine).toHaveBeenCalledWith(7);
      destroyTerminal("test-data");
    });

    it("does not call scrollToLine when delta is 0", () => {
      const cached = getOrCreateTerminal("test-data");

      // Mark as scrolled up
      (cached.term.buffer.active as any).viewportY = 5;
      (cached.term.buffer.active as any).baseY = 10;
      capturedOnScroll!();

      // Override write where baseY doesn't change
      cached.term.write = vi.fn((_data: string, cb?: () => void) => {
        // baseY stays the same
        if (cb) cb();
      });

      capturedSubscribeCallback!({ terminalId: "test-data", data: "same" });

      // delta = 0 so scrollToLine should not be called
      expect(cached.term.scrollToLine).not.toHaveBeenCalled();
      destroyTerminal("test-data");
    });

    it("does not call scrollToLine when viewportY matches savedViewportY", () => {
      const cached = getOrCreateTerminal("test-data");

      // Mark as scrolled up
      (cached.term.buffer.active as any).viewportY = 5;
      (cached.term.buffer.active as any).baseY = 10;
      capturedOnScroll!();

      // Override write where baseY changes but viewportY matches saved
      cached.term.write = vi.fn((_data: string, cb?: () => void) => {
        (cached.term.buffer.active as any).baseY = 12;
        // viewportY stays at saved value (5)
        (cached.term.buffer.active as any).viewportY = 5;
        if (cb) cb();
      });

      capturedSubscribeCallback!({ terminalId: "test-data", data: "data" });

      // delta > 0 but viewportY === savedViewportY, so no scrollToLine
      expect(cached.term.scrollToLine).not.toHaveBeenCalled();
      destroyTerminal("test-data");
    });
  });

  // -------------------------------------------------------------------------
  // Link provider
  // -------------------------------------------------------------------------

  describe("link provider", () => {
    it("calls callback with undefined when no links found", () => {
      getOrCreateTerminal("test-links");
      expect(capturedLinkProvider).toBeDefined();

      const callback = vi.fn();
      mockFindFileLinks.mockReturnValue([]);
      capturedLinkProvider!.provideLinks(1, callback);

      expect(callback).toHaveBeenCalledWith(undefined);
      destroyTerminal("test-links");
    });

    it("provides links with correct range when links are found", () => {
      getOrCreateTerminal("test-links");
      expect(capturedLinkProvider).toBeDefined();

      mockFindFileLinks.mockReturnValue([{ startIndex: 6, length: 14, text: "/tmp/test.txt" }]);

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            text: "/tmp/test.txt",
            range: expect.objectContaining({
              start: expect.objectContaining({ x: 7, y: 1 }),
              end: expect.objectContaining({ x: 21, y: 1 }),
            }),
          }),
        ]),
      );
      destroyTerminal("test-links");
    });

    it("link hover adds decoration and leave removes it", () => {
      getOrCreateTerminal("test-links");

      mockFindFileLinks.mockReturnValue([{ startIndex: 0, length: 5, text: "/test" }]);

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      const link = callback.mock.calls[0]![0]![0];
      expect(link.decorations.underline).toBe(false);
      expect(link.decorations.pointerCursor).toBe(false);

      // Hover
      link.hover();
      expect(link.decorations.underline).toBe(false); // modHeld is false
      expect(link.decorations.pointerCursor).toBe(false);

      // Leave
      link.leave();
      expect(link.decorations.underline).toBe(false);
      expect(link.decorations.pointerCursor).toBe(false);

      destroyTerminal("test-links");
    });

    it("link activate with absolute path opens file without cwd", () => {
      getOrCreateTerminal("test-links");

      mockFindFileLinks.mockReturnValue([{ startIndex: 0, length: 10, text: "/tmp/file" }]);
      mockIsRelativePath.mockReturnValue(false);
      mockParseFilePath.mockReturnValue({ filePath: "/tmp/file" });

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      const link = callback.mock.calls[0]![0]![0];
      // Activate with ctrlKey
      link.activate({ ctrlKey: true, metaKey: false } as MouseEvent);

      expect(mockTransport.request).toHaveBeenCalledWith("files.open", { filePath: "/tmp/file" });
      destroyTerminal("test-links");
    });

    it("link activate with relative path fetches cwd first", async () => {
      getOrCreateTerminal("test-links");

      mockFindFileLinks.mockReturnValue([{ startIndex: 0, length: 10, text: "./file.ts" }]);
      mockIsRelativePath.mockReturnValue(true);
      mockParseFilePath.mockReturnValue({ filePath: "/resolved/file.ts" });
      mockTransport.request.mockResolvedValue("/some/cwd");

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      const link = callback.mock.calls[0]![0]![0];
      link.activate({ ctrlKey: true, metaKey: false } as MouseEvent);

      // Wait for async resolution
      await vi.waitFor(() => {
        expect(mockTransport.request).toHaveBeenCalledWith("terminal.getCwd", {
          terminalId: "test-links",
        });
      });
      destroyTerminal("test-links");
    });

    it("link activate does nothing without ctrl/meta key", () => {
      getOrCreateTerminal("test-links");

      mockFindFileLinks.mockReturnValue([{ startIndex: 0, length: 5, text: "/test" }]);
      mockTransport.request.mockClear();

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      const link = callback.mock.calls[0]![0]![0];
      link.activate({ ctrlKey: false, metaKey: false } as MouseEvent);

      // Should not have called any request (no files.open, no terminal.getCwd)
      expect(mockTransport.request).not.toHaveBeenCalled();
      destroyTerminal("test-links");
    });

    it("link activate with relative path falls back when getCwd fails", async () => {
      getOrCreateTerminal("test-links");

      mockFindFileLinks.mockReturnValue([{ startIndex: 0, length: 10, text: "./file.ts" }]);
      mockIsRelativePath.mockReturnValue(true);
      mockParseFilePath.mockReturnValue({ filePath: "./file.ts" });

      // getCwd rejects
      mockTransport.request.mockRejectedValueOnce(new Error("no cwd")).mockResolvedValue(undefined);

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      const link = callback.mock.calls[0]![0]![0];
      link.activate({ ctrlKey: true, metaKey: false } as MouseEvent);

      // Wait for the fallback path
      await vi.waitFor(() => {
        expect(mockTransport.request).toHaveBeenCalledWith("files.open", expect.anything());
      });
      destroyTerminal("test-links");
    });

    it("provideLinks handles wrapped lines", () => {
      const cached = getOrCreateTerminal("test-links");

      // Set up buffer with wrapped lines
      (cached.term.buffer.active as any).getLine = vi.fn((row: number) => {
        if (row === 0) return { isWrapped: false, translateToString: () => "start of line " };
        if (row === 1) return { isWrapped: true, translateToString: () => "/tmp/file.txt end" };
        return null;
      });

      mockFindFileLinks.mockReturnValue([{ startIndex: 14, length: 13, text: "/tmp/file.txt" }]);

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(2, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            text: "/tmp/file.txt",
          }),
        ]),
      );
      destroyTerminal("test-links");
    });

    it("offsetToPos falls through to last row when offset exceeds all rows", () => {
      const cached = getOrCreateTerminal("test-links");

      // Single short row
      (cached.term.buffer.active as any).getLine = vi.fn((row: number) => {
        if (row === 0) return { isWrapped: false, translateToString: () => "short" };
        return null;
      });

      // Link at offset that exceeds the row width
      mockFindFileLinks.mockReturnValue([{ startIndex: 100, length: 5, text: "/test" }]);

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      // Should still return links (with fallback position)
      expect(callback).toHaveBeenCalledWith(expect.any(Array));
      destroyTerminal("test-links");
    });
  });

  // -------------------------------------------------------------------------
  // WebLinksAddon handler
  // -------------------------------------------------------------------------

  describe("web links handler", () => {
    beforeEach(() => {
      // Ensure window.open is available in test env
      if (typeof globalThis.window === "undefined") {
        (globalThis as Record<string, unknown>).window = {};
      }
      if (typeof (globalThis as unknown as Record<string, unknown>).window === "object") {
        (globalThis.window as unknown as Record<string, unknown>).open = vi.fn();
      }
    });

    it("opens URL on ctrl+click", () => {
      getOrCreateTerminal("test-web");
      expect(capturedWebLinkHandler).toBeDefined();

      capturedWebLinkHandler!(
        { ctrlKey: true, metaKey: false } as MouseEvent,
        "https://example.com",
      );
      expect(globalThis.window.open).toHaveBeenCalledWith(
        "https://example.com",
        "_blank",
        "noopener",
      );
      destroyTerminal("test-web");
    });

    it("opens URL on meta+click", () => {
      getOrCreateTerminal("test-web");

      capturedWebLinkHandler!(
        { ctrlKey: false, metaKey: true } as MouseEvent,
        "https://example.com",
      );
      expect(globalThis.window.open).toHaveBeenCalledWith(
        "https://example.com",
        "_blank",
        "noopener",
      );
      destroyTerminal("test-web");
    });

    it("does not open URL without ctrl/meta", () => {
      getOrCreateTerminal("test-web");

      capturedWebLinkHandler!(
        { ctrlKey: false, metaKey: false } as MouseEvent,
        "https://example.com",
      );
      expect(globalThis.window.open).not.toHaveBeenCalled();
      destroyTerminal("test-web");
    });
  });

  // -------------------------------------------------------------------------
  // setModHeld (via keybindingHandlers.onModChange)
  // -------------------------------------------------------------------------

  describe("setModHeld via keybindingHandlers", () => {
    it("updates decorations when mod key is held during hover", () => {
      const cached = getOrCreateTerminal("test-links");

      mockFindFileLinks.mockReturnValue([{ startIndex: 0, length: 5, text: "/test" }]);

      const callback = vi.fn();
      capturedLinkProvider!.provideLinks(1, callback);

      const link = callback.mock.calls[0]![0]![0];

      // Hover to add to activeDecorations
      link.hover();

      // Simulate mod key press via onModChange
      cached.keybindingHandlers.onModChange!(true);

      expect(link.decorations.underline).toBe(true);
      expect(link.decorations.pointerCursor).toBe(true);

      // Release mod key
      cached.keybindingHandlers.onModChange!(false);

      expect(link.decorations.underline).toBe(false);
      expect(link.decorations.pointerCursor).toBe(false);

      // Leave — remove from activeDecorations
      link.leave();

      destroyTerminal("test-links");
    });

    it("setModHeld is a no-op when called with the same value", () => {
      const cached = getOrCreateTerminal("test-links");

      // Call twice with true — second should be no-op (early return)
      cached.keybindingHandlers.onModChange!(true);
      cached.keybindingHandlers.onModChange!(true); // should return early

      // Reset
      cached.keybindingHandlers.onModChange!(false);
      cached.keybindingHandlers.onModChange!(false); // should return early

      destroyTerminal("test-links");
    });
  });
});
