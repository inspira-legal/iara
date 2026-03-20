import * as fs from "node:fs";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
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
// Shared core
// ---------------------------------------------------------------------------

interface RunCoreConfig {
  cwd: string;
  prompt: string;
  systemPrompt?: string | undefined;
  maxTurns?: number | undefined;
  signal?: AbortSignal | undefined;
  allowedTools: string[];
  disallowedTools: string[];
  mcpServers?: NonNullable<Parameters<typeof query>[0]["options"]>["mcpServers"];
  describeToolUse: (tool: string, input: Record<string, unknown>) => string;
  handleResult: (message: { subtype: string; result?: string; errors?: string[] }) => void;
  onError: (err: Error) => void;
}

function createRunCore(config: RunCoreConfig) {
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
      const options: NonNullable<Parameters<typeof query>[0]["options"]> = {
        cwd: config.cwd,
        allowedTools: config.allowedTools,
        disallowedTools: config.disallowedTools,
        permissionMode: "dontAsk" as const,
        maxTurns: config.maxTurns ?? 20,
        persistSession: false,
        abortController,
        stderr: (data: string) => console.error("[claude-sdk]", data),
      };

      if (config.systemPrompt) {
        options.systemPrompt = config.systemPrompt;
      }

      if (config.mcpServers) {
        options.mcpServers = config.mcpServers;
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
      config.onError(err instanceof Error ? err : new Error(String(err)));
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
      case "Glob":
        return `Searching for ${shortPath((input.pattern as string) ?? "")}`;
      case "Grep":
        return `Searching for "${input.pattern as string}"${input.path ? ` in ${shortPath(input.path as string)}` : ""}`;
      case "Agent":
        return `Analyzing${input.description ? `: ${input.description}` : "..."}`;
      case "submit_result":
        return "Submitting result...";
      default:
        return `${tool}...`;
    }
  };
}

// ---------------------------------------------------------------------------
// submit_result MCP tool — used by all runClaude calls
// ---------------------------------------------------------------------------

function createSubmitResultServer<T>(
  schema: z.ZodType<T> | undefined,
  onResult: (data: T | string) => void,
  onError: (err: Error) => void,
): { mcpServers: RunCoreConfig["mcpServers"]; isReceived: () => boolean } {
  let received = false;

  const isZodObject = schema instanceof z.ZodObject;

  const toolShape = schema
    ? isZodObject
      ? (schema as z.ZodObject<z.ZodRawShape>).shape
      : { result: schema }
    : { content: z.string().describe("The complete result content") };

  const submitTool = tool(
    "submit_result",
    "Submit the final result. You MUST call this tool exactly once with your answer.",
    toolShape,
    async (input) => {
      if (received) {
        return { content: [{ type: "text" as const, text: "Result already received." }] };
      }

      if (schema) {
        const data = isZodObject ? input : input.result;
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          // Let Claude retry with corrected data
          const issues = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          return {
            content: [
              {
                type: "text" as const,
                text: `Validation failed: ${issues}. Fix the errors and call submit_result again.`,
              },
            ],
            isError: true,
          };
        }
        received = true;
        onResult(parsed.data as T);
      } else {
        received = true;
        onResult(input.content as unknown as T | string);
      }

      return { content: [{ type: "text" as const, text: "Result received." }] };
    },
  );

  return {
    mcpServers: { iara: createSdkMcpServer({ name: "iara", tools: [submitTool] }) },
    isReceived: () => received,
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

  const { mcpServers, isReceived } = createSubmitResultServer(schema, resultResolve, resultReject);

  const core = createRunCore({
    cwd: config.cwd,
    prompt: config.prompt,
    systemPrompt: [
      config.systemPrompt,
      "IMPORTANT: You MUST use the `submit_result` tool to submit your final answer. Do NOT output the result as text.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxTurns: config.maxTurns,
    signal: config.signal,
    allowedTools: ["Read", "Glob", "Grep", "mcp__iara__submit_result"],
    disallowedTools: ["Bash", "Edit", "Write"],
    mcpServers,
    describeToolUse: makeDescribeToolUse(config.cwd),
    handleResult: (message) => {
      if (message.subtype === "success") {
        if (isReceived()) return;
        resultReject(new Error("Claude did not call submit_result tool"));
      } else {
        const errors = message.errors ? message.errors.join(", ") : message.subtype;
        resultReject(new Error(`Claude query failed: ${errors}`));
      }
    },
    onError: resultReject,
  });

  return {
    progress: core.progressIterable,
    result: resultPromise,
    abort: core.abort,
  };
}

// Map of active runs for cancel support
export const activeRuns = new Map<string, ClaudeRun<unknown>>();

export function streamClaudeRun<T>(
  run: ClaudeRun<T>,
  requestId: string,
  outputPath: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pushFn: (event: any, params: any) => void,
  transform?: (data: T) => string,
): void {
  void (async () => {
    try {
      for await (const event of run.progress) {
        pushFn("claude:progress", { requestId, progress: event });
      }
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
