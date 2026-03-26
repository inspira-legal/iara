<env-files>
{{env_file}}  ← single source of truth for all env vars (TOML format, one section per service)

Each service section in env.toml generates a flat .env file in its repo worktree. To add or change env vars, edit env.toml (NOT .env inside repos — those are auto-generated). Changes take effect on next session restart.
</env-files>
