# Feature: iara-scripts

## Summary

Replace the "Dev Servers" panel with a scripts/service orchestration system. Services are defined in `<project-dir>/scripts.yaml`, discovered by Claude (language-agnostic), and executed by iara. Scripts have per-script dependencies (`dependsOn`) and are classified as persistent (long-running) or one-shot. A bottom panel provides a command toolbar, service cards, and live output.

## Requirements

### R1 — Layout

- **R1.1** Remove the "Dev Servers" panel from the sidebar.
- **R1.2** Move Settings button to the sidebar header.
- **R1.3** Add a resizable **bottom panel** below the main content area with two tabs: "Scripts" and "Output". Collapsible via chevron.
- **R1.4** Visual indicators (colored dots) on workspace nodes (project default / task) in the sidebar tree showing running service health.

### R2 — scripts.yaml Schema

- **R2.1** File: `<project-dir>/iara-scripts.yaml`.
- **R2.2** Top-level keys are **services** (repos, databases, caches — all equal). Iara matches service names to repo names; matching services run in the repo's worktree, non-matching run in project root.

```yaml
db:
  config:
    port: 5432
  essencial:
    dev: "docker compose up db"

redis:
  config:
    port: 6379
  essencial:
    dev: "docker compose up redis"

backend:
  env:
    DATABASE_URL: "postgresql://localhost:{db.config.port}/mydb"
    REDIS_URL: "redis://localhost:{redis.config.port}"
  essencial:
    setup: uv sync
    codegen:
      run: "uv run python scripts/generate_schema.py"
      dependsOn: [db.dev]
    dev:
      run: "uvicorn app.main:app --port={config.port} --reload"
      dependsOn: [db.dev, redis.dev]
    check:
      - "uv run ruff check src"
      - "uv run pyright"
    test:
      run: "uv run pytest"
      dependsOn: [db.dev, backend.dev]
  advanced:
    migrate: "uv run alembic upgrade head"

frontend:
  env:
    API_URL: "http://localhost:{backend.config.port}"
  essencial:
    setup: pnpm i
    codegen:
      run: pnpm graphql-codegen
      dependsOn: [backend.dev]
    dev:
      run: "pnpm dev --port={config.port}"
      dependsOn: [backend.dev]
    build: pnpm build
    check:
      - "pnpm tscheck"
      - "pnpm lint:check"
    test:
      run: pnpm vitest
      dependsOn: [backend.dev]
  advanced:
    preview: pnpm preview
    storybook: "pnpm storybook"
```

- **R2.3** Script values: `string | string[]` (short form) or `{ run, dependsOn }` (object form). Arrays execute sequentially.
- **R2.4** The `essencial` category has 6 well-known keys in fixed order: `setup`, `codegen`, `dev`, `build`, `check`, `test`. Each gets a dedicated icon and quick-action button.
- **R2.5** The `advanced` category holds arbitrary key-value scripts, shown in a collapsible section.
- **R2.6** `env` block per service — injected into all scripts for that service. Values support `{config.port}` (own port) and `{service.config.port}` (cross-ref) interpolation. Merged with project env files (scripts.yaml takes precedence).
- **R2.7** `config` block per service — structured settings. Currently supports `port: <number>` (pinned) or omission (auto-assigned).

### R3 — Per-Script Dependencies

- **R3.1** `dependsOn` is per-script, NOT per-service. Format: `["<service>.<script>"]`.
- **R3.2** A dependency is satisfied when:
  - **Persistent script** (dev): port is listening (TCP health check)
  - **One-shot script** (setup, build, etc.): exited with code 0
- **R3.3** Default timeout: 30s. Configurable per service via `timeout` field.
- **R3.4** If a dependency fails or times out, the dependent script still attempts to start (resilient — fails naturally if dep is truly needed).
- **R3.5** `runAll("dev")` performs topological sort based on each script's `dependsOn`, not service-level.
- **R3.6** Scripts with no `dependsOn` run immediately.

### R4 — Script Types (Persistent vs One-Shot)

- **R4.1** `dev` is the only **persistent** (long-running) essencial key. It stays running, has health checks, shows green when healthy.
- **R4.2** `setup`, `codegen`, `build`, `check`, `test` are **one-shot**. They run to completion and report success/failure.
- **R4.3** UI distinguishes: persistent scripts show running/healthy/unhealthy state; one-shot scripts show running/success/failed state.
- **R4.4** The command bar buttons reflect state: idle → run, running → stop (persistent) or spinner (one-shot), done → green check (success) or red X (failed).

