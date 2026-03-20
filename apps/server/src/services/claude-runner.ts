import * as fs from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import type { ClaudeProgress } from "@iara/contracts";

export type { ClaudeProgress };

export interface ClaudeRunConfig {
  cwd: string;
  prompt: string;
  systemPrompt?: string;
  maxTurns?: number;
  signal?: AbortSignal;
}

export interface ClaudeRun<T> {
  progress: AsyncIterable<ClaudeProgress>;
  result: Promise<T>;
  abort: () => void;
}

// ---------------------------------------------------------------------------
// Shared machinery extracted from runClaude / runClaudeToFile
// ---------------------------------------------------------------------------

interface RunCoreConfig {
  cwd: string;
  prompt: string;
  systemPrompt?: string;
  maxTurns?: number;
  signal?: AbortSignal;
  allowedTools: string[];
  disallowedTools: string[];
  canUseTool?: (
    tool: string,
    input: Record<string, unknown>,
  ) => Promise<{ behavior: string; message?: string }>;
  describeToolUse: (tool: string, input: Record<string, unknown>) => string;
  handleResult: (message: { subtype: string; result?: string; errors?: string[] }) => void;
}

interface RunCoreReturn {
  progressQueue: ClaudeProgress[];
  state: { progressResolve: (() => void) | null; done: boolean };
  pushProgress: (event: ClaudeProgress) => void;
  progressIterable: AsyncIterable<ClaudeProgress>;
  abort: () => void;
}

function createRunCore(config: RunCoreConfig): RunCoreReturn {
  const abortController = new AbortController();

  if (config.signal) {
    config.signal.addEventListener("abort", () => abortController.abort(), { once: true });
  }

  const progressQueue: ClaudeProgress[] = [];
  const state = { progressResolve: null as (() => void) | null, done: false };

  function pushProgress(event: ClaudeProgress): void {
    progressQueue.push(event);
    if (state.progressResolve) {
      state.progressResolve();
      state.progressResolve = null;
    }
  }

  // Start the async query loop
  void (async () => {
    try {
      const options: Parameters<typeof query>[0]["options"] = {
        cwd: config.cwd,
        allowedTools: config.allowedTools,
        disallowedTools: config.disallowedTools,
        permissionMode: "dontAsk" as const,
        maxTurns: config.maxTurns ?? 20,
        persistSession: false,
        abortController,
      };

      if (config.canUseTool) {
        options.canUseTool = config.canUseTool;
      }

      if (config.systemPrompt) {
        options.systemPrompt = config.systemPrompt;
      }

      const stream = query({ prompt: config.prompt, options });

      for await (const message of stream) {
        if (message.type === "assistant") {
          const betaMessage = message.message;
          if (betaMessage && "content" in betaMessage) {
            for (const block of betaMessage.content) {
              if (block.type === "tool_use") {
                const desc = config.describeToolUse(
                  block.name,
                  block.input as Record<string, unknown>,
                );
                pushProgress({ type: "status", message: desc });
              } else if (block.type === "text" && block.text) {
                pushProgress({ type: "text", content: block.text });
              }
            }
          }
        } else if (message.type === "result") {
          config.handleResult(message as { subtype: string; result?: string; errors?: string[] });
        } else if (
          message.type === "system" &&
          "subtype" in message &&
          message.subtype === "status"
        ) {
          pushProgress({ type: "status", message: "Processing..." });
        } else if (message.type === "tool_use_summary") {
          pushProgress({ type: "status", message: message.summary });
        } else if (message.type === "tool_progress") {
          pushProgress({ type: "status", message: `Using ${message.tool_name}...` });
        }
      }
    } catch (err) {
      // Propagated via handleResult's reject path — but we still need to catch here
      // to avoid unhandled promise rejection if the error happens outside the result handler.
      // The caller's resultReject should be invoked from the catch in the outer scope.
      throw err;
    } finally {
      state.done = true;
      if (state.progressResolve) {
        state.progressResolve();
        state.progressResolve = null;
      }
    }
  })();

  const progressIterable: AsyncIterable<ClaudeProgress> = {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next(): Promise<IteratorResult<ClaudeProgress>> {
          while (true) {
            if (index < progressQueue.length) {
              return { value: progressQueue[index++]!, done: false };
            }
            if (state.done) {
              return { value: undefined as never, done: true };
            }
            await new Promise<void>((resolve) => {
              state.progressResolve = resolve;
            });
          }
        },
      };
    },
  };

  return {
    progressQueue,
    state,
    pushProgress,
    progressIterable,
    abort: () => abortController.abort(),
  };
}

