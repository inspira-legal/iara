# M1 Scaffold & Worktrees Design

**Spec**: `.specs/features/scaffold/spec.md`
**Status**: Draft

---

## Architecture Overview

M1 é infraestrutura pura. Nenhuma feature user-facing além do shell. O objetivo é ter monorepo funcional, Electron rodando, data layer com SQLite, e git worktree operations testadas.

```
iara/                                  # repo root
├── apps/
│   ├── desktop/                       # Electron main + preload (tsdown → CJS)
│   │   ├── src/
│   │   ├── scripts/                   # dev-electron.mjs, smoke-test.mjs
│   │   ├── drizzle/                   # Migration files (geradas por drizzle-kit)
│   │   ├── tsdown.config.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   └── web/                           # React renderer (Vite 8 → ESM)
│       ├── src/
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       └── package.json
├── packages/
│   ├── contracts/                     # Tipos compartilhados (tsdown → dual ESM+CJS)
│   └── shared/                        # Utilidades runtime (source .ts, subpath exports)
├── scripts/                           # Dev runner
│   └── dev-runner.ts
├── package.json                       # Root — Bun workspaces + Turborepo
├── turbo.json
├── tsconfig.base.json
├── vitest.config.ts                   # Root vitest config
├── .oxlintrc.json
├── .oxfmtrc.json
└── .mise.toml
```

```
apps/desktop (main process)          apps/web (renderer)
┌──────────────────────┐             ┌──────────────────────┐
│ main.ts              │             │ React 19             │
│  ├── BrowserWindow   │◄── IPC ───►│  ├── TanStack Router │
│  ├── SQLite+Drizzle  │             │  ├── Zustand stores  │
│  ├── Git service     │             │  ├── Tailwind CSS 4  │
│  ├── syncShellEnv    │             │  ├── Base UI         │
│  └── preload bridge  │             │  └── Lucide icons    │
└──────────────────────┘             └──────────────────────┘
         │                                      │
    packages/contracts (tipos IPC, data models)
    packages/shared (utilidades runtime)
```

---

## Code Reuse Analysis

### Referência: t3code

| t3code                                     | iara             | Como reusar                                                     |
| ------------------------------------------ | ---------------- | --------------------------------------------------------------- |
| `apps/desktop/tsdown.config.ts`            | Copiar e adaptar | Mesma estrutura: main.ts + preload.ts → CJS em dist-electron/   |
| `apps/web/vite.config.ts`                  | Copiar e adaptar | React + TanStack Router + Tailwind 4 + HMR config para Electron |
| `tsconfig.base.json`                       | Copiar           | ES2023, Bundler resolution, strict flags                        |
| `apps/desktop/scripts/dev-electron.mjs`    | Copiar e adaptar | wait-on + file watchers + Electron restart com debounce         |
| `apps/desktop/scripts/smoke-test.mjs`      | Copiar e adaptar | Verifica que app não crasheia na inicialização                  |
| `apps/desktop/src/preload.ts`              | Copiar pattern   | contextBridge.exposeInMainWorld com tipos de contracts          |
| `apps/desktop/src/syncShellEnvironment.ts` | Copiar           | Importar PATH do shell do user                                  |
| `.oxlintrc.json` / `.oxfmtrc.json`         | Copiar e adaptar | Mesmos plugins, ajustar ignores                                 |
| `.mise.toml`                               | Copiar           | Node 24 + Bun 1.3                                               |
| `packages/shared` (subpath exports)        | Copiar pattern   | Sem barrel, source .ts direto                                   |
| `packages/contracts` (dual build)          | Copiar pattern   | tsdown → ESM+CJS+DTS                                            |

### Não reusar do t3code

| t3code                               | Por que não                       |
| ------------------------------------ | --------------------------------- |
| `apps/server` (WS server)            | Não temos server separado         |
| Auto-updater (`electron-updater`)    | Fora do scope                     |
| Effect CLI (`scripts/dev-runner.ts`) | Simplificar — scripts Bun diretos |
| Codex adapter                        | Não aplicável                     |
| Marketing app                        | Não aplicável                     |

---

## Components

### apps/desktop — Electron Main Process

- **Purpose**: Entry point do app. Cria window, gerencia lifecycle, hospeda serviços (DB, git).
- **Location**: `apps/desktop/src/`
- **Files**:
  - `main.ts` — Bootstrap: app.whenReady, createWindow, register IPC handlers, init DB
  - `preload.ts` — contextBridge expondo desktopBridge tipado
  - `db.ts` — Inicialização SQLite + Drizzle, auto-migrations
  - `db/schema.ts` — Drizzle schema (projects, tasks)
  - `services/git.ts` — Git operations via child_process
  - `services/shell-env.ts` — syncShellEnvironment (importar PATH)
