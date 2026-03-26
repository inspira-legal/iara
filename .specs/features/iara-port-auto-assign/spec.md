# Feature: IARA_PORT Auto-Assignment

## Summary

Make `IARA_PORT` optional in `env.toml`. If present, it's treated as "pinned" (user-chosen). If absent, iara auto-computes a port at runtime using the existing base-port + increment logic. Discovery no longer assigns `IARA_PORT` values — ports are an iara-internal runtime concern.

## Problem

Currently, discovery tells Claude to assign `IARA_PORT` values in `env.toml`. This is unnecessary complexity:

- The AI has to reason about port numbering
- Users see an iara-internal key they don't need to care about
- Port conflicts between projects/workspaces are handled by a one-time write that can drift

## Design

### Runtime Port Resolution

In `loadResolvedConfig`, for each service:

1. If `IARA_PORT` exists in env.toml → use it (pinned)
2. If `IARA_PORT` is absent → compute: `basePort + workspaceOffset + repoServiceIndex`

Where:

- `basePort = 3000 + projectIndex * 100` (existing `computeBasePort`)
- `workspaceOffset = 0` for main, `20 * workspaceIndex` for others
- `repoServiceIndex` = position of this service among **repo services only** (non-repo services like `[db]` don't get auto-ports)

### Discovery Changes

Discovery prompt no longer instructs Claude to assign `IARA_PORT`. The `env` section in discovery output contains only real env vars (DATABASE_URL, API keys, cross-service URLs). Port values in cross-service URLs use the base-port convention so they match auto-assigned ports.

### Workspace Creation

`copyEnvTomlWithPortOffset` still offsets any **pinned** `IARA_PORT` values. Services without `IARA_PORT` get correct ports automatically from the runtime computation.

## Requirements

- **R1** `IARA_PORT` in env.toml is optional. Present = pinned, absent = auto-assigned.
- **R2** Auto-assignment formula: `basePort + workspaceOffset + repoServiceIndex` (repo services only).
- **R3** Non-repo services without `IARA_PORT` get `resolvedPort = 0` (no health check).
- **R4** Discovery prompt removes `IARA_PORT` from examples and instructions.
- **R5** Discovery still assigns concrete port values in cross-service env vars (e.g., `API_URL = "http://localhost:3001"`), using the base-port convention for consistency.
- **R6** `copyEnvTomlWithPortOffset` unchanged — only applies to pinned `IARA_PORT` entries.
