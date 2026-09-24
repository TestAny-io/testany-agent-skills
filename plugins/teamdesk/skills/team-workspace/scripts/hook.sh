#!/bin/sh
set -eu
NODE_BIN=$(printenv TEAMDESK_NODE || true)
if [ -z "$NODE_BIN" ]; then
  for candidate in /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node /Applications/Codex.app/Contents/Resources/cua_node/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
  done
fi
if [ -z "$NODE_BIN" ]; then NODE_BIN=$(command -v node || true); fi
if [ -z "$NODE_BIN" ]; then printf '%s\n' '{"systemMessage":"TeamDesk 需要 Node.js 22.13 或更高版本。"}'; exit 0; fi
exec "$NODE_BIN" "$(dirname "$0")/hook.mjs"