- **Scripts** (`apps/desktop/scripts/`):
  - `dev-electron.mjs` — Wait-on + file watchers + Electron restart (baseado no t3code)
  - `smoke-test.mjs` — Verifica que o app inicia sem erros fatais
- **Migrations** (`apps/desktop/drizzle/`):
  - Geradas pelo drizzle-kit, não vivem em src/
- **Dependencies**: electron, better-sqlite3, drizzle-orm, @iara/contracts, @iara/shared
- **DevDependencies**: @electron/rebuild, wait-on, tsdown, drizzle-kit
- **Build**: tsdown → CJS em dist-electron/

### apps/web — React Renderer

- **Purpose**: UI do app. Layout shell com sidebar + main panel.
- **Location**: `apps/web/src/`
- **Structure** (espelhando t3code):
  ```
  apps/web/src/
  ├── main.tsx                    # React root, router setup
  ├── router.ts                   # TanStack Router (hash history em prod)
  ├── index.css                   # Tailwind CSS 4 entry
  ├── env.ts                      # Environment helpers
  ├── nativeApi.ts                # Typed wrapper para window.desktopBridge
  ├── components/
  │   ├── ui/                     # Primitivos (button, input, dialog, etc)
  │   ├── AppShell.tsx            # Sidebar + main panel layout
  │   ├── Sidebar.tsx             # Sidebar placeholder
  │   └── MainPanel.tsx           # Main content area
  ├── hooks/
  │   ├── useTheme.ts
  │   └── useMediaQuery.ts
  ├── lib/
  │   └── utils.ts                # cn() helper (tailwind-merge + cva)
  └── routes/                     # TanStack Router file-based routes
      └── index.tsx               # Home page placeholder
  ```
- **Dependencies**: react, react-dom, @tanstack/react-router, zustand, tailwindcss, @base-ui/react, class-variance-authority, tailwind-merge, lucide-react, @iara/contracts
- **Build**: Vite 8 → ESM

### packages/contracts

- **Purpose**: Tipos compartilhados entre main e renderer. Schema-only, zero runtime logic.
- **Location**: `packages/contracts/src/`
- **Files**:
  - `index.ts` — Re-exports (barrel ok aqui — package é pequeno e schema-only)
  - `ipc.ts` — DesktopBridge interface, IPC channel types
  - `models.ts` — Project, Task types (espelham schema Drizzle)
- **Dependencies**: effect (para Schema, se necessário)
- **Build**: tsdown → dual ESM+CJS+DTS
- **Note**: Se contracts crescer muito, migrar para subpath exports como shared

### packages/shared

- **Purpose**: Utilidades runtime compartilhadas. Subpath exports explícitos, sem barrel.
- **Location**: `packages/shared/src/`
- **Files**:
  - `git.ts` — Git CLI helpers (exec, parse output)
  - `logging.ts` — RotatingFileSink (referência t3code)
  - `fs.ts` — Filesystem utilities (ensure dir, safe JSON read/write)
- **Dependencies**: @iara/contracts
- **Build**: Nenhum — source .ts consumido direto via subpath exports
- **Exports**: `@iara/shared/git`, `@iara/shared/logging`, `@iara/shared/fs`

### scripts/

- **Purpose**: Dev runner root.
- **Location**: `scripts/`
- **Files**:
  - `dev-runner.ts` — Script simples que orquestra `bun dev:desktop` (coordena turbo tasks). Sem Effect CLI.

---

## Data Models

### Project

```typescript
// packages/contracts/src/models.ts
interface Project {
  id: string; // UUID
  slug: string; // gerado por LLM, confirmado pelo user (ex: "my-saas")
  name: string; // display name
  repoSources: string[]; // paths locais ou URLs git dos repos originais
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

```typescript
// apps/desktop/src/db/schema.ts (Drizzle)
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  repoSources: text("repo_sources").notNull(), // JSON serialized string[]
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

**Note**: `projectsDir` não está no model — é global, lido de `config.json`.

### Task

```typescript
interface Task {
  id: string; // UUID
  projectId: string; // FK → Project
  slug: string; // gerado por LLM (ex: "add-auth")
  name: string; // display name
  description: string; // contexto do trabalho
  branch: string; // git branch (ex: "feat/add-auth")
  status: "active" | "completed";
  createdAt: string;
  updatedAt: string;
}
```

