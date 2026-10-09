#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
set -eu
script_dir=$(CDPATH='' cd -- "$(/usr/bin/dirname -- "$0")" && pwd -P)

# This Node only runs the dependency-free bootstrap. That program selects a
# build-capable Node/npm pair (HLD 3.10) before running the application launcher.
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
skilldock_node_version() {
  case "$1" in /*) ;; *) return 1 ;; esac
  [ -x "$1" ] || return 1
  "$1" -e 'const v=process.versions.node.split(".").map(Number);if(v[0]>22||v[0]===22&&v[1]>=12)process.stdout.write(String(v[0]*1e6+v[1]*1e3+v[2]));else process.exit(1)' 2>/dev/null
}
skilldock_pick() {
  [ -z "$node_bin" ] || return 0
  skilldock_best=; skilldock_best_version=0
  for skilldock_candidate in "$@"; do
    skilldock_version=$(skilldock_node_version "$skilldock_candidate") || continue
    case "$skilldock_version" in ""|*[!0-9]*) continue ;; esac
    if [ "$skilldock_version" -gt "$skilldock_best_version" ]; then skilldock_best=$skilldock_candidate; skilldock_best_version=$skilldock_version; fi
  done
  if [ -n "$skilldock_best" ]; then node_bin=$skilldock_best; fi
  return 0
}
skilldock_pick "${SKILLDOCK_NODE_BIN:-}"
skilldock_pick "$saved_node"
skilldock_pick "$workspace"/dependencies/node/bin/node
skilldock_pick "$state"/node/node-v*-darwin-*/bin/node
skilldock_pick /opt/homebrew/bin/node
skilldock_pick /usr/local/bin/node
skilldock_pick "$nvm_dir"/versions/node/v*/bin/node
skilldock_pick "$fnm_dir"/node-versions/v*/installation/bin/node
skilldock_pick "$fnm_mac"/node-versions/v*/installation/bin/node
skilldock_pick "$volta_home"/tools/image/node/*/bin/node
skilldock_pick "$asdf_dir"/installs/nodejs/*/bin/node
skilldock_pick "$mise_dir"/installs/node/*/bin/node
skilldock_pick "$nodenv_root"/versions/*/bin/node
skilldock_pick "$path_node"
skilldock_pick "$app"/Contents/Resources/cua_node/bin/node
skilldock_pick "$app"/Contents/Resources/node
skilldock_pick /Applications/Codex.app/Contents/Resources/cua_node/bin/node
skilldock_pick /Applications/Codex.app/Contents/Resources/node
skilldock_pick "$HOME"/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node
skilldock_pick "$HOME"/Applications/ChatGPT.app/Contents/Resources/node
skilldock_pick "$HOME"/Applications/Codex.app/Contents/Resources/cua_node/bin/node
skilldock_pick "$HOME"/Applications/Codex.app/Contents/Resources/node
# END node-candidates
if [ -n "$node_bin" ]; then exec "$node_bin" "$script_dir/bootstrap.mjs" "$@"; fi
message='SkillDock：未找到可运行的 Node.js 22.12 或更新版本。请安装 Node.js（https://nodejs.org）后重新打开；也可用 SKILLDOCK_NODE_BIN 指定 Node 的绝对路径。'
# Interactive starts show the guidance dialog in its own process; restart jobs and
# headless runs (SKILLDOCK_NO_DIALOG=1) do not.
case "${1:-start}" in
  start|restart)
    if [ -z "${SKILLDOCK_RESTART_JOB:-}" ] && [ "${SKILLDOCK_NO_DIALOG:-}" != 1 ] && [ -x /usr/bin/osascript ]; then
      # Its own process group where the shell has job control, so a host that ends this
      # call's process group does not close the dialog (HLD 3.10).
      ( set +e; if (set -m) 2>/dev/null; then set -m 2>/dev/null; fi
        /usr/bin/osascript "$script_dir/node-guide.applescript" "SKILLDOCK_STATE_DIR=$state" "PORT=${PORT:-4771}" \
          "SKILLDOCK_PROJECT_DIR=${SKILLDOCK_PROJECT_DIR:-}" /bin/sh "$script_dir/launch.sh" "$@" </dev/null >/dev/null 2>&1 & )
      message="$message 已显示安装引导。"
    fi ;;
esac
printf '%s\n' "$message" >&2
exit 1
