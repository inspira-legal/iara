import { describe, it, expect } from "vitest";
import { parseJsonFromText, stripMarkdownFences } from "./claude-runner";

describe("parseJsonFromText", () => {
  describe("Layer 1: Direct JSON parse", () => {
    it("parses a valid JSON object directly", () => {
      expect(parseJsonFromText('{"a":1}')).toEqual({ a: 1 });
    });

    it("parses a valid JSON array directly", () => {
      expect(parseJsonFromText("[1,2,3]")).toEqual([1, 2, 3]);
    });

    it("parses deeply nested objects", () => {
      expect(parseJsonFromText('{"a":{"b":{"c":1}}}')).toEqual({
        a: { b: { c: 1 } },
      });
    });

    it("parses JSON with escaped quotes", () => {
      expect(parseJsonFromText('{"msg":"he said \\"hi\\""}')).toEqual({
        msg: 'he said "hi"',
      });
    });
  });

  describe("Layer 2: Markdown code fences", () => {
    it("extracts JSON from ```json fence", () => {
      const input = '```json\n{"a":1}\n```';
      expect(parseJsonFromText(input)).toEqual({ a: 1 });
    });

    it("extracts array JSON from ```json fence", () => {
      const input = "```json\n[1,2]\n```";
      expect(parseJsonFromText(input)).toEqual([1, 2]);
    });

    it("extracts JSON from plain ``` fence (no language)", () => {
      const input = '```\n{"a":1}\n```';
      expect(parseJsonFromText(input)).toEqual({ a: 1 });
    });

    it("repairs invalid JSON inside a fence (trailing comma)", () => {
      const input = '```json\n{"a":1,}\n```';
      expect(parseJsonFromText(input)).toEqual({ a: 1 });
    });
  });

  describe("Layer 3: Bracket matching for objects", () => {
    it("extracts JSON object surrounded by text", () => {
      const input = 'Here is the result: {"a":1} hope it helps';
      expect(parseJsonFromText(input)).toEqual({ a: 1 });
    });

    it("extracts JSON with text before and after", () => {
      const input = 'The output is:\n{"name":"test"}\nDone!';
      expect(parseJsonFromText(input)).toEqual({ name: "test" });
    });

    it("returns undefined when greedy bracket match produces invalid JSON", () => {
      const input = 'first {"a":1} then {"b":2}';
      // first { to last } => {"a":1} then {"b":2} which is not valid JSON
      // jsonrepair also cannot fix it, so it returns undefined
      const result = parseJsonFromText(input);
      expect(result).toBeUndefined();
    });
  });

  describe("Layer 4: Array bracket matching", () => {
    it("extracts array JSON surrounded by text", () => {
      const input = "Here is the list: [1,2,3] end";
      expect(parseJsonFromText(input)).toEqual([1, 2, 3]);
    });
  });

  describe("Layer 5: jsonrepair fallback", () => {
    it("repairs trailing comma", () => {
      expect(parseJsonFromText('{"a":1,}')).toEqual({ a: 1 });
    });

    it("repairs unquoted keys", () => {
      expect(parseJsonFromText('{a: 1, b: "test"}')).toEqual({
        a: 1,
        b: "test",
      });
    });

    it("repairs single quotes", () => {
      expect(parseJsonFromText("{'a': 1}")).toEqual({ a: 1 });
    });
  });

  describe("Edge cases: empty/invalid input", () => {
    it("returns undefined for empty string", () => {
      expect(parseJsonFromText("")).toBeUndefined();
    });

    it("returns a string for plain text (jsonrepair treats it as a JSON string)", () => {
      // jsonrepair wraps plain text in quotes, making it a valid JSON string
      expect(parseJsonFromText("just text")).toBe("just text");
    });

    it("returns a string for text without any JSON structure", () => {
      expect(parseJsonFromText("no json here")).toBe("no json here");
    });
  });

  describe("Edge cases: complex content", () => {
    it("handles JSON with internal code blocks inside a markdown fence", () => {
      const input = '```json\n{"code":"```bash\\necho hi\\n```"}\n```';
      // The regex is non-greedy for fence content, so it may match the inner ```
      // The important thing is it extracts something parseable or falls through
      const result = parseJsonFromText(input);
      // Even if fence extraction fails, bracket matching should work
      expect(result).toBeDefined();
    });
  });
});

describe("stripMarkdownFences", () => {
  it("returns text unchanged when there are no fences", () => {
    const input = "# Hello\n\nContent";
    expect(stripMarkdownFences(input)).toBe(input);
  });

  it("strips ```markdown fence", () => {
    const input = "```markdown\n# Hello\n```";
    expect(stripMarkdownFences(input)).toBe("# Hello");
  });

  it("strips ```md fence", () => {
    const input = "```md\n# Hello\n```";
    expect(stripMarkdownFences(input)).toBe("# Hello");
  });

  it("strips ```text fence", () => {
    const input = "```text\nContent\n```";
    expect(stripMarkdownFences(input)).toBe("Content");
  });

  it("strips plain ``` fence (no language tag)", () => {
    const input = "```\nContent\n```";
    expect(stripMarkdownFences(input)).toBe("Content");
  });

  it("preserves internal code blocks when stripping outer markdown fence", () => {
    const input = "```markdown\n# Title\n\n```bash\necho hi\n```\n\nMore content\n```";
    const expected = "# Title\n\n```bash\necho hi\n```\n\nMore content";
    expect(stripMarkdownFences(input)).toBe(expected);
  });

  it("preserves multiple internal code blocks", () => {
    const input =
      '```markdown\n# Title\n\n```bash\necho hi\n```\n\n```python\nprint("hi")\n```\n\nEnd\n```';
    const expected = '# Title\n\n```bash\necho hi\n```\n\n```python\nprint("hi")\n```\n\nEnd';
    expect(stripMarkdownFences(input)).toBe(expected);
  });

  it("does not strip fences that do not wrap the entire content", () => {
    const input = "Some text\n```bash\ncode\n```\nMore text";
    expect(stripMarkdownFences(input)).toBe(input);
  });

  it("does not strip ```json fences (handled by parseJsonFromText instead)", () => {
    const input = '```json\n{"a":1}\n```';
    expect(stripMarkdownFences(input)).toBe(input);
  });

  it("strips fences with surrounding whitespace", () => {
    const input = "  ```markdown\n# Title\n```  ";
    expect(stripMarkdownFences(input)).toBe("# Title");
  });
});
