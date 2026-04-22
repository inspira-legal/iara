#!/usr/bin/env sh
# Claude Code PreToolUse hook — workspace guardrails.
#
# Reads hook input from stdin (JSON) and blocks:
#   - Edit/Write to file paths outside the workspace directory (all workspaces)
#   - Bash commands with absolute paths outside the workspace directory (all workspaces)
#
# Disabled when IARA_GUARDRAILS=off.
#
# Exit 0 = allow, Exit 2 + stderr = block with message to Claude.

# Expand ~ to $HOME (shell doesn't expand ~ in variables)
expand_path() {
  case "$1" in
    "~/"*) echo "${HOME}${1#"~"}" ;;
    "~") echo "$HOME" ;;
    *) echo "$1" ;;
  esac
}

# Resolve a path: expand ~, resolve symlinks where possible, and normalize
# .. / . components. Cross-platform: macOS BSD realpath + Linux GNU realpath.
resolve_path() {
  EXPANDED=$(expand_path "$1")
  # Ensure absolute path — relative paths are resolved against CWD so that the
  # workspace prefix check works correctly on all platforms.
  case "$EXPANDED" in
    /*) ;;
    *) EXPANDED="$(pwd)/$EXPANDED" ;;
  esac
  # Existing path: use realpath (resolves symlinks, works on both platforms)
  RESOLVED=$(realpath "$EXPANDED" 2>/dev/null)
  [ -n "$RESOLVED" ] && printf '%s\n' "$RESOLVED" && return
  # Non-existing path on Linux: GNU realpath -m resolves .. without existence
  RESOLVED=$(realpath -m "$EXPANDED" 2>/dev/null)
  [ -n "$RESOLVED" ] && printf '%s\n' "$RESOLVED" && return
  # Fallback: awk-based normalization of .. and . (macOS-safe, no external deps)
  printf '%s\n' "$EXPANDED" | awk '{
    n = split($0, a, "/")
    j = 0
    for (i = 1; i <= n; i++) {
      if (a[i] == ".." && j > 0) j--
      else if (a[i] != "" && a[i] != ".") c[++j] = a[i]
    }
    out = (substr($0, 1, 1) == "/") ? "/" : ""
    for (i = 1; i <= j; i++) {
      out = out c[i]
      if (i < j) out = out "/"
    }
    print out
  }'
}

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
    RESOLVED=$(resolve_path "$FILE_PATH")
    case "$RESOLVED" in
      "$IARA_WORKSPACE_DIR"/*|"$IARA_WORKSPACE_DIR") ;;
      *) echo "$TOOL_NAME blocked: file path \"$FILE_PATH\" is outside the workspace \"$IARA_WORKSPACE_DIR\". Only files within your workspace directory can be modified." >&2; exit 2 ;;
    esac
  fi
  exit 0
fi

# --- Bash: check command ---
if [ "$TOOL_NAME" = "Bash" ]; then
  # Extract command value — may contain escaped quotes, grab between first ": " and end
  COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

  # Check absolute paths and ~/paths in the command
  ABS_PATHS=$(echo "$COMMAND" | grep -oE '(^|[[:space:]="])(~?/[^[:space:]"'\''|;&><()]+)' | grep -oE '~?/[^[:space:]"'\''|;&><()]+')
  echo "$ABS_PATHS" | while IFS= read -r P; do
    [ -z "$P" ] && continue
    RESOLVED=$(resolve_path "$P")
    case "$RESOLVED" in
      "$IARA_WORKSPACE_DIR"/*|"$IARA_WORKSPACE_DIR") ;;
      *) echo "Bash blocked: command references path \"$P\" which is outside the workspace \"$IARA_WORKSPACE_DIR\". Only operations within your workspace directory are allowed." >&2; exit 2 ;;
    esac
  done
  # Propagate subshell exit code (pipe creates subshell)
  [ $? -ne 0 ] && exit 2

  exit 0
fi

# All other tools — allow
exit 0
