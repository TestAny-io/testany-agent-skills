#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
set -eu
script_dir=$(CDPATH='' cd -- "$(/usr/bin/dirname -- "$0")" && pwd -P)
workspace=${SKILLDOCK_WORKSPACE_RUNTIME:-"$HOME/.cache/codex-runtimes/codex-primary-runtime"}
state=${SKILLDOCK_STATE_DIR:-"$HOME/.local/share/skilldock"}
path_node=$(command -v node || true)
app=${SKILLDOCK_CODEX_APP_DIR:-/Applications/ChatGPT.app}

# This Node only runs the dependency-free bootstrap. That program selects a
# build-capable Node/npm pair before running the application launcher.
for candidate in "${SKILLDOCK_NODE_BIN:-}" "$workspace/dependencies/node/bin/node" "$state"/node/node-v*-darwin-*/bin/node "$path_node" \
  "$app/Contents/Resources/cua_node/bin/node" \
  "$app/Contents/Resources/node" \
  /Applications/Codex.app/Contents/Resources/cua_node/bin/node \
  /Applications/Codex.app/Contents/Resources/node \
  "$HOME/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" \
  "$HOME/Applications/ChatGPT.app/Contents/Resources/node" \
  "$HOME/Applications/Codex.app/Contents/Resources/cua_node/bin/node" \
  "$HOME/Applications/Codex.app/Contents/Resources/node"; do
  case "$candidate" in /*) ;; *) continue ;; esac
  if [ -x "$candidate" ] && "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)' >/dev/null 2>&1; then
    exec "$candidate" "$script_dir/bootstrap.mjs" "$@"
  fi
done
printf '%s\n' 'SkillDock：未找到可运行引导程序的 Node.js。请使用当前 Codex macOS 桌面应用；若应用装在自定义目录，可通过 SKILLDOCK_CODEX_APP_DIR 指定其绝对路径。' >&2
exit 1