### R5 — PORT System

- **R5.1** No `config.port` → auto-assigned from workspace range. `config: { port: <number> }` → pinned.
- **R5.2** Each workspace gets a base PORT (global counter, spacing 20).
- **R5.3** Own port: `{config.port}`. Cross-service: `{service.config.port}`. Supports hyphens: `{lexflow-api.config.port}`. No bare `{PORT}`.
- **R5.4** Pinned-port services are **shared across workspaces** — if port is already in use, attach as healthy without spawning.
- **R5.5** Port released when task is deleted.

### R6 — Script Discovery (Claude)

- **R6.1** "Discover Scripts" button in bottom panel when no scripts.yaml exists.
- **R6.2** Uses `runClaude` SDK to analyze repos and generate scripts.yaml with per-script `dependsOn`.
- **R6.3** Language-agnostic. Merge mode if scripts.yaml already exists.
- **R6.4** Auto-triggers on project creation.

### R7 — Script Execution

- **R7.1** All scripts create an output tab when run. No output-level gating.
- **R7.2** Output shows `> command` as first line, then stdout/stderr interleaved.
- **R7.3** When waiting for a dependency: shows `[iara] Waiting for {service} to be healthy on port {port}...` in output.
- **R7.4** `runAll` for a category runs all services' scripts in dependency order with waiting messages.
- **R7.5** Env vars from project env files + service `env` block injected.
- **R7.6** Scripts survive task switch. User manages manually.

### R8 — Bottom Panel UI

- **R8.1** **Command Bar** (top of Scripts tab): icon buttons for each essencial category (setup, codegen, dev, build, check, test) + stop + edit scripts.yaml. Each button shows state:
  - Idle: category icon + name
  - Running: spinner (one-shot) or green pulse (persistent)
  - Done: green check (success) or red indicator (failed)
  - Clicking a running persistent command stops it (toggle behavior)
- **R8.2** **Service Cards**: per-service, show essencial scripts with icons and play/stop buttons. Advanced scripts in collapsible "advanced (N)" section.
- **R8.3** **Output Tab**: left sidebar with all scripts (newest first, colored status dot), right side with live-streaming monospace logs. `> command` lines highlighted, `[iara]` lines in blue/italic.
- **R8.4** Output tab auto-opens when any script fails.
- **R8.5** "Discover Scripts" CTA when no scripts.yaml.

### R9 — Essencial Key Order

The fixed order for essencial keys is: **setup → codegen → dev → build → check → test**.

Codegen runs before dev because:

- Code generation (graphql, protobuf, openapi) must complete before dev servers start
- Some codegen depends on services (e.g., DB schema introspection) — handled via `dependsOn`

---

## Decisions

| #   | Decision                                                  | Rationale                                                |
| --- | --------------------------------------------------------- | -------------------------------------------------------- |
| D1  | `scripts.yaml` (YAML, not JSON)                           | Readable for commands, supports comments                 |
| D2  | Flat services model                                       | DB, Redis, repos all equal                               |
| D3  | Auto PORT per workspace, pinnable per service             | No overlaps, zero config                                 |
| D4  | 20-port spacing per workspace                             | ~350 workspaces in range 3000-9999                       |
| D5  | Per-script `dependsOn` (not service-level)                | Codegen may need DB, test may need API, etc.             |
| D6  | essencial order: setup, codegen, dev, build, check, test  | Codegen before dev, natural workflow order               |
| D7  | Keep scripts running on task switch                       | User manages manually                                    |
| D8  | Clean break — no fallback auto-discovery                  | "Discover Scripts" CTA                                   |
| D9  | Auto-discover on project creation                         | Seamless onboarding                                      |
| D10 | No output levels — all scripts always create output tab   | Simpler, always see what's happening                     |
| D11 | Pinned-port services shared across workspaces             | Don't restart DB per task                                |
| D12 | Persistent (dev) vs one-shot (everything else)            | UI knows what should keep running vs finish              |
| D13 | `{config.port}` / `{service.config.port}` always explicit | Namespaced, extensible, prevents collision with env vars |
| D14 | Resilient runAll — continue on dep failure                | See all errors at once, not blocked by first failure     |
