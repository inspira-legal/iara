import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
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
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const DEFAULT_MAX_TURNS = 20;

// ---------------------------------------------------------------------------
// Progress queue — shared across retries
// ---------------------------------------------------------------------------

function createProgressQueue() {
  const queue: ClaudeProgress[] = [];
  let resolve: (() => void) | null = null;
  let done = false;

  function push(event: ClaudeProgress): void {
    queue.push(event);
    if (resolve) {
      resolve();
      resolve = null;
    }
  }

  function finish(): void {
    done = true;
    if (resolve) {
      resolve();
      resolve = null;
    }
  }

  const iterable: AsyncIterable<ClaudeProgress> = {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next(): Promise<IteratorResult<ClaudeProgress>> {
          while (true) {
            if (index < queue.length) {
              return { value: queue[index++]!, done: false };
            }
            if (done) {
              return { value: undefined as never, done: true };
            }
            await new Promise<void>((r) => {
              resolve = r;
            });
          }
        },
      };
    },
  };

  return { push, finish, iterable };
}

// ---------------------------------------------------------------------------
// Query stream — runs a single SDK query, pushing progress events
// ---------------------------------------------------------------------------

interface QueryStreamConfig {
  prompt: string;
  cwd: string;
  systemPrompt?: string;
  maxTurns: number;
  abortController: AbortController;
  tempFile: string;
  pushProgress: (event: ClaudeProgress) => void;
  describeToolUse: (tool: string, input: Record<string, unknown>) => string;
}

