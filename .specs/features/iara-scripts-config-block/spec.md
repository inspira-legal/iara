# Feature: Scripts Config Block & Port Ownership

## Summary

Move port configuration (and future service-level config) from `env.toml` into `iara-scripts.yaml` via a `config:` block per service. Replace `{IARA_PORT}` interpolation with `{config.port}` syntax. Cross-service references use `{service.config.port}`.

## Problem

Currently, port assignment is split across two systems:

- **Pinned ports**: `IARA_PORT` in `env.toml` (non-repo services like DB, Redis)
- **Auto-assigned ports**: computed at runtime in the server handler, injected as `IARA_PORT` into `resolvedEnv`
- **Interpolation**: `{IARA_PORT}` in commands — uppercase-only regex, no dot syntax

This causes confusion:

1. The original spec says `{service.PORT}` but the implementation uses `{IARA_PORT}` — divergence
2. Port config lives in `env.toml` (a separate file), not in `iara-scripts.yaml` where the service is defined
3. Cross-service port references (`DATABASE_URL: "postgres://localhost:{db.PORT}"`) don't work — concrete values are baked by Claude discovery instead
4. Users write `{PORT}` (intuitive) but need `{IARA_PORT}` (non-obvious)

## Solution

### New YAML Schema

```yaml
db:
  config:
    port: 5432 # pinned port
  essencial:
    dev: "docker compose up db"

backend:
  config:
    port: auto # explicit auto-assign (default if config.port omitted)
  env:
    DATABASE_URL: "postgresql://localhost:{db.config.port}/mydb"
  essencial:
    dev:
      run: "uvicorn app.main:app --port {config.port} --reload"
      dependsOn: [db.dev]

frontend:
  env:
    API_URL: "http://localhost:{backend.config.port}"
  essencial:
    dev:
      run: "pnpm dev --port {config.port}"
      dependsOn: [backend.dev]
```

### Interpolation Syntax

| Pattern                 | Meaning                 | Example                                        |
| ----------------------- | ----------------------- | ---------------------------------------------- |
| `{config.port}`         | This service's own port | `--port {config.port}`                         |
| `{service.config.port}` | Another service's port  | `postgresql://localhost:{db.config.port}/mydb` |
| `{ENV_VAR}`             | Env variable (existing) | `{DATABASE_URL}`                               |

## Requirements

### R1 — Config Block in Parser

- **R1.1** Each service MAY have a `config:` block with structured settings.
- **R1.2** `config.port` accepts: a number (pinned), the string `"auto"`, or omission (defaults to `"auto"`).
- **R1.3** The parser extracts `config` into `ServiceDef.config` — a typed object, not a flat env map.
- **R1.4** The `config` block is the ONLY place port is defined. Remove `IARA_PORT` from `env.toml` flow for port pinning.

### R2 — Interpolation Overhaul

- **R2.1** Support `{config.port}` — resolves to the current service's resolved port.
- **R2.2** Support `{service.config.port}` — resolves to another service's resolved port (cross-reference).
- **R2.3** Keep `{UPPER_CASE_VAR}` for env variable interpolation (backward compatible).
- **R2.4** The interpolation function receives a context object with: `config` (current service), `env` (flat vars), and `allServices` (for cross-refs).
- **R2.5** Unmatched references are left as-is (no breaking change).

### R3 — Port Resolution in Server

- **R3.1** Port resolution reads `config.port` from the parsed YAML instead of `IARA_PORT` from `env.toml`.
- **R3.2** Auto-assignment formula unchanged: `basePort + wsOffset + repoServiceIndex`.
- **R3.3** `resolvedEnv` no longer injects `IARA_PORT`. The interpolation context provides port access via `{config.port}`.
- **R3.4** `env.toml` continues to provide env vars per service — just not port config.

### R4 — Discovery Prompt Update

- **R4.1** Claude discovery generates `config: { port: N }` for pinned-port services (DB, Redis).
- **R4.2** Repo services omit `config.port` (auto-assign is default).
- **R4.3** Commands use `{config.port}` for own port, `{service.config.port}` for cross-refs.
- **R4.4** Discovery result schema updated: `scripts` object includes `config` per service.
- **R4.5** `env` section in discovery result no longer contains `IARA_PORT` entries.

### R5 — Contracts Update

- **R5.1** `ServiceDef` gains `config: { port: number | "auto" }`.
- **R5.2** `ResolvedServiceDef` keeps `resolvedPort: number` (the computed/pinned value).

### R6 — Backward Compatibility

- **R6.1** Existing `iara-scripts.yaml` files without `config:` blocks work — default to `port: "auto"`.
- **R6.2** `{IARA_PORT}` in commands continues to work during migration (resolves to the service's port via env fallback). Log a deprecation warning.

## Decisions

| #   | Decision                                 | Rationale                                                               |
| --- | ---------------------------------------- | ----------------------------------------------------------------------- |
| D1  | `config:` block, not top-level `port:`   | Extensible — future config (healthcheck path, restart policy) goes here |
| D2  | `{config.port}` not `{port}`             | Namespaced, explicit, no collision with env vars                        |
| D3  | Cross-ref syntax `{service.config.port}` | Consistent with config namespace, readable                              |
| D4  | Keep `{UPPER_VAR}` env interpolation     | Backward compatible, useful for non-port env vars                       |
| D5  | Deprecation path for `{IARA_PORT}`       | Don't break existing setups, warn and migrate                           |

## Non-Goals

- No UI changes — config block is parsed server-side, port display unchanged
- No changes to port auto-assignment formula
- No new config keys beyond `port` in this iteration
