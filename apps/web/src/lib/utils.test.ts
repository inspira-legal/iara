import { describe, it, expect } from "vitest";
import { cn, toSlug } from "./utils";

describe("cn", () => {
  it("merges simple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("handles array inputs", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });
});

describe("toSlug", () => {
  it("converts to lowercase", () => {
    expect(toSlug("Hello World")).toBe("hello-world");
  });

  it("replaces non-alphanumeric chars with hyphens", () => {
    expect(toSlug("foo@bar!baz")).toBe("foo-bar-baz");
  });

  it("collapses multiple special chars into single hyphen", () => {
    expect(toSlug("foo---bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(toSlug("--hello--")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(toSlug("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(toSlug("@#$%")).toBe("");
  });

  it("preserves numbers", () => {
    expect(toSlug("version 2.0")).toBe("version-2-0");
  });

  it("handles spaces and mixed case", () => {
    expect(toSlug("My Project Name")).toBe("my-project-name");
  });
});
