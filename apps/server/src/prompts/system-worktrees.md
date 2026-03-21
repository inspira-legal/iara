<worktrees>
Your working directory is NOT a git repository. All code and git operations must happen inside the worktree directories listed below.

{{worktree_list}}

Each directory is a git worktree locked to its branch. The "origin" path points to the main copy of the repo at `{{default_workspace_path}}`.

IMPORTANT: Never use `git checkout` to switch branches — each worktree is already locked to its branch. Use `git -C <worktree-path>` to run git commands in a specific worktree (e.g., `git -C {{example_repo_path}} log`).
</worktrees>
