# Naming Standard for Code and UI

## Hierarchy

```
Project
└── Workspace (2 types)
    ├── Default Workspace → contains repos
    └── Task Workspace → contains worktrees (of the repos)
```

## Standard Terms

| Concept             | Code (types, vars)   | UI Label             | FS directory     | API value    |
| ------------------- | -------------------- | -------------------- | ---------------- | ------------ |
| Project             | `Project`, `project` | "Project"            | `{projectSlug}/` | `projects.*` |
| Workspace (generic) | `workspace`          | "Workspace"          | —                | —            |
| Default Workspace   | `defaultWorkspace`   | "Default Workspace"  | `default/`       | `"default"`  |
| Task Workspace      | `taskWorkspace`      | "Task Workspace"     | `{taskSlug}/`    | `taskId`     |
| Repo                | `Repo`, `repo`       | "Repo" (always)      | `{repoName}/`    | `repos.*`    |
| Worktree            | `worktree`           | "Worktree" (visible) | `{repoName}/`    | internal     |

## Changes from Current

1. **"Project Workspace" → "Default Workspace"** in UI labels
2. **`"root"` → `"default"`** in workspace identifiers (`context` values, key prefixes)
3. **`context` → `workspace`** in prop/param names where it means workspace selection
4. **`ProjectRootWorkspace` → `DefaultWorkspace`** component + file rename
5. **`createRoot` → `createDefault`** in terminal store
6. **"Repository" → "Repo"** always in UI
7. **Worktree** is now user-facing — shown in task workspace context

## Scope

- Only iara repo (apps/web, apps/server, packages/contracts)
- Do NOT touch iara-deprecated-cli or t3code
