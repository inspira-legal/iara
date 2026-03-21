import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "~/stores/app";

vi.mock("~/stores/app", () => ({
  useAppStore: vi.fn(),
}));

const mockedUseAppStore = vi.mocked(useAppStore);

// Must import after mock setup
const { useWorkspace } = await import("./workspace");

describe("useWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns selectedWorkspaceId when set", () => {
    mockedUseAppStore.mockImplementation((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedWorkspaceId: "ws-123", selectedProjectId: "proj-456" }),
    );

    const result = useWorkspace();
    expect(result).toBe("ws-123");
  });

  it('returns "${selectedProjectId}/default" when only project is selected', () => {
    mockedUseAppStore.mockImplementation((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedWorkspaceId: null, selectedProjectId: "proj-456" }),
    );

    const result = useWorkspace();
    expect(result).toBe("proj-456/default");
  });

  it("returns null when nothing is selected", () => {
    mockedUseAppStore.mockImplementation((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedWorkspaceId: null, selectedProjectId: null }),
    );

    const result = useWorkspace();
    expect(result).toBeNull();
  });

  it("prefers workspaceId over projectId fallback", () => {
    mockedUseAppStore.mockImplementation((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedWorkspaceId: "ws-specific", selectedProjectId: "proj-123" }),
    );

    const result = useWorkspace();
    expect(result).toBe("ws-specific");
  });

  it('returns null when workspaceId is empty string and projectId is null', () => {
    mockedUseAppStore.mockImplementation((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ selectedWorkspaceId: "", selectedProjectId: null }),
    );

    const result = useWorkspace();
    expect(result).toBeNull();
  });
});