function makeShortPath(cwd: string) {
  return (filePath: string): string => {
    if (!filePath) return "file";
    if (filePath.startsWith(cwd)) {
      return filePath.slice(cwd.length + 1);
    }
    return filePath;
  };
}

function makeDescribeToolUse(cwd: string) {
  const shortPath = makeShortPath(cwd);
  return (tool: string, input: Record<string, unknown>): string => {
    switch (tool) {
      case "Read":
        return `Reading ${shortPath(input.file_path as string)}`;
      case "Write":
        return `Writing ${shortPath(input.file_path as string)}`;
      case "Glob":
        return `Searching for ${shortPath((input.pattern as string) ?? "")}`;
      case "Grep":
        return `Searching for "${input.pattern as string}"${input.path ? ` in ${shortPath(input.path as string)}` : ""}`;
      case "Agent":
        return `Analyzing${input.description ? `: ${input.description}` : "..."}`;
      default:
        return `${tool}...`;
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Overloads
export function runClaude(config: ClaudeRunConfig): ClaudeRun<string>;
export function runClaude<T>(config: ClaudeRunConfig, schema: z.ZodType<T>): ClaudeRun<T>;
export function runClaude<T>(
  config: ClaudeRunConfig,
  schema?: z.ZodType<T>,
): ClaudeRun<T | string> {
  let resultResolve!: (value: T | string) => void;
  let resultReject!: (err: Error) => void;
  const resultPromise = new Promise<T | string>((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });

  let prompt = config.prompt;
  if (schema) {
    const jsonSchema = z.toJSONSchema(schema);
    prompt += `\n\nResponda APENAS com JSON válido no seguinte schema:\n${JSON.stringify(jsonSchema, null, 2)}`;
  }

  const core = createRunCore({
    cwd: config.cwd,
    prompt,
    systemPrompt: config.systemPrompt,
    maxTurns: config.maxTurns,
    signal: config.signal,
    allowedTools: ["Read", "Glob", "Grep"],
    disallowedTools: ["Bash", "Edit", "Write"],
    describeToolUse: makeDescribeToolUse(config.cwd),
    handleResult: (message) => {
      if (message.subtype === "success") {
        if (schema) {
          const data = parseJsonFromText(message.result!);
          const parsed = schema.safeParse(data);
          if (parsed.success) {
            resultResolve(parsed.data as T);
          } else {
            resultReject(
              new Error(`JSON validation failed: ${JSON.stringify(parsed.error.issues)}`),
            );
          }
        } else {
          resultResolve(stripMarkdownFences(message.result!));
        }
      } else {
        const errors = message.errors ? message.errors.join(", ") : message.subtype;
        resultReject(new Error(`Claude query failed: ${errors}`));
      }
    },
  });

  return {
    progress: core.progressIterable,
    result: resultPromise,
    abort: core.abort,
  };
}

/**
 * Run Claude with Write tool enabled for a single target file.
 * Claude analyzes the codebase (read-only) and writes output directly to the file.
 * Returns a ClaudeRun<string> where result is the path of the written file.
 */
export function runClaudeToFile(
  config: ClaudeRunConfig & { outputPath: string },
): ClaudeRun<string> {
  let resultResolve!: (value: string) => void;
  let resultReject!: (err: Error) => void;
  const resultPromise = new Promise<string>((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });

  const targetPath = config.outputPath;

  const core = createRunCore({
    cwd: config.cwd,
    prompt: config.prompt,
    systemPrompt: config.systemPrompt,
    maxTurns: config.maxTurns,
    signal: config.signal,
    allowedTools: ["Read", "Glob", "Grep", "Write"],
    disallowedTools: ["Bash", "Edit"],
    canUseTool: async (tool: string, input: Record<string, unknown>) => {
      if (tool === "Write" && input.file_path !== targetPath) {
        return { behavior: "deny" as const, message: `Write only allowed to ${targetPath}` };
      }
      return { behavior: "allow" as const };
    },
    describeToolUse: makeDescribeToolUse(config.cwd),
    handleResult: (message) => {
      if (message.subtype === "success") {
        resultResolve(targetPath);
      } else {
        const errors = message.errors ? message.errors.join(", ") : message.subtype;
        resultReject(new Error(`Claude query failed: ${errors}`));
      }
    },
  });

  return {
    progress: core.progressIterable,
    result: resultPromise,
    abort: core.abort,
  };
}

// ---------------------------------------------------------------------------
// JSON / text utilities
// ---------------------------------------------------------------------------

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {}
  try {
    return JSON.parse(jsonrepair(text));
  } catch {}
  return undefined;
}

/**
 * Robustly parse JSON from LLM text output.
 * Cascading strategy:
 * 1. Direct JSON.parse (text is already valid JSON)
 * 2. Extract from markdown code fences (```json ... ```)
 * 3. Bracket matching (first { to last }, handles surrounding text)
 * 4. Array bracket matching (first [ to last ])
 * 5. jsonrepair on full text (last resort)
 * Each extraction attempt is also tried through jsonrepair as final fallback.
 */
export function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  // Layer 1: Direct parse
  const direct = tryParseJson(trimmed);
  if (direct !== undefined) return direct;

  // Layer 2: Extract from markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    const fenced = tryParseJson(fenceMatch[1]!.trim());
    if (fenced !== undefined) return fenced;
  }

  // Layer 3: Bracket matching — first { to last }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const braced = tryParseJson(trimmed.slice(firstBrace, lastBrace + 1));
    if (braced !== undefined) return braced;
  }

  // Layer 4: Array bracket matching — first [ to last ]
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const bracketed = tryParseJson(trimmed.slice(firstBracket, lastBracket + 1));
    if (bracketed !== undefined) return bracketed;
  }

  return undefined;
}

