<worktrees>
Your working directory is NOT a git repository. All code and git operations must happen inside the worktree directories listed below.

{{worktree_list}}

The `default/` folder in the project root is a worktree on the `default` branch (the main development branch). Each task folder is its own worktree on a feature branch.

IMPORTANT: Never use `git checkout` to switch branches — each worktree is already locked to its branch. Use `git -C <worktree-path>` to run git commands in a specific worktree (e.g., `git -C {{example_repo_path}} log`).
</worktrees>
