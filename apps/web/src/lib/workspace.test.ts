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
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: "ws-123", selectedProjectId: "proj-456" })) as any);

    const result = useWorkspace();
    expect(result).toBe("ws-123");
  });

  it('returns "${selectedProjectId}/default" when only project is selected', () => {
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: null, selectedProjectId: "proj-456" })) as any);

    const result = useWorkspace();
    expect(result).toBe("proj-456/default");
  });

  it("returns null when nothing is selected", () => {
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: null, selectedProjectId: null })) as any);

    const result = useWorkspace();
    expect(result).toBeNull();
  });

  it("prefers workspaceId over projectId fallback", () => {
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: "ws-specific", selectedProjectId: "proj-123" })) as any);

    const result = useWorkspace();
    expect(result).toBe("ws-specific");
  });

  it("returns null when workspaceId is empty string and projectId is null", () => {
    // biome-ignore lint: test mock
    mockedUseAppStore.mockImplementation(((selector: any) =>
      selector({ selectedWorkspaceId: "", selectedProjectId: null })) as any);

    const result = useWorkspace();
    expect(result).toBeNull();
  });
});
