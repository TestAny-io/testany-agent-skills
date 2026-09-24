#!/bin/sh
set -eu
NODE_BIN=$(printenv TEAMDESK_NODE || true)
if [ -z "$NODE_BIN" ]; then
  for candidate in /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node /Applications/Codex.app/Contents/Resources/cua_node/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
  done
fi
if [ -z "$NODE_BIN" ]; then NODE_BIN=$(command -v node || true); fi
if [ -z "$NODE_BIN" ]; then
  printf '%s\n' 'TeamDesk 需要 Node.js 22.13+。请让 Codex 检查本机已有 Node 运行时，或从 nodejs.org 安装。'
  exit 1
fi
if ! "$NODE_BIN" --input-type=module -e 'import {DatabaseSync} from "node:sqlite";' >/dev/null 2>&1; then
  printf '%s\n' '当前 Node 不支持 node:sqlite，请通过 TEAMDESK_NODE 指定 Node.js 22.13+。'
  exit 1
fi
if [ "${1:-}" = "install-icon" ]; then
  exec "$NODE_BIN" "$(dirname "$0")/install-launcher.mjs"
fi
exec "$NODE_BIN" "$(dirname "$0")/launcher.mjs" "$@"