```typescript
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  branch: text("branch").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

### Environment — TBD no M2

Env management (global + override por repo) será definido no design do M2.

### DesktopBridge (IPC)

```typescript
// packages/contracts/src/ipc.ts
interface DesktopBridge {
  getAppInfo(): Promise<{
    version: string;
    platform: NodeJS.Platform;
    isDev: boolean;
  }>;
}
```

---

## Build & Dev Configuration

### tsdown.config.ts (apps/desktop/)

```typescript
import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".js" }),
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
    noExternal: (id) => id.startsWith("@iara/"),
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
  },
]);
```

### vite.config.ts (apps/web/)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});
```

### tsconfig.base.json (root)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useDefineForClassFields": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

### turbo.json (root)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "dist-electron/**"]
    },
    "dev": {
      "dependsOn": ["@iara/contracts#build"],
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": [],
      "cache": false
    },
    "test": {
      "dependsOn": ["^build"],
      "cache": false,
      "outputs": []
    }
  }
}
```

### .mise.toml (root)

```toml
[tools]
node = "24.13.1"
bun = "1.3.9"
```

---

## Error Handling Strategy

| Error Scenario                     | Handling                                | User Impact                         |
| ---------------------------------- | --------------------------------------- | ----------------------------------- |
| SQLite database corrupted          | Recreate DB, log warning                | Data loss (M2 tasks), app continues |
| git not installed                  | Check on startup, show error in shell   | App opens but git ops disabled      |
| git worktree add fails             | Return typed error via service          | Vitest catches, M2 shows in UI      |
| better-sqlite3 native module crash | Catch in main process, log              | App may need restart                |
| Vite dev server fails to start     | Dev script retries, shows port conflict | Developer sees error in terminal    |

---

## Tech Decisions

| Decision             | Choice                                | Rationale                                                            |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| SQLite driver        | better-sqlite3 12.x                   | Drizzle recommended, disk-native, sync API. Requer @electron/rebuild |
| Drizzle version      | 0.45.x (stable)                       | Beta 1.0 muito recente, preferir estável                             |
| Migrations dir       | `apps/desktop/drizzle/`               | Convenção drizzle-kit, fora de src/                                  |
| Router history       | createHashHistory() em prod           | Evita 404 em builds empacotados. Browser history em dev              |
| Packages internos    | Source .ts direto (sem pre-build)     | Bundler do consumidor resolve. Mesmo pattern do t3code               |
| Dev scripts          | Bun scripts simples                   | Sem Effect CLI — complexidade desnecessária para M1                  |
| Component primitives | @base-ui/react + CVA + tailwind-merge | Mesmo approach do t3code. Componentes próprios, sem shadcn           |
| Contracts exports    | Barrel index (re-exports)             | Package pequeno e schema-only. Migrar para subpath se crescer        |

---

## Filesystem Structure (User Data)

```
Electron userData (~/.config/iara/ no Linux)
├── config.json              # { projectsDir: "~/iara", theme: "system" }
├── iara.db                  # SQLite (Drizzle managed)
└── cache/                   # Regenerável
    ├── plugins/
    └── hooks/

Projects dir (~/iara/ — configurável, lido de config.json)
└── <project_slug>/
    ├── PROJECT.md           # System prompt do projeto
    ├── .repos/
    │   ├── <repo>/          # Clone do repo original
    │   └── <repo>/          # Clone
    └── <task_slug>/
        ├── TASK.md          # System prompt da task
        ├── PROJECT.md → ../PROJECT.md
        ├── <repo>/          # Git worktree de .repos/<repo>
        ├── <repo>/          # Git worktree
        ├── .env.<repo>.global → symlink
        ├── .env.<repo>.override
        └── .env             # Merged (auto-gerado)
```

---

## Gotchas Documentados

1. **better-sqlite3 + Electron 40**: Prebuilt binaries podem faltar para Node 24. `@electron/rebuild` obrigatório como devDependency. Rodar rebuild no postinstall ou build script.
2. **drizzle-kit vs Electron**: drizzle-kit roda no Node do sistema. Migrations geradas em `apps/desktop/drizzle/`. Em runtime, Drizzle aplica migrations via `migrate()` no main process (Node do Electron).
3. **TanStack Router em prod**: Usar `createHashHistory()` em builds empacotados para evitar 404.
4. **SQLite só roda no main process**: Toda query passa por IPC. Renderer nunca acessa DB diretamente.
5. **syncShellEnvironment**: Necessário no macOS (importa PATH de login shell). Linux/Windows já têm PATH disponível no process.env.