/** Strip markdown code fences wrapping the entire response (```markdown, ```md, ```, etc.) */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  // Greedy match: first opening fence to LAST closing fence (preserves internal code blocks)
  const match = trimmed.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*)\n```\s*$/);
  return match ? match[1]!.trim() : trimmed;
}

// Map of active runs for cancel support
export const activeRuns = new Map<string, ClaudeRun<unknown>>();

export function streamClaudeRun<T>(
  run: ClaudeRun<T>,
  requestId: string,
  outputPath: string | null,
  pushFn: (event: string, params: unknown) => void,
  transform?: (data: T) => string,
): void {
  console.log("[streamClaudeRun] starting for requestId:", requestId);
  void (async () => {
    try {
      for await (const event of run.progress) {
        console.log("[streamClaudeRun] progress event:", event.type);
        pushFn("claude:progress", { requestId, progress: event });
      }
      console.log("[streamClaudeRun] awaiting result...");
      const data = await run.result;
      const content = transform ? transform(data) : String(data);
      if (outputPath) {
        await fs.promises.writeFile(outputPath, content, "utf-8");
      }
      pushFn("claude:result", { requestId, result: { content } });
    } catch (err) {
      pushFn("claude:error", {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      activeRuns.delete(requestId);
    }
  })();
}