async function runQueryStream(
  config: QueryStreamConfig,
): Promise<{ subtype: string; errors?: string[] }> {
  const options: NonNullable<Parameters<typeof query>[0]["options"]> = {
    cwd: config.cwd,
    allowedTools: ["Read", "Glob", "Grep", "Write"],
    disallowedTools: ["Bash", "Edit"],
    maxTurns: config.maxTurns,
    persistSession: false,
    abortController: config.abortController,
    canUseTool: async (toolName: string, input: Record<string, unknown>) => {
      if (toolName === "Write" && input.file_path !== config.tempFile) {
        return {
          behavior: "deny" as const,
          message: "Write is only allowed for the result file.",
        };
      }
      return { behavior: "allow" as const };
    },
    stderr: (data: string) => console.error("[claude-sdk]", data),
  };

  if (config.systemPrompt) options.systemPrompt = config.systemPrompt;

  let result: { subtype: string; errors?: string[] } = { subtype: "no_result" };

  const stream = query({ prompt: config.prompt, options });

  for await (const message of stream) {
    if (message.type === "assistant") {
      const betaMessage = message.message;
      if (betaMessage && "content" in betaMessage) {
        for (const block of betaMessage.content) {
          if (block.type === "tool_use") {
            const desc = config.describeToolUse(block.name, block.input as Record<string, unknown>);
            config.pushProgress({ type: "status", message: desc });
          } else if (block.type === "text" && block.text) {
            config.pushProgress({ type: "text", content: block.text });
          }
        }
      }
    } else if (message.type === "result") {
      result = message as { subtype: string; errors?: string[] };
    } else if (message.type === "system" && "subtype" in message && message.subtype === "status") {
      config.pushProgress({ type: "status", message: "Processing..." });
    } else if (message.type === "tool_use_summary") {
      config.pushProgress({ type: "status", message: message.summary });
    } else if (message.type === "tool_progress") {
      config.pushProgress({
        type: "status",
        message: `Using ${message.tool_name}...`,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      case "Glob":
        return `Searching for ${shortPath((input.pattern as string) ?? "")}`;
      case "Grep":
        return `Searching for "${input.pattern as string}"${input.path ? ` in ${shortPath(input.path as string)}` : ""}`;
      case "Agent":
        return `Analyzing${input.description ? `: ${input.description}` : "..."}`;
      case "Write":
        return "Preparing result...";
      default:
        return `${tool}...`;
    }
  };
}

function buildResultInstruction(tempFile: string, schema?: z.ZodType<unknown>): string {
  const lines = [
    `IMPORTANT: Write your final result as JSON to "${tempFile}" using the Write tool. Do NOT output the result as plain text.`,
  ];
  if (schema && schema instanceof z.ZodObject) {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    const fields = Object.entries(shape).map(([key, val]) => {
      const desc = (val as z.ZodType<unknown>).description ?? "";
      return `  - "${key}": ${desc}`;
    });
    lines.push("The JSON must match this structure:", ...fields);
  } else {
    lines.push(
      'The JSON must have a single key "content" with the full result as a string. Example: {"content": "..."}',
    );
  }
  return lines.join("\n");
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
  const tempFile = path.join(os.tmpdir(), `iara-claude-${crypto.randomUUID()}.json`);
  const progress = createProgressQueue();
  const describeToolUse = makeDescribeToolUse(config.cwd);

  const abortController = new AbortController();
  if (config.signal) {
    config.signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });
  }

  const systemPrompt = [config.systemPrompt, buildResultInstruction(tempFile, schema)]
    .filter(Boolean)
    .join("\n\n");

  const baseStreamConfig = {
    cwd: config.cwd,
    systemPrompt,
    maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
    abortController,
    tempFile,
    pushProgress: progress.push,
    describeToolUse,
  };

  const runRetry = async (retryPrompt: string) => {
    const result = await runQueryStream({ ...baseStreamConfig, prompt: retryPrompt });
    if (result.subtype !== "success") {
      throw new Error(`Retry query failed: ${result.errors?.join(", ") ?? result.subtype}`);
    }
  };

  const resultPromise = (async (): Promise<T | string> => {
    try {
      const firstResult = await runQueryStream({ ...baseStreamConfig, prompt: config.prompt });

      if (firstResult.subtype !== "success") {
        const errors = firstResult.errors?.join(", ") ?? firstResult.subtype;
        throw new Error(`Claude query failed: ${errors}`);
      }

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // Read temp file
        let content: string;
        try {
          content = await fs.promises.readFile(tempFile, "utf-8");
        } catch {
          if (attempt < MAX_RETRIES) {
            progress.push({
              type: "status",
              message: `Result file not found, retrying (${attempt + 1}/${MAX_RETRIES})...`,
            });
            await runRetry(`Write the result as JSON to "${tempFile}" using the Write tool.`);
            continue;
          }
          throw new Error("Claude did not write the result file");
        }

        // No schema — extract "content" from JSON wrapper
        if (!schema) {
          try {
            const parsed = JSON.parse(content);
            if (typeof parsed === "object" && parsed !== null && "content" in parsed) {
              return String(parsed.content);
            }
          } catch {
            // Not valid JSON — return as-is
          }
          return content;
        }

        // Parse JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          if (attempt < MAX_RETRIES) {
            progress.push({
              type: "status",
              message: `Invalid JSON, retrying (${attempt + 1}/${MAX_RETRIES})...`,
            });
            await runRetry(
              `The file "${tempFile}" contains invalid JSON. Write valid JSON to the same file.`,
            );
            continue;
          }
          throw new Error("Result is not valid JSON after retries");
        }

        // Validate with Zod
        const result = schema.safeParse(parsed);
        if (result.success) return result.data as T;

        if (attempt < MAX_RETRIES) {
          const issues = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          progress.push({
            type: "status",
            message: `Validation failed, retrying (${attempt + 1}/${MAX_RETRIES})...`,
          });
          await runRetry(
            `Validation failed for "${tempFile}": ${issues}. Fix the errors and write corrected JSON to the same file.`,
          );
          continue;
        }

        throw new Error(`Validation failed after ${MAX_RETRIES} retries: ${result.error.message}`);
      }

      throw new Error("Unexpected: exhausted retry loop without result");
    } finally {
      await fs.promises.unlink(tempFile).catch(() => {});
      progress.finish();
    }
  })();

  return {
    progress: progress.iterable,
    result: resultPromise,
    abort: () => abortController.abort(),
  };
}

// Map of active runs for cancel support
export const activeRuns = new Map<string, ClaudeRun<unknown>>();

export function streamClaudeRun<T>(
  run: ClaudeRun<T>,
  requestId: string,
  outputPath: string | null,
  pushFn: (event: any, params: any) => void,
  transform?: (data: T) => string,
  onComplete?: () => void,
): void {
  void (async () => {
    try {
      for await (const event of run.progress) {
        pushFn("claude:progress", { requestId, progress: event });
      }
      const data = await run.result;
      const content = transform
        ? transform(data)
        : typeof data === "string"
          ? data
          : JSON.stringify(data);
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
      onComplete?.();
    }
  })();
}
