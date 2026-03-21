# Spec: Subprocess Launch Freeze

## Problem

iara launches subprocesses in three ways: detached terminal launcher (`launcher.ts`), PTY-managed terminals (`terminal.ts`), and supervised scripts (`supervisor.ts`). Each implements its own process lifecycle management (kill, health check, stream handling) with inconsistent patterns, leading to freeze scenarios:

1. **Processes that ignore SIGTERM hang forever** — individual `terminal.destroy()` sends SIGTERM but has no SIGKILL fallback (only `destroyAll()` does)
2. **Frozen services stay "healthy" forever** — health checks stop polling after first success; no re-checking
3. **stdout/stderr stream errors are unhandled** — `supervisor.ts` listens for `data` but not `error` events on child streams
4. **Kill timers are orphaned** — `supervisor.stopAll()` clears the map but SIGKILL timeout closures float with no tracking
5. **Stale terminal:exit events after destroy** — `onExit` handler still pushes events after `destroy()` already removed the terminal
6. **Output buffer grows unbounded** — `bufferTimeout` is a truthy number even after firing, so buffer re-fills indefinitely

## Root Cause

**Duplicated process-group kill logic** across `terminal.ts` and `supervisor.ts`. Each reimplements SIGTERM→SIGKILL escalation differently, each with its own gaps. The missing abstraction is a reliable "kill process group with escalation" utility.

## Requirements

| ID    | Requirement                                                                                                                                | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| SLF-1 | Extract `killProcessGroup(pid, opts)` utility to `packages/shared` that handles SIGTERM→SIGKILL escalation with timer tracking and cleanup | must     |
| SLF-2 | `terminal.destroy()` must SIGKILL after grace period (same as `destroyAll()`)                                                              | must     |
| SLF-3 | `terminal.onExit` must not push events for already-destroyed terminals                                                                     | must     |
| SLF-4 | `supervisor.ts` must handle `error` events on stdout/stderr streams                                                                        | must     |
| SLF-5 | `supervisor.ts` must periodically re-check health of "healthy" services (detect frozen processes)                                          | should   |
| SLF-6 | `supervisor.stopAll()` must track and cancel pending SIGKILL timers                                                                        | must     |
| SLF-7 | Terminal output buffer must stop growing after the debug window expires                                                                    | should   |

## Out of Scope

- Backpressure/flow control on WebSocket push (separate concern)
- Changing the detached launcher (`launcher.ts`) — it's fire-and-forget by design
- `claude-runner.ts` — uses Claude Agent SDK, not raw subprocesses
