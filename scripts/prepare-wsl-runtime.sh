#!/bin/bash
set -euo pipefail

# Prepare Linux runtime for WSL server execution.
# Downloads Node.js Linux binary and rebuilds native modules for Linux Node.js.
# Runs on Linux (WSL or CI).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$ROOT_DIR/apps/server"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
RUNTIME_DIR="$DESKTOP_DIR/resources/wsl-runtime"

# Detect Node.js version from current runtime
NODE_VERSION="${NODE_VERSION:-$(node -e "console.log(process.version)")}"
NODE_VERSION_NUM="${NODE_VERSION#v}"
ARCH="x64"

echo "==> Preparing WSL runtime (Node.js $NODE_VERSION, linux-$ARCH)"

# ---------------------------------------------------------------------------
# 1. Download Node.js Linux binary
# ---------------------------------------------------------------------------
NODE_DIR="$RUNTIME_DIR/node"
if [ -f "$NODE_DIR/bin/node" ]; then
  EXISTING_VERSION=$("$NODE_DIR/bin/node" --version 2>/dev/null || echo "none")
  if [ "$EXISTING_VERSION" = "$NODE_VERSION" ]; then
    echo "==> Node.js $NODE_VERSION already downloaded"
  else
    echo "==> Updating Node.js from $EXISTING_VERSION to $NODE_VERSION"
    rm -rf "$NODE_DIR"
  fi
fi

if [ ! -f "$NODE_DIR/bin/node" ]; then
  echo "==> Downloading Node.js $NODE_VERSION for linux-$ARCH..."
  mkdir -p "$NODE_DIR"
  URL="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-$ARCH.tar.xz"
  curl -fsSL "$URL" | tar xJ --strip-components=1 -C "$NODE_DIR"
  # Strip debug symbols and remove unnecessary files (npm, docs, etc.)
  strip "$NODE_DIR/bin/node" 2>/dev/null || true
  rm -rf "$NODE_DIR/lib/node_modules" "$NODE_DIR/share" "$NODE_DIR/include" \
         "$NODE_DIR/CHANGELOG.md" "$NODE_DIR/LICENSE" "$NODE_DIR/README.md" \
         "$NODE_DIR/bin/npm" "$NODE_DIR/bin/npx" "$NODE_DIR/bin/corepack"
  echo "==> Downloaded: $NODE_DIR/bin/node ($(du -sh "$NODE_DIR/bin/node" | cut -f1))"
fi

# ---------------------------------------------------------------------------
# 2. Rebuild node-pty for Linux Node.js (not Electron)
# ---------------------------------------------------------------------------
echo "==> Rebuilding node-pty for Node.js $NODE_VERSION (linux-$ARCH)..."
NATIVE_DIR="$RUNTIME_DIR/native_modules"
mkdir -p "$NATIVE_DIR"

# Rebuild node-pty targeting the downloaded Node.js (not Electron)
cd "$SERVER_DIR/node_modules/node-pty"
"$NODE_DIR/bin/node" "$(which npx)" node-gyp rebuild --target="$NODE_VERSION_NUM" --arch="$ARCH" 2>&1 | tail -10 || {
  # Fallback: use system node-gyp directly
  echo "==> Trying direct node-gyp rebuild..."
  npx node-gyp rebuild --target="$NODE_VERSION_NUM" --arch="$ARCH" --nodedir="$NODE_DIR" 2>&1 | tail -10
}
cd "$ROOT_DIR"

# Copy the rebuilt binary
mkdir -p "$NATIVE_DIR/node-pty/build/Release"
cp "$SERVER_DIR/node_modules/node-pty/build/Release/pty.node" "$NATIVE_DIR/node-pty/build/Release/"
echo "==> Rebuilt: $NATIVE_DIR/node-pty/build/Release/pty.node"

# ---------------------------------------------------------------------------
# 3. Install @parcel/watcher Linux native addon
# ---------------------------------------------------------------------------
echo "==> Installing @parcel/watcher-linux-x64-glibc..."
PARCEL_DIR="$NATIVE_DIR/@parcel/watcher-linux-x64-glibc"
if [ ! -d "$PARCEL_DIR" ]; then
  mkdir -p "$NATIVE_DIR/@parcel"
  cd /tmp
  npm pack @parcel/watcher-linux-x64-glibc 2>/dev/null
  TARBALL=$(ls parcel-watcher-linux-x64-glibc-*.tgz 2>/dev/null | head -1)
  if [ -n "$TARBALL" ]; then
    mkdir -p "$PARCEL_DIR"
    tar xzf "$TARBALL" --strip-components=1 -C "$PARCEL_DIR"
    rm -f "$TARBALL"
    echo "==> Installed: $PARCEL_DIR"
  else
    echo "WARN: Could not download @parcel/watcher-linux-x64-glibc"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==> WSL runtime ready at: $RUNTIME_DIR"
echo "    Node.js: $NODE_DIR/bin/node ($NODE_VERSION)"
echo "    node-pty: $NATIVE_DIR/node-pty/build/Release/pty.node"
echo "    @parcel/watcher: $NATIVE_DIR/@parcel/watcher-linux-x64-glibc/"
ls -lh "$NODE_DIR/bin/node" "$NATIVE_DIR/node-pty/build/Release/pty.node"
