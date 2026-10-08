#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
set -eu
script_dir=$(CDPATH='' cd -- "$(/usr/bin/dirname -- "$0")" && pwd -P)

# Discovery runs the bundled MCP server only; opening the UI starts the application.
# It never shows a dialog, downloads or builds (HLD 3.10).
# BEGIN node-candidates (generated from assets/app/server/node-candidates.mjs; run `node assets/app/scripts/node-candidates.mjs --write`)
state=${SKILLDOCK_STATE_DIR:-"$HOME/.local/share/skilldock"}
saved_node=$(/usr/bin/head -n 1 "$state/settings/node-path" 2>/dev/null || true)
workspace=${SKILLDOCK_WORKSPACE_RUNTIME:-"$HOME/.cache/codex-runtimes/codex-primary-runtime"}
nvm_dir=${NVM_DIR:-"$HOME/.nvm"}
fnm_dir=${FNM_DIR:-"$HOME/.local/share/fnm"}
fnm_mac="$HOME/Library/Application Support/fnm"
volta_home=${VOLTA_HOME:-"$HOME/.volta"}
asdf_dir=${ASDF_DATA_DIR:-"$HOME/.asdf"}
mise_dir=${MISE_DATA_DIR:-"$HOME/.local/share/mise"}
nodenv_root=${NODENV_ROOT:-"$HOME/.nodenv"}
path_node=$(command -v node || true)
app=${SKILLDOCK_CODEX_APP_DIR:-/Applications/ChatGPT.app}
node_bin=
for candidate in "${SKILLDOCK_NODE_BIN:-}" \
  "$saved_node" \
  "$workspace"/dependencies/node/bin/node \
  "$state"/node/node-v*-darwin-*/bin/node \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  "$nvm_dir"/versions/node/v*/bin/node \
  "$fnm_dir"/node-versions/v*/installation/bin/node \
  "$fnm_mac"/node-versions/v*/installation/bin/node \
  "$volta_home"/tools/image/node/*/bin/node \
  "$asdf_dir"/installs/nodejs/*/bin/node \
  "$mise_dir"/installs/node/*/bin/node \
  "$nodenv_root"/versions/*/bin/node \
  "$path_node" \
  "$app"/Contents/Resources/cua_node/bin/node \
  "$app"/Contents/Resources/node \
  /Applications/Codex.app/Contents/Resources/cua_node/bin/node \
  /Applications/Codex.app/Contents/Resources/node \
  "$HOME"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node \
  "$HOME"/Applications/ChatGPT.app/Contents/Resources/node \
  "$HOME"/Applications/Codex.app/Contents/Resources/cua_node/bin/node \
  "$HOME"/Applications/Codex.app/Contents/Resources/node; do
  case "$candidate" in /*) ;; *) continue ;; esac
  if [ -x "$candidate" ] && "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)' >/dev/null 2>&1; then
    node_bin=$candidate; break
  fi
done
# END node-candidates
if [ -n "$node_bin" ]; then exec "$node_bin" "$script_dir/../assets/native/server.mjs" "$@"; fi
printf '%s\n' 'SkillDock：未找到可运行的 Node.js 22.12 或更新版本。请安装 Node.js（https://nodejs.org）后重启 Codex；也可用 SKILLDOCK_NODE_BIN 指定 Node 的绝对路径。' >&2
exit 1
