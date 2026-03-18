import { describe, expect, it } from "vitest";
import { buildClaudeArgs } from "./launcher.js";

describe("launcher", () => {
  describe("buildClaudeArgs", () => {
    it("builds args with session id", () => {
      const args = buildClaudeArgs({
        taskDir: "/tmp/task",
        repoDirs: ["/tmp/task/repo1", "/tmp/task/repo2"],
        sessionId: "abc-123",
      });

      expect(args).toContain("--session-id");
      expect(args).toContain("abc-123");
      expect(args).toContain("--add-dir");
      expect(args).toContain("/tmp/task/repo1");
      expect(args).toContain("/tmp/task/repo2");
    });

    it("builds args with resume session", () => {
      const args = buildClaudeArgs({
        taskDir: "/tmp/task",
        repoDirs: ["/tmp/task/repo1"],
        resumeSessionId: "resume-456",
      });

      expect(args).toContain("--resume");
      expect(args).toContain("resume-456");
      expect(args).not.toContain("--session-id");
    });

    it("includes system prompt when provided", () => {
      const args = buildClaudeArgs({
        taskDir: "/tmp/task",
        repoDirs: [],
        appendSystemPrompt: "You are working on auth feature",
      });

      expect(args).toContain("--append-system-prompt");
      expect(args).toContain("You are working on auth feature");
    });

    it("builds minimal args with no optional params", () => {
      const args = buildClaudeArgs({
        taskDir: "/tmp/task",
        repoDirs: [],
      });

      expect(args).not.toContain("--session-id");
      expect(args).not.toContain("--resume");
      expect(args).not.toContain("--add-dir");
      expect(args).not.toContain("--append-system-prompt");
    });
  });
});
