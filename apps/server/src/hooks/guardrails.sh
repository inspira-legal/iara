#!/usr/bin/env sh
# Claude Code PreToolUse hook — task workspace guardrails.
#
# Reads hook input from stdin (JSON) and blocks:
#   - Edit/Write to file paths outside the workspace directory
#   - Bash commands containing `git checkout`
#   - Bash commands with absolute paths outside the workspace directory
#
# Only active when IARA_WORKSPACE_TYPE=task.
# Disabled when IARA_GUARDRAILS=off.
#
# Exit 0 = allow, Exit 2 + stderr = block with message to Claude.

# Only enforce in task workspaces
[ "$IARA_WORKSPACE_TYPE" != "task" ] && exit 0
# Respect opt-out
[ "$IARA_GUARDRAILS" = "off" ] && exit 0
# Need workspace dir to check paths
[ -z "$IARA_WORKSPACE_DIR" ] && exit 0

# Read stdin
INPUT=$(cat)

# Extract tool_name (e.g. "Bash", "Edit", "Write")
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"//;s/"//')

# --- Edit / Write: check file_path ---
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"//')

  if [ -n "$FILE_PATH" ]; then
    # Resolve path (handle ../ traversal)
    RESOLVED=$(realpath -m "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")
    case "$RESOLVED" in
      "$IARA_WORKSPACE_DIR"/*|"$IARA_WORKSPACE_DIR") ;;
      *) echo "$TOOL_NAME blocked: file path \"$FILE_PATH\" is outside the task workspace \"$IARA_WORKSPACE_DIR\". Only files within your workspace directory can be modified." >&2; exit 2 ;;
    esac
  fi
  exit 0
fi

# --- Bash: check command ---
if [ "$TOOL_NAME" = "Bash" ]; then
  # Extract command value — may contain escaped quotes, grab between first ": " and end
  COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

  # Block git checkout (worktrees are locked to their branch)
  if echo "$COMMAND" | grep -qE '\bgit\b.*\bcheckout\b'; then
    echo "Bash blocked: \"git checkout\" is not allowed in task workspaces. Each worktree is locked to its feature branch." >&2
    exit 2
  fi

  # Check absolute paths in the command
  ABS_PATHS=$(echo "$COMMAND" | grep -oE '(^|[[:space:]="])(/[^[:space:]"'\''|;&><()]+)' | grep -oE '/[^[:space:]"'\''|;&><()]+')
  echo "$ABS_PATHS" | while IFS= read -r P; do
    [ -z "$P" ] && continue
    RESOLVED=$(realpath -m "$P" 2>/dev/null || echo "$P")
    case "$RESOLVED" in
      "$IARA_WORKSPACE_DIR"/*|"$IARA_WORKSPACE_DIR") ;;
      *) echo "Bash blocked: command references path \"$P\" which is outside the task workspace \"$IARA_WORKSPACE_DIR\". Only operations within your workspace directory are allowed." >&2; exit 2 ;;
    esac
  done
  # Propagate subshell exit code (pipe creates subshell)
  [ $? -ne 0 ] && exit 2

  exit 0
fi

# All other tools — allow
exit 0
