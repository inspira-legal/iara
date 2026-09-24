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

# Expand ~ to $HOME (shell doesn't expand ~ in variables).
# printf, not echo: sh's echo interprets escapes like \c and \n in the path.
expand_path() {
  case "$1" in
    "~/"*) printf '%s\n' "${HOME}${1#"~"}" ;;
    "~") printf '%s\n' "$HOME" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# Fallback for realpath without -m (e.g. macOS): walk the path component by
# component like the kernel does, following symlinks as they appear, so ".."
# applies after a link is followed. Components that don't exist are taken
# literally. Prints nothing (caller blocks) on a symlink loop.
physical_path() {
  case "$1" in
    /*) REST="$1" ;;
    *) REST="$(pwd -P)/$1" ;;
  esac
  OUT=""
  HOPS=0
  while [ -n "$REST" ]; do
    case "$REST" in
      */*) C="${REST%%/*}"; REST="${REST#*/}" ;;
      *) C="$REST"; REST="" ;;
    esac
    case "$C" in
      "" | .) continue ;;
      ..) OUT="${OUT%/*}"; continue ;;
    esac
    if [ -L "$OUT/$C" ]; then
      HOPS=$((HOPS + 1))
      [ "$HOPS" -gt 40 ] && return 1
      T=$(readlink "$OUT/$C") || return 1
      case "$T" in /*) OUT="" ;; esac
      REST="$T${REST:+/$REST}"
    else
      OUT="$OUT/$C"
    fi
  done
  printf '%s\n' "${OUT:-/}"
}

# Resolve a path: expand ~, then resolve with realpath
resolve_path() {
  EXPANDED=$(expand_path "$1")
  realpath -m "$EXPANDED" 2>/dev/null || physical_path "$EXPANDED"
}

# Respect opt-out
[ "$IARA_GUARDRAILS" = "off" ] && exit 0
# Need workspace dir to check paths
[ -z "$IARA_WORKSPACE_DIR" ] && exit 0
# Compare physical paths on both sides (e.g. macOS /var -> /private/var)
WS=$(resolve_path "$IARA_WORKSPACE_DIR")
[ -z "$WS" ] && WS="$IARA_WORKSPACE_DIR"

# Read stdin
INPUT=$(cat)

# Extract tool_name (e.g. "Bash", "Edit", "Write")
TOOL_NAME=$(printf '%s\n' "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"//;s/"//')

# --- Edit / Write: check file_path ---
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH=$(printf '%s\n' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"//')

  if [ -n "$FILE_PATH" ]; then
    RESOLVED=$(resolve_path "$FILE_PATH")
    case "$RESOLVED" in
      "$WS"/*|"$WS") ;;
      *) printf '%s\n' "$TOOL_NAME blocked: file path \"$FILE_PATH\" is outside the workspace \"$IARA_WORKSPACE_DIR\". Only files within your workspace directory can be modified." >&2; exit 2 ;;
    esac
  fi
  exit 0
fi

# --- Bash: check command ---
if [ "$TOOL_NAME" = "Bash" ]; then
  # Extract command value — may contain escaped quotes, grab between first ": " and end
  COMMAND=$(printf '%s\n' "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

  # Check absolute paths and ~/paths in the command
  ABS_PATHS=$(printf '%s\n' "$COMMAND" | grep -oE '(^|[[:space:]="])(~?/[^[:space:]"'\''|;&><()]+)' | grep -oE '~?/[^[:space:]"'\''|;&><()]+')
  printf '%s\n' "$ABS_PATHS" | while IFS= read -r P; do
    [ -z "$P" ] && continue
    RESOLVED=$(resolve_path "$P")
    case "$RESOLVED" in
      "$WS"/*|"$WS") ;;
      *) printf '%s\n' "Bash blocked: command references path \"$P\" which is outside the workspace \"$IARA_WORKSPACE_DIR\". Only operations within your workspace directory are allowed." >&2; exit 2 ;;
    esac
  done
  # Propagate subshell exit code (pipe creates subshell)
  [ $? -ne 0 ] && exit 2

  exit 0
fi

# All other tools — allow
exit 0
